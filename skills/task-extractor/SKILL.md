---
name: task-extractor
description: Trích xuất tự động các nhiệm vụ, yêu cầu, phân công từ văn bản hành chính. Dùng khi người dùng nói "tạo task từ văn bản này", "có việc gì cần làm sau cuộc họp", "phân công từ biên bản", "nhiệm vụ trong công văn". Nhận diện: tên nhiệm vụ, người/đơn vị được giao, hạn thực hiện, mức độ ưu tiên.
version: 1.0.0
metadata: {"openclaw":{"emoji":"🎯","requires":{"bins":["node"]},"install":[{"id":"npm","kind":"node","pkg":"{baseDir}","label":"Cài đặt dependencies (pdf-parse, mammoth)"}]}}
---

## Khi nào dùng skill này

Dùng skill này khi:
- Vừa xử lý xong biên bản họp qua `cong-van-summary` → tự động tạo danh sách việc cần làm
- Người dùng nói: "tạo task", "việc gì cần làm", "phân công", "nhiệm vụ từ văn bản"
- Cần chuyển nội dung cuộc họp/công văn thành to-do list rõ ràng

## Quy trình thực hiện

### Bước 1 — Lấy nội dung văn bản

Nếu có file, dùng script để đọc text thô:
```bash
node {baseDir}/scripts/extract-task.js --file <đường_dẫn> --read-only
```

Script trả về text đầy đủ. **Agent tự đọc và phân tích** nội dung.

### Bước 2 — Agent tự trích xuất nhiệm vụ

Từ text nhận được, **tự phân tích và lập danh sách tasks** theo cấu trúc:
- **Tên nhiệm vụ**: ngắn gọn, rõ ràng
- **Giao cho**: đơn vị / cá nhân được phân công
- **Hạn thực hiện**: ngày cụ thể (nếu có)
- **Mức độ**: cao / trung bình / thấp

Nếu muốn gợi ý nhanh từ rule-based trước:
```bash
node {baseDir}/scripts/extract-task.js --file <đường_dẫn> --output text
```

### Bước 3 — Trình bày và xác nhận

Hiển thị danh sách tasks theo nhóm (có deadline / chưa có deadline).

Hỏi người dùng: *"Bạn có muốn tôi thêm các deadline này vào hệ thống nhắc nhở không?"*

### Bước 4 — Thêm vào deadline-reminder (nếu đồng ý)

Với mỗi task có deadline:
```bash
node {baseDir}/scripts/extract-task.js \
  --add-deadline \
  --title "<tên_task>" \
  --deadline "YYYY-MM-DD" \
  --ref "<số_công_văn>" \
  --priority high|medium|low
```

## Lưu ý

- **Agent tự phân tích bằng LLM của OpenClaw** — không cần API key riêng
- Script chỉ đảm nhiệm đọc file và regex gợi ý ban đầu
- Đặc biệt hiệu quả với biên bản họp có mục "Kết luận / Phân công"
- Luồng tối ưu: `cong-van-summary` → `task-extractor` → `deadline-reminder`
