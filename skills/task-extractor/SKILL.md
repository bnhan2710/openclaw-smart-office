---
name: task-extractor
description: Trích xuất tự động các nhiệm vụ, yêu cầu, phân công từ văn bản hành chính bằng NLP. Dùng khi người dùng nói "tạo task từ văn bản này", "có việc gì cần làm sau cuộc họp", "phân công từ biên bản", "nhiệm vụ trong công văn". Nhận diện: tên nhiệm vụ, người/đơn vị được giao, hạn thực hiện, mức độ ưu tiên.
version: 1.0.0
metadata: {"openclaw":{"emoji":"🎯","requires":{"env":["OPENAI_API_KEY"],"bins":["node"]},"primaryEnv":"OPENAI_API_KEY","install":[{"id":"npm","kind":"node","pkg":"{baseDir}","label":"Cài đặt dependencies (openai, pdf-parse, mammoth)"}]}}
---

## Khi nào dùng skill này

Dùng skill này khi:
- Vừa xử lý xong biên bản họp qua `cong-van-summary` → tự động tạo danh sách việc cần làm
- Người dùng nói: "tạo task", "việc gì cần làm", "phân công", "nhiệm vụ từ văn bản"
- Cần chuyển nội dung cuộc họp/công văn thành to-do list rõ ràng

## Quy trình thực hiện

### Từ file

```bash
node {baseDir}/scripts/extract-task.js --file <đường_dẫn> --output text
```

### Từ text trực tiếp

```bash
node {baseDir}/scripts/extract-task.js --text "<nội_dung_văn_bản>"
```

### Trích xuất + tự động thêm vào deadline-reminder

```bash
node {baseDir}/scripts/extract-task.js --file <đường_dẫn> --add-deadlines
```

## Xử lý output

Sau khi nhận JSON output, trình bày tasks theo nhóm:

**Nhóm 1 — Có deadline:**
- Hiển thị tên task, người được giao, hạn thực hiện, mức độ ưu tiên

**Nhóm 2 — Chưa có deadline cụ thể:**
- Liệt kê để người dùng quyết định

Sau khi hiển thị, **hỏi người dùng**:
> "Bạn có muốn tôi thêm các deadline này vào hệ thống nhắc nhở không?"

Nếu đồng ý → gọi `deadline-reminder` với từng task có `deadline`.

## Lưu ý

- Script dùng LLM (GPT-4o-mini) để nhận diện nhiệm vụ; nếu LLM không khả dụng, tự động fallback sang rule-based
- Chỉ tin tưởng task có `confidence >= 0.7`
- Đặc biệt hiệu quả với biên bản họp có phần "Kết luận / Phân công"
- Kết hợp tốt nhất: `cong-van-summary` → `task-extractor` → `deadline-reminder`
