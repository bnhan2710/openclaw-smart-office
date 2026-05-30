---
name: soan-thao
description: "Soạn thảo văn bản hành chính chuẩn Nghị định 30/2020/NĐ-CP và xuất file DOCX/PDF bằng scripts/generate.js. Dùng khi người dùng yêu cầu soạn công văn, viết tờ trình, báo cáo/tờ trình phê duyệt, làm biên bản, soạn văn bản trả lời, hoặc tạo file .docx/.pdf. Nếu người dùng nói xuất ngay, ngay lập tức, để placeholder, bản nháp, DOCX/PDF, hoặc xác nhận xuất file, bắt buộc chạy exec generate.js ngay rồi gửi file bằng message; không hỏi thêm, không preview, không chỉ hứa gửi sau."
version: 1.0.0
metadata: {"openclaw":{"emoji":"✍️","requires":{"bins":["node"]},"install":[{"id":"npm","kind":"node","pkg":"{baseDir}","label":"Cài đặt dependencies (docx, docxtemplater, pdfmake)"}]}}
---

## Khi nào dùng skill này

Dùng skill này khi:
- Người dùng nói: "soạn công văn", "viết tờ trình", "làm biên bản", "soạn văn bản"
- Cần tạo file `.docx` hoặc `.pdf` cho văn bản hành chính
- Người dùng cung cấp nội dung thô / ghi chú cuộc họp → cần chuyển thành văn bản chuẩn
- Cần soạn thư trả lời một công văn vừa đọc
- Người dùng nói "xuất ngay", "ngay lập tức", "để placeholder", "bản nháp", "xuất DOCX/PDF", hoặc "gửi file" sau khi đã có nội dung trong ngữ cảnh

## Luật bắt buộc khi xuất file ngay

Nếu yêu cầu có các cụm như "ngay lập tức", "xuất ngay", "xuất file ngay", "để placeholder", "bản nháp", "DOCX + PDF", "PDF và DOCX", hoặc người dùng đã xác nhận xuất file:

- Không hỏi thêm thông tin.
- Không nói "mình sẽ xuất", "mình đang xuất", "mình chưa thể xuất", hoặc chỉ trả bản text.
- Không preview lại toàn bộ nội dung để chờ xác nhận.
- Dùng placeholder `[....]` cho trường còn thiếu.
- Tạo file tạm chứa nội dung văn bản.
- Gọi `exec` chạy `scripts/generate.js` ngay.
- Sau khi có file, gọi `message` để gửi từng file bằng `filePath`/`path`/`media`.
- Nếu lỗi, trả đúng lỗi thực tế từ lệnh export.
- Nội dung đưa vào `--content-file` chỉ được là thân văn bản hành chính. Không ghi lời thoại kiểu "Đã rõ", "mình sẽ xuất", hướng dẫn gửi tiếp, markdown fence, dấu `---`, hoặc heading `###`.
- Văn bản phải có văn phong hành chính: căn cứ, nội dung đề nghị/yêu cầu, tổ chức thực hiện, nơi nhận, chức danh ký. Tránh câu chat tự nhiên.

## Quy trình thực hiện

### Bước 1 — Thu thập thông tin

Chỉ hỏi thêm thông tin khi người dùng chưa yêu cầu xuất ngay và chưa xác nhận dùng placeholder.

Hỏi người dùng (hoặc suy ra từ context):
- **Loại văn bản**: `cong-van` / `to-trinh` / `bien-ban`
- **Trích yếu / tiêu đề**: nội dung ngắn gọn
- **Kính gửi / Kính trình**: tên cơ quan hoặc cá nhân nhận
- **Nội dung chính**: chi tiết yêu cầu, đề xuất, hoặc diễn biến cuộc họp
- (Biên bản thêm) **Thành phần tham dự**

Nếu người dùng yêu cầu xuất ngay hoặc chấp nhận placeholder, bỏ qua bước hỏi và tự điền `[....]` cho trường còn thiếu.

### Bước 2 — Soạn nội dung (agent tự làm)

Dựa trên thông tin đã thu thập, **tự soạn toàn bộ nội dung văn bản** theo chuẩn Nghị định 30/2020/NĐ-CP:
- Quốc hiệu, tiêu ngữ, tên cơ quan
- Số hiệu, địa danh, ngày tháng
- Trích yếu (V/v...)
- Kính gửi / Kính trình
- Nội dung chính (căn cứ, nội dung, yêu cầu)
- Lời kết, chức danh ký
- Nơi nhận

Hiển thị bản text đầy đủ cho người dùng xem trước và xác nhận chỉ khi người dùng đang yêu cầu soạn nháp để xem. Nếu người dùng đã yêu cầu xuất ngay, chuyển thẳng sang bước xuất file.

### Bước 3 — Xuất file DOCX/PDF

Sau khi người dùng xác nhận nội dung hoặc yêu cầu xuất ngay, lưu text vào file tạm rồi gọi script. Hỏi rõ định dạng chỉ khi người dùng chưa nêu định dạng. Nếu người dùng nói "PDF và DOCX", "DOCX + PDF", "pdf hoặc docx", hoặc "xuất file ngay" thì xuất cả hai bằng `--format both`.
- `.docx`
- `.pdf`
- hoặc cả hai

Mặc định nếu người dùng chỉ nói "xuất file Word/văn bản" thì xuất `.docx`. Nếu người dùng nói "file" chung chung trong ngữ cảnh hành chính và có nhắc PDF/DOCX ở lượt trước, xuất cả hai.

**Không được** tự bịa phương án `.odt`, `.html`, hay nói "môi trường chưa có thư viện" nếu file `{baseDir}/scripts/generate.js` còn tồn tại và chạy được.

Ví dụ:
```bash
# Lưu content vào file tạm
echo "<nội_dung_đã_soạn>" > /tmp/van-ban-draft.txt

# Xuất DOCX
node {baseDir}/scripts/generate.js \
  --type <loại> \
  --content-file /tmp/van-ban-draft.txt \
  --format docx \
  --output <tên_file>.docx

# Xuất PDF
node {baseDir}/scripts/generate.js \
  --type <loại> \
  --content-file /tmp/van-ban-draft.txt \
  --format pdf \
  --output <tên_file>.pdf

# Xuất cả hai
node {baseDir}/scripts/generate.js \
  --type <loại> \
  --content-file /tmp/van-ban-draft.txt \
  --format both \
  --output <tên_file_không_cần_đuôi>
```

File được lưu vào `./output/van-ban/` trong workspace (hoặc `OUTPUT_DIR`). Thông báo đường dẫn file cho người dùng.

Sau khi script thành công, gửi file qua `message`, ví dụ:

```json
{"filePath":"./output/van-ban/<ten-file>.docx","caption":"Bản DOCX"}
{"filePath":"./output/van-ban/<ten-file>.pdf","caption":"Bản PDF"}
```

## Các loại văn bản

| `--type` | Loại | Dùng khi |
|----------|------|----------|
| `cong-van` | Công văn | Trao đổi, yêu cầu, thông báo ngang/xuống cấp |
| `to-trinh` | Tờ trình | Đề xuất lên cấp trên phê duyệt |
| `bien-ban` | Biên bản | Ghi lại cuộc họp, sự kiện, bàn giao |

## Templates

Templates `.docx` chuẩn Nghị định 30 nằm tại `{baseDir}/templates/`. Xem `{baseDir}/templates/README.md` để tạo template tùy chỉnh theo mẫu cơ quan.

## Lưu ý

- **Agent tự soạn nội dung** — script `generate.js` chỉ xuất DOCX/PDF, không gọi LLM
- Tra cứu `knowledge-base` trước nếu cần căn cứ pháp lý
- Chỉ cho xem trước nội dung khi người dùng yêu cầu xem trước; không preview khi người dùng đã nói xuất ngay hoặc để placeholder
- Biến môi trường `CO_QUAN_TEN` và `CO_QUAN_KY_HIEU` xác định tên và ký hiệu cơ quan ban hành
- Nếu script trả kết quả thành công, luôn gửi file/đường dẫn file đã tạo thay vì đề xuất định dạng thay thế
