---
name: document-digitalization
description: Số hóa tài liệu hành chính scan bằng OCR cục bộ. Dùng khi PDF không có text hoặc người dùng gửi ảnh công văn cần đọc. Chỉ trả text và document_id; không điều phối skill khác, không tự tạo task hay gửi dữ liệu ra ngoài.
version: 1.0.0
metadata: {"openclaw":{"emoji":"🔎","requires":{"bins":["node","tesseract","pdftoppm"]},"install":[{"id":"npm","kind":"node","pkg":"{baseDir}","label":"Cài đặt dependencies"}]}}
---

## Quy trình

1. Chạy `node {baseDir}/scripts/digitalize.js --file <path> --output json`.
2. Trả nguyên kết quả gồm text, `document_id` và cảnh báo chất lượng OCR cho agent.
3. Dừng tại đây; agent hoặc workflow bên ngoài quyết định bước tiếp theo.
4. Không tự động tạo nhiệm vụ, lịch hoặc gửi nội dung tài liệu ra ngoài máy.

## Cấu hình

- `OCR_LANG=vie` mặc định dùng gói ngôn ngữ tiếng Việt của Tesseract.
- PDF có text được đọc trực tiếp; PDF scan cần cả `tesseract` và `pdftoppm`.
