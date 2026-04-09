#!/usr/bin/env node
/**
 * extract.js — Trích xuất và tóm tắt công văn hành chính
 * Tóm tắt nội dung công văn
 * xuất thông tin cấu trúc từ công văn
 */

import fs from "fs";
import path from "path";
import { parseArgs } from "util";

// ── CLI args ──────────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    file: { type: "string", short: "f" },
    output: { type: "string", short: "o", default: "json" }, // json | text
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

if (args.help || !args.file) {
  console.log(`
Sử dụng: node extract.js --file <đường_dẫn_file> [--output json|text]

Ví dụ:
  node extract.js --file cong-van.pdf
  node extract.js --file to-trinh.docx --output text

Định dạng hỗ trợ: .pdf, .docx, .txt
`);
  process.exit(0);
}

// ── File reading ──────────────────────────────────────────────────────────────
async function readFileContent(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`Không tìm thấy file: ${absPath}`);
  }

  if (ext === ".txt") {
    return fs.readFileSync(absPath, "utf8");
  }

  if (ext === ".pdf") {
    const { default: pdfParse } = await import("pdf-parse").catch(() => {
      throw new Error(
        'Cần cài đặt pdf-parse: npm install pdf-parse\nHoặc OpenClaw 3.2+ hỗ trợ native PDF tool với pdfModel config.'
      );
    });
    const buffer = fs.readFileSync(absPath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth").catch(() => {
      throw new Error("Cần cài đặt mammoth: npm install mammoth");
    });
    const result = await mammoth.extractRawText({ path: absPath });
    return result.value;
  }

  throw new Error(`Định dạng không được hỗ trợ: ${ext}`);
}

// ── Extraction logic ──────────────────────────────────────────────────────────
/**
 * Trích xuất thông tin cấu trúc từ text công văn.
 * Sử dụng regex + heuristic cho các mẫu văn bản hành chính Việt Nam.
 */
function extractStructuredInfo(text) {
  const result = {
    so_cong_van: null,
    ngay_ban_hanh: null,
    co_quan_gui: null,
    noi_nhan: null,
    trich_yeu: null,
    noi_dung_chinh: "",
    yeu_cau: [],
    han_xu_ly: null,
    muc_do_uu_tien: "binh_thuong",
  };

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Số công văn — mẫu: 123/CV-UBND, 45/TB-BTC
    if (!result.so_cong_van) {
      const m = line.match(/\b(\d{1,4}\/[A-ZĐÀÁẠẢÃĂẮẶẲẴÂẤẬẨẪ0-9]{2,}-[A-ZĐÀÁẠẢÃĂẮẶẲẴÂẤẬẨẪ0-9]{2,})\b/);
      if (m) result.so_cong_van = m[1];
    }

    // Ngày ban hành — mẫu: ngày 01 tháng 04 năm 2026
    if (!result.ngay_ban_hanh) {
      const m = line.match(/ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})/i);
      if (m) {
        result.ngay_ban_hanh = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      }
    }

    // Trích yếu — dòng sau "V/v" hoặc "Về việc"
    if (!result.trich_yeu) {
      const m = line.match(/(?:V\/v|Về việc)[:\s]+(.+)/i);
      if (m) result.trich_yeu = m[1].trim();
    }

    // Hạn xử lý — tìm các từ khoá deadline
    const deadlineMatch = line.match(
      /(?:trước\s+ngày|hạn\s+(?:nộp|báo\s+cáo|trả\s+lời)|chậm\s+nhất)[^.]*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4})/i
    );
    if (deadlineMatch && !result.han_xu_ly) {
      result.han_xu_ly = deadlineMatch[1];
    }

    // Yêu cầu — các dòng bắt đầu bằng số thứ tự hoặc dấu gạch
    if (/^[\d]+\.\s+|^[-–•]\s+/.test(line) && line.length > 10) {
      result.yeu_cau.push(line.replace(/^[\d]+\.\s+|^[-–•]\s+/, "").trim());
    }

    // Mức độ ưu tiên
    if (/(?:khẩn|hỏa tốc|thượng khẩn)/i.test(line)) {
      result.muc_do_uu_tien = /hỏa tốc|thượng khẩn/i.test(line) ? "rat_khan" : "khan";
    }
  }

  // Nội dung chính — phần giữa sau số công văn và trước phần ký
  const bodyStart = text.search(/kính\s+gửi|kính\s+trình|có\s+văn\s+bản/i);
  const bodyEnd = text.search(/nơi\s+nhận|trân\s+trọng\s+kính\s+trình|xin\s+kính\s+trình/i);
  if (bodyStart !== -1) {
    const rawBody = bodyEnd !== -1
      ? text.slice(bodyStart, bodyEnd)
      : text.slice(bodyStart, bodyStart + 1500);
    result.noi_dung_chinh = rawBody.replace(/\s+/g, " ").trim().slice(0, 800);
    if (rawBody.length > 800) result.noi_dung_chinh += " [...]";
  }

  return result;
}

// ── Priority warning ──────────────────────────────────────────────────────────
function checkDeadlineWarning(info) {
  if (!info.han_xu_ly) return null;
  try {
    const parts = info.han_xu_ly.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (!parts) return null;
    const deadline = new Date(
      parseInt(parts[3].length === 2 ? `20${parts[3]}` : parts[3]),
      parseInt(parts[2]) - 1,
      parseInt(parts[1])
    );
    const today = new Date();
    const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return `⚠️  ĐÃ QUÁ HẠN ${Math.abs(daysLeft)} ngày!`;
    if (daysLeft <= 3) return `🚨 CẦN XỬ LÝ NGAY — còn ${daysLeft} ngày (hạn: ${info.han_xu_ly})`;
    if (daysLeft <= 7) return `⏰ Lưu ý — còn ${daysLeft} ngày (hạn: ${info.han_xu_ly})`;
    return null;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  try {
    console.error(`📄 Đang xử lý: ${args.file}`);
    const text = await readFileContent(args.file);
    const info = extractStructuredInfo(text);
    const warning = checkDeadlineWarning(info);

    if (args.output === "text") {
      console.log("\n========== TÓM TẮT CÔNG VĂN ==========");
      console.log(`Số hiệu     : ${info.so_cong_van ?? "(không xác định)"}`);
      console.log(`Ngày        : ${info.ngay_ban_hanh ?? "(không xác định)"}`);
      console.log(`Cơ quan gửi : ${info.co_quan_gui ?? "(không xác định)"}`);
      console.log(`Trích yếu   : ${info.trich_yeu ?? "(không xác định)"}`);
      console.log(`\nNội dung chính:\n${info.noi_dung_chinh}`);
      if (info.yeu_cau.length) {
        console.log("\nYêu cầu/Chỉ đạo:");
        info.yeu_cau.forEach((y, i) => console.log(`  ${i + 1}. ${y}`));
      }
      console.log(`\nHạn xử lý   : ${info.han_xu_ly ?? "(không có)"}`);
      console.log(`Mức độ      : ${info.muc_do_uu_tien}`);
      if (warning) console.log(`\n${warning}`);
    } else {
      const output = { ...info, _warning: warning };
      console.log(JSON.stringify(output, null, 2));
    }
  } catch (err) {
    console.error(`❌ Lỗi: ${err.message}`);
    process.exit(1);
  }
}

main();
