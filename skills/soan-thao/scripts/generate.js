#!/usr/bin/env node
/**
 * generate.js — Xuất file DOCX từ nội dung văn bản đã soạn sẵn
 *
 * Script này KHÔNG gọi LLM. Agent (OpenClaw) đã soạn nội dung
 * và truyền vào qua --content. Script chỉ đảm nhiệm:
 *  1. Đọc content text
 *  2. Áp dụng template DOCX (nếu có)
 *  3. Xuất file .docx chuẩn định dạng hành chính
 */

import fs from "fs";
import path from "path";
import { parseArgs } from "util";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "../templates");

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
    "content-file": { type: "string" },  // đọc content từ file nếu quá dài
    output: { type: "string", short: "o" },
    number: { type: "string", short: "n" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Sử dụng: node generate.js --type <loại> --content "<nội_dung>" [--output <file.docx>]

Loại (--type):  cong-van | to-trinh | bien-ban

Tham số:
  --content, -c       Nội dung văn bản đã soạn (do agent cung cấp)
  --content-file      Đọc nội dung từ file text (dùng khi nội dung dài)
  --number, -n        Số hiệu văn bản (tuỳ chọn, tự sinh nếu bỏ qua)
  --output, -o        Tên file xuất (mặc định: <type>-<so_hieu>.docx)

Biến môi trường:
  CO_QUAN_TEN         Tên cơ quan (mặc định: ĐƠN VỊ)
  CO_QUAN_KY_HIEU     Ký hiệu cơ quan (mặc định: DV)
  OUTPUT_DIR          Thư mục xuất (mặc định: ./output/van-ban)

Ví dụ (agent gọi):
  node generate.js --type cong-van --content-file /tmp/draft.txt --output cv-001.docx
`);
  process.exit(0);
}

if (!args.type || !DOCUMENT_TYPES[args.type]) {
  console.error(`❌ Loại không hợp lệ. Dùng: ${Object.keys(DOCUMENT_TYPES).join(", ")}`);
  process.exit(1);
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

  const paragraphs = text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    const isCentered =
      /^(CỘNG HÒA|QUỐC HIỆU|ĐỘC LẬP|THÔNG BÁO|BIÊN BẢN|QUYẾT ĐỊNH|SỐ:|V\/v)/i.test(trimmed);

    return new Paragraph({
      alignment: isCentered ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
      children: [
        new TextRun({
          text: line,
          font: "Times New Roman",
          size: 26, // 13pt
          bold: /^(CỘNG HÒA|ĐỘC LẬP|THÔNG BÁO|BIÊN BẢN|QUYẾT ĐỊNH|Điều \d)/i.test(trimmed),
        }),
      ],
    });
  });

  const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
  fs.writeFileSync(outputPath, await Packer.toBuffer(doc));
  return "generated";
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

    // Tạo số hiệu nếu chưa có
    const seq = String(Math.floor(Math.random() * 900) + 100);
    const soHieu = args.number ?? `${seq}/${docTypeDef.kyHieu}-${CONFIG.coQuanKyHieu}`;

    // Chuẩn bị output path
    const outputFileName = args.output ?? `${args.type}-${soHieu.replace(/\//g, "-")}.docx`;
    fs.mkdirSync(path.resolve(CONFIG.outputDir), { recursive: true });
    const outputPath = path.resolve(CONFIG.outputDir, outputFileName);

    console.error(`📝 Xuất ${docTypeDef.label}: ${soHieu} → ${outputPath}`);
    const method = await exportDocx(content, outputPath, docTypeDef.template);

    console.log(
      JSON.stringify(
        {
          success: true,
          so_hieu: soHieu,
          loai: docTypeDef.label,
          file: outputPath,
          method, // "template" hoặc "generated"
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error(`❌ Lỗi: ${err.message}`);
    process.exit(1);
  }
}

main();
