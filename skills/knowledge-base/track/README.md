# Knowledge Base Track

Thư mục này là sổ tay handoff cho skill `knowledge-base`.

## Cách dùng

- Đọc `progress.md` trước khi sửa `scripts/rag.js`
- Đọc thêm `roadmap.md` để biết hướng phát triển tiếp theo
- Đọc `benchmarking.md` khi cần kiểm tra regression
- Sau mỗi thay đổi, cập nhật lại trạng thái trong `progress.md`
- Nếu đổi hành vi retrieval hoặc metadata, cập nhật thêm `SKILL.md`

## Quy ước

- `done`: đã hoàn tất và đã có trong code
- `partial`: có trong code nhưng chưa ổn định hoặc mới một phần
- `next`: việc nên làm tiếp theo
- `risk`: điểm có thể gây lệch kết quả hoặc làm hỏng index cũ

## Liên kết làm việc

- Retrieval: `scripts/rag.js`
- Hướng dẫn dùng: `SKILL.md`
- Roadmap: `roadmap.md`
- Benchmarking: `benchmarking.md`
- Dữ liệu lưu index: `data/kb-index/index.json` (payload versioned)
- Dữ liệu tài liệu gốc: `data/knowledge-base/`
