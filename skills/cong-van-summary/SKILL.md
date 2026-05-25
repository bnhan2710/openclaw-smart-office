---
name: cong-van-summary
description: Tóm tắt và trích xuất thông tin cấu trúc từ công văn hành chính Việt Nam (PDF, DOCX, TXT). Dùng khi người dùng gửi file công văn, yêu cầu "tóm tắt công văn", "đọc công văn", "trích xuất thông tin", "công văn số...", hoặc đính kèm file .pdf/.docx cần phân tích. Trả về số hiệu, ngày ban hành, cơ quan gửi, trích yếu, nội dung chính, yêu cầu cụ thể và hạn xử lý. Cảnh báo ngay nếu hạn còn ≤ 3 ngày.
version: 1.0.0
metadata: {"openclaw":{"emoji":"📄","requires":{"bins":["node"]},"install":[{"id":"npm","kind":"node","pkg":"{baseDir}","label":"Cài đặt dependencies (pdf-parse, mammoth)"}],"homepage":"https://github.com/openclaw/openclaw"}}
---

## Khi nào dùng skill này

Dùng skill này khi:
- Người dùng gửi file `.pdf`, `.docx`, `.txt` là văn bản hành chính
- Người dùng nói: "tóm tắt công văn", "đọc văn bản này", "công văn số X nói gì", "trích xuất thông tin"
- Cần xác định hạn xử lý, yêu cầu, hoặc người nhận từ một văn bản

## Quy trình thực hiện

1. **Nhận file**: Lưu file đính kèm vào disk nếu chưa có đường dẫn
2. **Chạy script trích xuất** (kết quả JSON gồm `document_id` để dùng cho các skill sau):
   ```bash
   node {baseDir}/scripts/extract.js --file <đường_dẫn_file>
   # Hoặc sau khi OCR:
   node {baseDir}/scripts/extract.js --document-id <document_id_tu_document-digitalization>
   ```
3. **Đọc output** và trình bày cho người dùng theo cấu trúc:
   - Số hiệu văn bản
   - Ngày ban hành
   - Cơ quan ban hành / Kính gửi
   - Trích yếu (V/v)
   - Nội dung chính (tóm tắt ngắn gọn)
   - Yêu cầu / Chỉ đạo (đánh số)
   - Hạn xử lý
4. **Nếu hạn xử lý ≤ 3 ngày**: Hiển thị cảnh báo nổi bật ngay đầu phản hồi
5. **Nếu hạn xử lý đã qua**: Thông báo văn bản đã quá hạn

## Tham chiếu cấu trúc văn bản

Đọc `{baseDir}/references/cong-van-mau.md` để tra cứu cấu trúc từng loại văn bản (công văn, tờ trình, biên bản, quyết định).

## Lưu ý

- Nếu file PDF là ảnh scan (không có text), trả nhu cầu OCR cho agent; việc điều phối sang `document-digitalization` thuộc agent/workflow, không thuộc script này
- Đối với OpenClaw 3.2+: ưu tiên dùng native `pdf` tool trước khi gọi script nếu model hỗ trợ
- Metadata và text được lưu trong SQLite dùng chung; sau khi trích xuất, hỏi người dùng có muốn lưu task/deadline không
