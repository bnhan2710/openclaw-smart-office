#!/usr/bin/env node
/**
 * generate.js — Xuất file DOCX/PDF từ nội dung văn bản đã soạn sẵn
 *
 * Script này KHÔNG gọi LLM. Agent (OpenClaw) đã soạn nội dung
 * và truyền vào qua --content. Script chỉ đảm nhiệm:
 *  1. Đọc content text
 *  2. Áp dụng template DOCX (nếu có)
 *  3. Xuất file .docx/.pdf chuẩn định dạng hành chính
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { parseArgs } from "util";
import { fileURLToPath } from "url";
import { getDatabase, storeDocument, storeExtraction } from "../../../lib/database.js";
import { fileHash } from "../../../lib/documents.js";
import { analyzeAdministrativeDocument } from "../../../lib/review.js";
import { printEnvelope, printError } from "../../../lib/response.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const SKILL_DIR = path.resolve(__dirname, "..");
const INFERRED_WORKSPACE_DIR = path.resolve(SKILL_DIR, "../..");
const WORKSPACE_DIR = resolveWorkspaceDir();
const TEMPLATES_DIR = path.resolve(__dirname, "../templates");

function canWriteDirectory(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveWorkspaceDir() {
  const configured = String(process.env.OPENCLAW_WORKSPACE_DIR || "").trim();
  if (configured) {
    const resolved = path.resolve(configured);
    if (canWriteDirectory(resolved)) {
      return resolved;
    }
  }
  return INFERRED_WORKSPACE_DIR;
}

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
  coQuanTen: process.env.CO_QUAN_TEN ?? "ĐƠN VỊ",
  coQuanKyHieu: process.env.CO_QUAN_KY_HIEU ?? "DV",
  outputDir: process.env.OUTPUT_DIR ?? "./output/van-ban",
};

const DOCUMENT_TYPES = {
  "cong-van": { label: "Công văn", kyHieu: "CV", template: "cong-van.docx" },
  "to-trinh": { label: "Tờ trình", kyHieu: "TTr", template: "to-trinh.docx" },
  "bien-ban": { label: "Biên bản", kyHieu: "BB", template: "bien-ban.docx" },
};

// ── CLI args ──────────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    type: { type: "string", short: "t" },
    content: { type: "string", short: "c" },
    "content-file": { type: "string" }, // đọc content từ file nếu quá dài
    output: { type: "string", short: "o" },
    format: { type: "string", short: "f" },
    number: { type: "string", short: "n" },
    review: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Sử dụng: node generate.js --type <loại> --content "<nội_dung>" [--format docx|pdf|both] [--output <file>]

Loại (--type):  cong-van | to-trinh | bien-ban

Tham số:
  --content, -c       Nội dung văn bản đã soạn (do agent cung cấp)
  --content-file      Đọc nội dung từ file text (dùng khi nội dung dài)
  --format, -f        Định dạng xuất: docx | pdf | both (mặc định: docx)
  --review             Kiểm tra trường hành chính bắt buộc trước khi xuất
  --number, -n        Số hiệu văn bản (tuỳ chọn, tự sinh nếu bỏ qua)
  --output, -o        Tên file xuất (mặc định: <type>-<so_hieu>.<ext>)

Biến môi trường:
  CO_QUAN_TEN         Tên cơ quan (mặc định: ĐƠN VỊ)
  CO_QUAN_KY_HIEU     Ký hiệu cơ quan (mặc định: DV)
  OUTPUT_DIR          Thư mục xuất, tương đối theo workspace (mặc định: ./output/van-ban)

Ví dụ (agent gọi):
  node generate.js --type cong-van --content-file /tmp/draft.txt --output cv-001.docx
  node generate.js --type cong-van --content-file /tmp/draft.txt --format pdf --output cv-001.pdf
`);
  process.exit(0);
}

if (!args.type || !DOCUMENT_TYPES[args.type]) {
  console.error(`❌ Loại không hợp lệ. Dùng: ${Object.keys(DOCUMENT_TYPES).join(", ")}`);
  process.exit(1);
}

const VALID_FORMATS = new Set(["docx", "pdf", "both"]);

function resolveOutputDir() {
  const configured = String(CONFIG.outputDir || "").trim();
  if (!configured) {
    return path.resolve(WORKSPACE_DIR, "output/van-ban");
  }
  return path.isAbsolute(configured)
    ? path.resolve(configured)
    : path.resolve(WORKSPACE_DIR, configured);
}

function normalizeFormat(rawFormat, outputName) {
  const fromArg = String(rawFormat || "").trim().toLowerCase();
  if (fromArg) {
    if (!VALID_FORMATS.has(fromArg)) {
      throw new Error('Định dạng không hợp lệ. Dùng: docx, pdf, both');
    }
    return fromArg;
  }
  const ext = outputName ? path.extname(outputName).toLowerCase() : "";
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  return "docx";
}

function splitLines(text) {
  return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
}

function normalizeDocumentContent(text) {
  const rawLines = splitLines(text)
    .map((line) => line.replace(/\t/g, " ").replace(/[ \u00A0]+$/g, ""))
    .filter((line) => !/^```/.test(line.trim()));
  const firstDocumentLine = rawLines.findIndex((line) =>
    /^(CÔNG VĂN|TỜ TRÌNH|BIÊN BẢN|BÁO CÁO|Kính gửi|Kính trình|Căn cứ|UBND|CỘNG HÒA)/i.test(line.trim()),
  );
  const selected = firstDocumentLine >= 0 ? rawLines.slice(firstDocumentLine) : rawLines;
  const cleaned = [];

  for (const line of selected) {
    const trimmed = line.trim();
    if (/^---+$/.test(trimmed)) continue;
    if (/^(\[\[reply_to_current\]\]\s*)?Đã rõ[.!,:;–-]?/i.test(trimmed)) continue;
    if (/^Mình sẽ\s+/i.test(trimmed)) continue;
    if (/^Tôi sẽ\s+/i.test(trimmed)) continue;
    if (/^Do môi trường/i.test(trimmed)) continue;
    if (/^Bạn gửi tiếp/i.test(trimmed)) continue;
    if (/^Ngay khi\b/i.test(trimmed)) continue;

    cleaned.push(line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\s*[-*]\s+\[ \]\s+/, "- ")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .trim());
  }

  while (cleaned.length && cleaned[0] === "") cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1] === "") cleaned.pop();

  const compacted = [];
  for (const line of cleaned) {
    if (line === "" && compacted[compacted.length - 1] === "") continue;
    compacted.push(line);
  }
  return compacted.join("\n");
}

function stripExistingAdministrativeHeader(text) {
  const lines = splitLines(text);
  const titleIndex = lines.findIndex((line) => isDocumentTitle(line.trim()));
  return titleIndex > 0 ? lines.slice(titleIndex).join("\n") : text;
}

function vietnameseDate(date = new Date()) {
  return `ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`;
}

function isDocumentTitle(trimmed) {
  return /^(CÔNG VĂN|TỜ TRÌNH|BIÊN BẢN|BÁO CÁO)$/i.test(trimmed);
}

function isSubjectLine(trimmed) {
  return /^(V\/v|Về việc)\b/i.test(trimmed);
}

function isNationalHeader(trimmed) {
  return /^(CỘNG HÒA|Độc lập|UBND|ỦY BAN|PHÒNG|Số:)/i.test(trimmed);
}

function isDateLine(trimmed) {
  return /ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}/i.test(trimmed);
}

function isSectionHeading(trimmed) {
  return /^([IVX]+\.|[A-ZĐ]\.|Điều\s+\d+\.?)\s+/.test(trimmed) || /^[IVX]+\.\s*[^.]+$/i.test(trimmed);
}

function isListLine(trimmed) {
  return /^(\d+[.)]|[-+•])\s+/.test(trimmed);
}

function isSignatureLine(trimmed) {
  return /^(TM\.|KT\.|CHỦ TỊCH|PHÓ CHỦ TỊCH|TRƯỞNG PHÒNG|THỦ TRƯỞNG|NGƯỜI LẬP|CHỦ TRÌ|Ký,|Ký tên|\[CHỨC VỤ)/i.test(trimmed);
}

function isCenteredLine(trimmed) {
  return isDocumentTitle(trimmed) || isSubjectLine(trimmed) || isNationalHeader(trimmed);
}

function isBoldLine(trimmed) {
  return isDocumentTitle(trimmed) || isNationalHeader(trimmed) || isSectionHeading(trimmed) || isSignatureLine(trimmed);
}

function paragraphOptions(trimmed) {
  if (!trimmed) return { skip: true };
  if (isDateLine(trimmed)) return { alignment: "RIGHT", before: 120, after: 180, firstLine: 0, italic: true };
  if (isDocumentTitle(trimmed)) return { alignment: "CENTER", before: 180, after: 60, firstLine: 0, bold: true, size: 28 };
  if (isSubjectLine(trimmed)) return { alignment: "CENTER", before: 0, after: 180, firstLine: 0, italic: true };
  if (isNationalHeader(trimmed)) return { alignment: "CENTER", before: 0, after: 0, firstLine: 0, bold: true };
  if (isSignatureLine(trimmed)) return { alignment: "RIGHT", before: 0, after: 0, firstLine: 0, bold: true };
  if (/^Nơi nhận:/i.test(trimmed)) return { alignment: "LEFT", before: 180, after: 0, firstLine: 0, bold: true };
  if (isSectionHeading(trimmed)) return { alignment: "LEFT", before: 180, after: 60, firstLine: 0, bold: true };
  if (isListLine(trimmed)) return { alignment: "JUSTIFIED", before: 0, after: 0, firstLine: 0, hanging: 360 };
  if (/^Kính (gửi|trình)/i.test(trimmed)) return { alignment: "LEFT", before: 120, after: 120, firstLine: 0 };
  return { alignment: "JUSTIFIED", before: 0, after: 60, firstLine: 567 };
}

function docxAlignment(value, AlignmentType) {
  return AlignmentType[value] ?? AlignmentType.JUSTIFIED;
}

function buildOutputTargets(params) {
  const { format, output, type, soHieu } = params;
  const safeSoHieu = soHieu.replace(/\//g, "-");
  const baseDefault = `${type}-${safeSoHieu}`;
  const outputDir = resolveOutputDir();
  const requested = output?.trim() ? output.trim() : "";
  const ext = requested ? path.extname(requested).toLowerCase() : "";
  const baseWithoutExt = requested
    ? ext
      ? requested.slice(0, -ext.length)
      : requested
    : baseDefault;

  if (format === "both") {
    return {
      docx: path.resolve(outputDir, `${baseWithoutExt}.docx`),
      pdf: path.resolve(outputDir, `${baseWithoutExt}.pdf`),
    };
  }
  if (format === "pdf") {
    const fileName = requested || `${baseDefault}.pdf`;
    return { pdf: path.resolve(outputDir, ext === ".pdf" ? fileName : `${baseWithoutExt}.pdf`) };
  }
  const fileName = requested || `${baseDefault}.docx`;
  return { docx: path.resolve(outputDir, ext === ".docx" ? fileName : `${baseWithoutExt}.docx`) };
}

function formatMediaPath(filePath) {
  const relative = path.relative(WORKSPACE_DIR, filePath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return `./${relative.replace(/\\/g, "/")}`;
  }
  return filePath;
}

// ── DOCX generation ───────────────────────────────────────────────────────────
async function exportDocx(text, outputPath, templateName, meta) {
  const templatePath = path.join(TEMPLATES_DIR, templateName);

  // Thử dùng template docxtemplater nếu có
  if (fs.existsSync(templatePath)) {
    try {
      const PizZip = (await import("pizzip")).default;
      const Docxtemplater = (await import("docxtemplater")).default;
      const zip = new PizZip(fs.readFileSync(templatePath, "binary"));
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
      doc.render({
        content: text,
        generated_date: new Date().toLocaleDateString("vi-VN"),
      });
      fs.writeFileSync(outputPath, doc.getZip().generate({ type: "nodebuffer" }));
      return "template";
    } catch {
      // Fall through — dùng docx library
    }
  }

  // Fallback: tạo DOCX hành chính với font Times New Roman 13pt và lề A4 chuẩn.
  const { Document, Paragraph, TextRun, Packer, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } = await import("docx").catch(() => {
    throw new Error("Cần cài đặt: npm install docx");
  });
  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };
  const headerRun = (text, bold = true) => new TextRun({ text, font: "Times New Roman", size: 26, bold });
  const headerParagraph = (text, alignment = AlignmentType.CENTER, bold = true) => new Paragraph({
    alignment,
    spacing: { before: 0, after: 0, line: 276 },
    children: [headerRun(text, bold)],
  });
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 43, type: WidthType.PERCENTAGE },
            borders: noBorders,
            children: [
              headerParagraph(CONFIG.coQuanTen.toUpperCase()),
              headerParagraph(`Số: ${meta.soHieu}`, AlignmentType.CENTER, false),
            ],
          }),
          new TableCell({
            width: { size: 57, type: WidthType.PERCENTAGE },
            borders: noBorders,
            children: [
              headerParagraph("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"),
              headerParagraph("Độc lập - Tự do - Hạnh phúc"),
            ],
          }),
        ],
      }),
    ],
  });
  const dateParagraph = headerParagraph(`${process.env.DIA_DANH || "[Địa danh]"}, ${vietnameseDate()}`, AlignmentType.RIGHT, false);

  const paragraphs = splitLines(stripExistingAdministrativeHeader(text)).map((line) => {
    const trimmed = line.trim();
    const options = paragraphOptions(trimmed);
    if (options.skip) return null;

    return new Paragraph({
      alignment: docxAlignment(options.alignment, AlignmentType),
      spacing: {
        before: options.before,
        after: options.after,
        line: 276,
      },
      indent: options.hanging
        ? { left: options.hanging, hanging: options.hanging }
        : { firstLine: options.firstLine },
      children: [
        new TextRun({
          text: trimmed,
          font: "Times New Roman",
          size: options.size ?? 26, // 13pt
          bold: options.bold ?? isBoldLine(trimmed),
          italics: options.italic ?? false,
        }),
      ],
    });
  }).filter(Boolean);

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1134,
            bottom: 1134,
            left: 1701,
            right: 1134,
          },
        },
      },
      children: [headerTable, dateParagraph, ...paragraphs],
    }],
  });
  fs.writeFileSync(outputPath, await Packer.toBuffer(doc));
  return "generated";
}

async function exportPdf(text, outputPath, meta) {
  let pdfMake;
  let vfs;
  try {
    pdfMake = require("pdfmake/build/pdfmake.js");
    vfs = require("pdfmake/build/vfs_fonts.js");
  } catch {
    throw new Error("Cần cài đặt: npm install pdfmake");
  }
  if (typeof pdfMake.addVirtualFileSystem === "function") {
    pdfMake.addVirtualFileSystem(vfs);
  } else {
    pdfMake.vfs = vfs;
  }

  const bodyContent = splitLines(stripExistingAdministrativeHeader(text)).map((line) => {
    const trimmed = line.trim();
    const options = paragraphOptions(trimmed);
    if (options.skip) return null;
    return {
      text: trimmed,
      alignment: String(options.alignment || "JUSTIFIED").toLowerCase(),
      bold: options.bold ?? isBoldLine(trimmed),
      italics: options.italic ?? false,
      fontSize: options.size ? options.size / 2 : 13,
      margin: [
        options.firstLine ? 24 : options.hanging ? 18 : 0,
        options.before ? 4 : 1,
        0,
        options.after ? 4 : 1,
      ],
    };
  }).filter(Boolean);

  const docDefinition = {
    info: {
      title: meta.title,
      subject: meta.subtitle,
      author: CONFIG.coQuanTen,
    },
    pageSize: "A4",
    pageMargins: [85, 57, 57, 57],
    defaultStyle: {
      fontSize: 12,
      lineHeight: 1.25,
    },
    content: [
      {
        columns: [
          {
            width: "43%",
            stack: [
              { text: CONFIG.coQuanTen.toUpperCase(), alignment: "center", bold: true },
              { text: `Số: ${meta.soHieu}`, alignment: "center" },
            ],
          },
          {
            width: "57%",
            stack: [
              { text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", alignment: "center", bold: true },
              { text: "Độc lập - Tự do - Hạnh phúc", alignment: "center", bold: true },
            ],
          },
        ],
        margin: [0, 0, 0, 8],
      },
      { text: `${process.env.DIA_DANH || "[Địa danh]"}, ${vietnameseDate()}`, alignment: "right", italics: true, margin: [0, 0, 0, 10] },
      ...bodyContent,
    ],
  };

  await new Promise((resolve, reject) => {
    pdfMake.createPdf(docDefinition).getBuffer((buffer) => {
      try {
        fs.writeFileSync(outputPath, buffer);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  try {
    const docTypeDef = DOCUMENT_TYPES[args.type];

    // Đọc nội dung (từ --content hoặc --content-file)
    let content = args.content;
    if (!content && args["content-file"]) {
      const cfPath = path.resolve(args["content-file"]);
      if (!fs.existsSync(cfPath)) throw new Error(`Không tìm thấy content-file: ${cfPath}`);
      content = fs.readFileSync(cfPath, "utf8");
    }
    if (!content) throw new Error("Cần --content hoặc --content-file");
    content = normalizeDocumentContent(content);
    if (args.review) {
      const review = analyzeAdministrativeDocument(content);
      if (!review.passed) {
        printEnvelope("soan-thao", { exported: false, review, requires_correction: true });
        return;
      }
    }

    // Tạo số hiệu nếu chưa có
    const seq = String(Math.floor(Math.random() * 900) + 100);
    const soHieu = args.number ?? `${seq}/${docTypeDef.kyHieu}-${CONFIG.coQuanKyHieu}`;
    const format = normalizeFormat(args.format, args.output);
    const outputTargets = buildOutputTargets({
      format,
      output: args.output,
      type: args.type,
      soHieu,
    });
    const outputDir = resolveOutputDir();
    fs.mkdirSync(outputDir, { recursive: true });

    const result = {
      so_hieu: soHieu,
      loai: docTypeDef.label,
      format,
      files: {},
      methods: {},
    };
    const mediaOutputs = [];

    if (outputTargets.docx) {
      console.error(`📝 Xuất ${docTypeDef.label} DOCX: ${soHieu} → ${outputTargets.docx}`);
      result.methods.docx = await exportDocx(content, outputTargets.docx, docTypeDef.template, { soHieu });
      result.files.docx = outputTargets.docx;
      mediaOutputs.push(outputTargets.docx);
    }
    if (outputTargets.pdf) {
      console.error(`📝 Xuất ${docTypeDef.label} PDF: ${soHieu} → ${outputTargets.pdf}`);
      await exportPdf(content, outputTargets.pdf, {
        title: `${docTypeDef.label} ${soHieu}`,
        subtitle: `Cơ quan: ${CONFIG.coQuanTen}`,
        soHieu,
      });
      result.methods.pdf = "pdfmake";
      result.files.pdf = outputTargets.pdf;
      mediaOutputs.push(outputTargets.pdf);
    }

    let stored = null;
    try {
      const storedPath = result.files.docx ?? result.files.pdf;
      const db = getDatabase();
      stored = db.transaction(() => {
        const document = storeDocument(db, {
          filePath: storedPath,
          fileName: path.basename(storedPath),
          fileHash: fileHash(storedPath),
          source: "soan-thao",
        });
        storeExtraction(db, {
          documentId: document.id,
          method: "authored",
          text: content,
          metadata: { so_hieu: soHieu, loai: docTypeDef.label, format },
        });
        return document;
      })();
      db.close();
    } catch (error) {
      result.storage_warning = error instanceof Error ? error.message : String(error);
    }
    printEnvelope("soan-thao", { document_id: stored?.id ?? null, ...result });

    for (const mediaPath of mediaOutputs) {
      const escaped = formatMediaPath(mediaPath).replace(/"/g, "\\\"");
      console.log(`MEDIA:"${escaped}"`);
    }
  } catch (err) {
    printError("soan-thao", err);
    process.exitCode = 1;
  }
}

main();
