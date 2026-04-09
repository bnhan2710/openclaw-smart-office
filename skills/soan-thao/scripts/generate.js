#!/usr/bin/env node
/**
 * generate.js — Soạn thảo văn bản hành chính và xuất file .docx
 */

import fs from "fs";
import path from "path";
import { parseArgs } from "util";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "../templates");

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.GENERATION_MODEL ?? "gpt-4o",
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
    subject: { type: "string", short: "s" },
    recipient: { type: "string", short: "r" },
    content: { type: "string", short: "c" },
    attendees: { type: "string" },
    output: { type: "string", short: "o" },
    number: { type: "string", short: "n" },
    preview: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Sử dụng: node generate.js --type <loại> [tuỳ chọn]

Loại văn bản (--type):
  cong-van    Công văn
  to-trinh    Tờ trình
  bien-ban    Biên bản cuộc họp

Tham số:
  --subject, -s    Trích yếu / tiêu đề
  --recipient, -r  Người/cơ quan nhận (Kính gửi)
  --content, -c    Nội dung chính
  --attendees      Thành phần tham dự (bien-ban)
  --number, -n     Số hiệu văn bản (tuỳ chọn, tự sinh nếu bỏ qua)
  --output, -o     Tên file xuất .docx
  --preview        Chỉ hiển thị text, không xuất file

Biến môi trường:
  OPENAI_API_KEY      (bắt buộc)
  GENERATION_MODEL    (mặc định: gpt-4o)
  CO_QUAN_TEN         Tên cơ quan (mặc định: ĐƠN VỊ)
  CO_QUAN_KY_HIEU     Ký hiệu cơ quan (mặc định: DV)
  OUTPUT_DIR          Thư mục xuất file
`);
  process.exit(0);
}

if (!args.type || !DOCUMENT_TYPES[args.type]) {
  console.error(`❌ Loại văn bản không hợp lệ. Dùng: ${Object.keys(DOCUMENT_TYPES).join(", ")}`);
  process.exit(1);
}

// ── AI draft generation ───────────────────────────────────────────────────────
const PROMPTS = {
  "cong-van": (data) => `
Soạn một công văn hành chính tiếng Việt chuẩn theo Nghị định 30/2020/NĐ-CP.

Thông tin:
- Cơ quan ban hành: ${data.coQuanTen}
- Kính gửi: ${data.recipient ?? "[Tên cơ quan nhận]"}
- Trích yếu: ${data.subject}
- Nội dung/yêu cầu: ${data.content}
- Ngày: ${data.date}
- Số hiệu: ${data.soHieu}

Yêu cầu:
- Viết đầy đủ cấu trúc: quốc hiệu, tiêu ngữ, số hiệu, trích yếu, kính gửi, nội dung, yêu cầu cụ thể, lời kết, nơi nhận
- Văn phong hành chính, lịch sự, rõ ràng
- Nội dung súc tích, đúng trọng tâm
- Kết thúc bằng "Trân trọng./"
`,

  "to-trinh": (data) => `
Soạn một tờ trình hành chính tiếng Việt chuẩn theo Nghị định 30/2020/NĐ-CP.

Thông tin:
- Cơ quan đề xuất: ${data.coQuanTen}
- Kính trình: ${data.recipient ?? "[Tên cấp trên]"}
- Về việc: ${data.subject}
- Nội dung đề xuất: ${data.content}
- Ngày: ${data.date}
- Số hiệu: ${data.soHieu}

Cấu trúc bắt buộc:
I. SỰ CẦN THIẾT VÀ CĂN CỨ PHÁP LÝ
II. NỘI DUNG ĐỀ XUẤT
III. KIẾN NGHỊ

Văn phong trang trọng, lập luận logic, có căn cứ.
`,

  "bien-ban": (data) => `
Soạn một biên bản cuộc họp hành chính tiếng Việt.

Thông tin:
- Tên cơ quan: ${data.coQuanTen}
- Chủ đề cuộc họp: ${data.subject}
- Thành phần tham dự: ${data.attendees ?? "[Danh sách thành phần]"}
- Nội dung thảo luận / kết quả: ${data.content}
- Ngày: ${data.date}
- Số hiệu: ${data.soHieu}

Cấu trúc bắt buộc:
- Thời gian, địa điểm, thành phần
- Nội dung cuộc họp (diễn biến)
- Kết luận và phân công
- Thời gian kết thúc
- Chữ ký (Thư ký và Chủ toạ)
`,
};

async function generateDraft(docType, data) {
  if (!CONFIG.apiKey) throw new Error("Thiếu OPENAI_API_KEY");

  const { default: OpenAI } = await import("openai").catch(() => {
    throw new Error("Cần cài đặt: npm install openai");
  });

  const openai = new OpenAI({ apiKey: CONFIG.apiKey });
  const prompt = PROMPTS[docType](data);

  const response = await openai.chat.completions.create({
    model: CONFIG.model,
    messages: [
      {
        role: "system",
        content:
          "Bạn là chuyên gia soạn thảo văn bản hành chính Việt Nam. Soạn thảo đúng chuẩn, đầy đủ cấu trúc, văn phong trang trọng.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
  });

  return response.choices[0].message.content;
}

// ── DOCX generation ───────────────────────────────────────────────────────────
async function exportDocx(text, outputPath, templateName) {
  const templatePath = path.join(TEMPLATES_DIR, templateName);

  // Try docxtemplater if template exists
  if (fs.existsSync(templatePath)) {
    try {
      const PizZip = (await import("pizzip")).default;
      const Docxtemplater = (await import("docxtemplater")).default;
      const templateContent = fs.readFileSync(templatePath, "binary");
      const zip = new PizZip(templateContent);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
      doc.render({ content: text, generated_date: new Date().toLocaleDateString("vi-VN") });
      const buf = doc.getZip().generate({ type: "nodebuffer" });
      fs.writeFileSync(outputPath, buf);
      return;
    } catch {
      // Fall through to plain docx generation
    }
  }

  // Fallback: create simple docx without template
  const { Document, Paragraph, TextRun, Packer } = await import("docx").catch(() => {
    throw new Error("Cần cài đặt: npm install docx");
  });

  const paragraphs = text.split(/\r?\n/).map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line, font: "Times New Roman", size: 26 })],
      })
  );

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  try {
    const docTypeDef = DOCUMENT_TYPES[args.type];
    const now = new Date();
    const dateStr = now.toLocaleDateString("vi-VN");
    const year = now.getFullYear();
    const seq = String(Math.floor(Math.random() * 900) + 100);
    const soHieu =
      args.number ?? `${seq}/${docTypeDef.kyHieu}-${CONFIG.coQuanKyHieu}`;

    const data = {
      coQuanTen: CONFIG.coQuanTen,
      soHieu,
      date: dateStr,
      subject: args.subject ?? "(không có trích yếu)",
      recipient: args.recipient,
      content: args.content ?? "",
      attendees: args.attendees,
    };

    console.error(`✍️  Đang soạn ${docTypeDef.label}: ${soHieu}`);
    const draft = await generateDraft(args.type, data);

    if (args.preview) {
      console.log("\n" + "=".repeat(60));
      console.log(draft);
      console.log("=".repeat(60));
      return;
    }

    const outputFileName =
      args.output ?? `${args.type}-${soHieu.replace(/\//g, "-")}.docx`;
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    const outputPath = path.resolve(CONFIG.outputDir, outputFileName);

    await exportDocx(draft, outputPath, docTypeDef.template);

    console.log(
      JSON.stringify(
        {
          success: true,
          so_hieu: soHieu,
          loai: docTypeDef.label,
          file: outputPath,
          preview: draft.slice(0, 300) + (draft.length > 300 ? "\n..." : ""),
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
