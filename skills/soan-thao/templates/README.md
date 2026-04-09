# Templates Văn Bản Hành Chính

Thư mục này chứa các file template `.docx` dùng cho skill soạn thảo.

## Cách tạo template

Templates sử dụng thư viện `docxtemplater` với cú pháp `{variable}`.

### Placeholder có sẵn trong template

| Placeholder | Mô tả |
|-------------|-------|
| `{content}` | Nội dung văn bản đã soạn |
| `{generated_date}` | Ngày tạo file |

## Tạo template tùy chỉnh

1. Tạo file `.docx` chuẩn định dạng cơ quan bạn
2. Chèn placeholder `{content}` vào vị trí nội dung
3. Lưu file vào thư mục này với tên: `cong-van.docx`, `to-trinh.docx`, `bien-ban.docx`
4. Script `generate.js` sẽ tự động dùng template nếu có

> **Lưu ý**: Nếu không có file template, script sẽ tự tạo file `.docx` đơn giản với font Times New Roman 13pt — đúng theo quy định văn bản hành chính Việt Nam.

## Nguồn tham khảo mẫu

- [Nghị định 30/2020/NĐ-CP](https://thuvienphapluat.vn/van-ban/Bo-may-hanh-chinh/Nghi-dinh-30-2020-ND-CP-cong-tac-van-thu-435573.aspx)
- Thông tư 01/2011/TT-BNV hướng dẫn thể thức văn bản
