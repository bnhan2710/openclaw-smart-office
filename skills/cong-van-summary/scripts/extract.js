#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";

import { daysUntil, normalizeDate } from "../../../lib/dates.js";
import { getDatabase, storeDocument, storeExtraction } from "../../../lib/database.js";
import { fileHash, readDocumentText } from "../../../lib/documents.js";
import { printEnvelope, printError } from "../../../lib/response.js";

const SKILL = "cong-van-summary";
const { values: args } = parseArgs({
  options: { file: { type: "string", short: "f" }, "document-id": { type: "string" }, output: { type: "string", short: "o", default: "json" }, help: { type: "boolean", short: "h" } },
  strict: false,
});

export function extractStructuredInfo(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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
  for (const line of lines) {
    if (!result.so_cong_van) result.so_cong_van = line.match(/\b(\d{1,4}\/[A-ZĐ0-9-]{3,})\b/u)?.[1] ?? null;
    if (!result.ngay_ban_hanh) result.ngay_ban_hanh = normalizeDate(line);
    if (!result.co_quan_gui && /(?:UBND|ỦY BAN|SỞ|BỘ|CỤC|PHÒNG)/iu.test(line)) result.co_quan_gui = line.slice(0, 120);
    if (!result.noi_nhan) result.noi_nhan = line.match(/Kính\s+(?:gửi|trình)\s*:\s*(.+)/iu)?.[1]?.trim() ?? null;
    if (!result.trich_yeu) result.trich_yeu = line.match(/(?:V\/v|Về việc)\s*:?\s*(.+)/iu)?.[1]?.trim() ?? null;
    if (!result.han_xu_ly && /trước\s+ngày|hạn|chậm\s+nhất/iu.test(line)) result.han_xu_ly = normalizeDate(line);
    if (/^(?:\d+\.|[-–•])\s+/.test(line) && line.length > 10) result.yeu_cau = [...result.yeu_cau, line.replace(/^(?:\d+\.|[-–•])\s+/, "")];
    if (/hỏa tốc|thượng khẩn/iu.test(line)) result.muc_do_uu_tien = "rat_khan";
    else if (/khẩn/iu.test(line) && result.muc_do_uu_tien === "binh_thuong") result.muc_do_uu_tien = "khan";
  }
  const start = text.search(/kính\s+(?:gửi|trình)/iu);
  const end = text.search(/nơi\s+nhận/iu);
  const body = start >= 0 ? text.slice(start, end > start ? end : start + 1500) : text.slice(0, 800);
  result.noi_dung_chinh = body.replace(/\s+/g, " ").trim().slice(0, 800);
  return result;
}

function warningForDeadline(deadline) {
  if (!deadline) return null;
  const remaining = daysUntil(deadline);
  if (remaining < 0) return `ĐÃ QUÁ HẠN ${Math.abs(remaining)} ngày`;
  if (remaining <= 3) return `CẦN XỬ LÝ NGAY - còn ${remaining} ngày`;
  if (remaining <= 7) return `Sắp đến hạn - còn ${remaining} ngày`;
  return null;
}

async function processDocument(filePath) {
  const input = await readDocumentText(filePath);
  const info = extractStructuredInfo(input.text);
  const warning = warningForDeadline(info.han_xu_ly);
  const db = getDatabase();
  const result = db.transaction(() => {
    const document = storeDocument(db, {
      filePath: input.absolutePath,
      fileName: path.basename(input.absolutePath),
      fileHash: fileHash(input.absolutePath),
      source: "cong-van-summary",
    });
    const extraction = storeExtraction(db, {
      documentId: document.id,
      method: input.method,
      text: input.text,
      metadata: info,
      pageCount: input.pageCount,
      warning,
    });
    return { document_id: document.id, extraction_id: extraction.id, ...info, warning };
  })();
  db.close();
  return result;
}

function processStoredDocument(documentId) {
  const db = getDatabase();
  const source = db.prepare("SELECT text_content, method, page_count FROM document_extractions WHERE document_id = ? ORDER BY created_at DESC LIMIT 1").get(documentId);
  if (!source) {
    db.close();
    throw new Error(`Document has no extracted text: ${documentId}`);
  }
  const result = db.transaction(() => {
    const info = extractStructuredInfo(source.text_content);
    const warning = warningForDeadline(info.han_xu_ly);
    const extraction = storeExtraction(db, {
      documentId,
      method: `${source.method}+summary`,
      text: source.text_content,
      metadata: info,
      pageCount: source.page_count,
      warning,
    });
    return { document_id: documentId, extraction_id: extraction.id, ...info, warning };
  })();
  db.close();
  return result;
}

async function main() {
  if (args.help || (!args.file && !args["document-id"])) {
    console.log("Usage: node extract.js --file <pdf|docx|txt> | --document-id <ocr_document_id> [--output json|text]");
    return;
  }
  try {
    const result = args["document-id"] ? processStoredDocument(args["document-id"]) : await processDocument(args.file);
    if (args.output === "text") {
      console.log(`Số hiệu: ${result.so_cong_van ?? "(không xác định)"}`);
      console.log(`Trích yếu: ${result.trich_yeu ?? "(không xác định)"}`);
      console.log(`Hạn xử lý: ${result.han_xu_ly ?? "(không có)"}`);
      console.log(result.noi_dung_chinh);
      if (result.warning) console.log(`Cảnh báo: ${result.warning}`);
    } else {
      printEnvelope(SKILL, result);
    }
  } catch (error) {
    printError(SKILL, error);
    process.exitCode = 1;
  }
}

main();
