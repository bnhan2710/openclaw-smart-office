---
name: soan-thao
description: Soạn thảo văn bản hành chính chuẩn Nghị định 30/2020/NĐ-CP: công văn, tờ trình, biên bản họp. Dùng khi người dùng yêu cầu "soạn công văn", "viết tờ trình", "làm biên bản", "soạn văn bản trả lời", hoặc cần tạo file .docx từ nội dung thô. Xuất file Word sẵn sàng ký gửi.
version: 1.0.0
metadata: {"openclaw":{"emoji":"✍️","requires":{"bins":["node"]},"install":[{"id":"npm","kind":"node","pkg":"{baseDir}","label":"Cài đặt dependencies (docx, docxtemplater)"}]}}
---

## Khi nào dùng skill này

Dùng skill này khi:
- Người dùng nói: "soạn công văn", "viết tờ trình", "làm biên bản", "soạn văn bản"
- Cần tạo file `.docx` cho văn bản hành chính
- Người dùng cung cấp nội dung thô / ghi chú cuộc họp → cần chuyển thành văn bản chuẩn
- Cần soạn thư trả lời một công văn vừa đọc

## Quy trình thực hiện

### Bước 1 — Thu thập thông tin

Hỏi người dùng (hoặc suy ra từ context):
- **Loại văn bản**: `cong-van` / `to-trinh` / `bien-ban`
- **Trích yếu / tiêu đề**: nội dung ngắn gọn
- **Kính gửi / Kính trình**: tên cơ quan hoặc cá nhân nhận
- **Nội dung chính**: chi tiết yêu cầu, đề xuất, hoặc diễn biến cuộc họp
- (Biên bản thêm) **Thành phần tham dự**

### Bước 2 — Soạn nội dung (agent tự làm)

Dựa trên thông tin đã thu thập, **tự soạn toàn bộ nội dung văn bản** theo chuẩn Nghị định 30/2020/NĐ-CP:
- Quốc hiệu, tiêu ngữ, tên cơ quan
- Số hiệu, địa danh, ngày tháng
- Trích yếu (V/v...)
- Kính gửi / Kính trình
- Nội dung chính (căn cứ, nội dung, yêu cầu)
- Lời kết, chức danh ký
- Nơi nhận

Hiển thị bản text đầy đủ cho người dùng xem trước và xác nhận.

### Bước 3 — Xuất file DOCX

Sau khi người dùng xác nhận nội dung, lưu text vào file tạm rồi gọi script:
```bash
# Lưu content vào file tạm
echo "<nội_dung_đã_soạn>" > /tmp/van-ban-draft.txt

# Xuất DOCX
node {baseDir}/scripts/generate.js \
  --type <loại> \
  --content-file /tmp/van-ban-draft.txt \
  --output <tên_file>.docx
```

File được lưu vào `./output/van-ban/` (hoặc `OUTPUT_DIR`). Thông báo đường dẫn file cho người dùng.

## Các loại văn bản

| `--type` | Loại | Dùng khi |
|----------|------|----------|
| `cong-van` | Công văn | Trao đổi, yêu cầu, thông báo ngang/xuống cấp |
| `to-trinh` | Tờ trình | Đề xuất lên cấp trên phê duyệt |
| `bien-ban` | Biên bản | Ghi lại cuộc họp, sự kiện, bàn giao |

## Templates

Templates `.docx` chuẩn Nghị định 30 nằm tại `{baseDir}/templates/`. Xem `{baseDir}/templates/README.md` để tạo template tùy chỉnh theo mẫu cơ quan.

## Lưu ý

- **Agent tự soạn nội dung** — script `generate.js` chỉ xuất DOCX, không gọi LLM
- Tra cứu `knowledge-base` trước nếu cần căn cứ pháp lý
- Luôn cho người dùng xem trước nội dung trước khi xuất file
- Biến môi trường `CO_QUAN_TEN` và `CO_QUAN_KY_HIEU` xác định tên và ký hiệu cơ quan ban hành
