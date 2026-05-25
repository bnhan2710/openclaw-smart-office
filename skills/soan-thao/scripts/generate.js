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
  return text.replace(/^\uFEFF/, "").split(/\r?\n/);
}

function isCenteredLine(trimmed) {
  return /^(CỘNG HÒA|QUỐC HIỆU|ĐỘC LẬP|THÔNG BÁO|BIÊN BẢN|QUYẾT ĐỊNH|SỐ:|V\/v)/i.test(trimmed);
}

function isBoldLine(trimmed) {
  return /^(CỘNG HÒA|ĐỘC LẬP|THÔNG BÁO|BIÊN BẢN|QUYẾT ĐỊNH|Điều \d)/i.test(trimmed);
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
    return { pdf: path.resolve(outputDir, ext === ".pdf" || !ext ? fileName : `${baseWithoutExt}.pdf`) };
  }
  const fileName = requested || `${baseDefault}.docx`;
  return { docx: path.resolve(outputDir, ext === ".docx" || !ext ? fileName : `${baseWithoutExt}.docx`) };
}

// ── DOCX generation ───────────────────────────────────────────────────────────
async function exportDocx(text, outputPath, templateName) {
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

  // Fallback: tạo DOCX đơn giản với font Times New Roman 13pt (chuẩn VN)
  const { Document, Paragraph, TextRun, Packer, AlignmentType } = await import("docx").catch(() => {
    throw new Error("Cần cài đặt: npm install docx");
  });

  const paragraphs = splitLines(text).map((line) => {
    const trimmed = line.trim();

    return new Paragraph({
      alignment: isCenteredLine(trimmed) ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
      children: [
        new TextRun({
          text: line,
          font: "Times New Roman",
          size: 26, // 13pt
          bold: isBoldLine(trimmed),
        }),
      ],
    });
  });

  const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
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

  const content = splitLines(text).map((line) => {
    const trimmed = line.trim();
    const empty = trimmed.length === 0;
    return {
      text: empty ? " " : line,
      alignment: empty ? "left" : isCenteredLine(trimmed) ? "center" : "justify",
      bold: !empty && isBoldLine(trimmed),
      margin: [0, empty ? 4 : 1, 0, empty ? 4 : 1],
    };
  });

  const docDefinition = {
    info: {
      title: meta.title,
      subject: meta.subtitle,
      author: CONFIG.coQuanTen,
    },
    pageSize: "A4",
    pageMargins: [56, 56, 56, 56],
    defaultStyle: {
      fontSize: 12,
      lineHeight: 1.25,
    },
    content,
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
      result.methods.docx = await exportDocx(content, outputTargets.docx, docTypeDef.template);
      result.files.docx = outputTargets.docx;
      mediaOutputs.push(outputTargets.docx);
    }
    if (outputTargets.pdf) {
      console.error(`📝 Xuất ${docTypeDef.label} PDF: ${soHieu} → ${outputTargets.pdf}`);
      await exportPdf(content, outputTargets.pdf, {
        title: `${docTypeDef.label} ${soHieu}`,
        subtitle: `Cơ quan: ${CONFIG.coQuanTen}`,
      });
      result.methods.pdf = "pdfmake";
      result.files.pdf = outputTargets.pdf;
      mediaOutputs.push(outputTargets.pdf);
    }

    const storedPath = result.files.docx ?? result.files.pdf;
    const db = getDatabase();
    const stored = db.transaction(() => {
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
    printEnvelope("soan-thao", { document_id: stored.id, ...result });

    for (const mediaPath of mediaOutputs) {
      const escaped = mediaPath.replace(/"/g, "\\\"");
      console.log(`MEDIA:"${escaped}"`);
    }
  } catch (err) {
    printError("soan-thao", err);
    process.exitCode = 1;
  }
}

main();
