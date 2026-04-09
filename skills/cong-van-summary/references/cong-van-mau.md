# Tham Chiếu Cấu Trúc Công Văn Hành Chính Việt Nam

Tài liệu này mô tả cấu trúc chuẩn của các loại văn bản hành chính theo **Nghị định 30/2020/NĐ-CP** về công tác văn thư.

---

## 1. Công Văn (CV)

**Ký hiệu mẫu**: `123/CV-UBND`, `45/CV-BTC`

**Cấu trúc bắt buộc**:
```
[QUỐC HIỆU - TIÊU NGỮ]
[Tên cơ quan ban hành]                    [Địa danh, ngày tháng năm]
Số: ___/CV-[KH]

V/v [trích yếu ngắn gọn]

                    Kính gửi: [Tên cơ quan/người nhận]

[Nội dung chính - mở đầu bằng căn cứ pháp lý hoặc lý do]

[Phần đề xuất/yêu cầu - thường đánh số]

[Lời kết - "Trân trọng./"]
                              [Chức vụ người ký]
                              [Chữ ký]
                              [Họ tên]
Nơi nhận:
- [Danh sách nơi nhận];
- Lưu: VT, [phòng ban liên quan].
```

**Điểm nhận diện**:
- Có từ khóa "Kính gửi:"
- Số hiệu dạng `\d+/CV-\w+`
- Kết thúc bằng "Nơi nhận"

---

## 2. Tờ Trình (TTr)

**Ký hiệu mẫu**: `12/TTr-UBND`

**Mục đích**: Đề xuất cấp trên phê duyệt chủ trương, quyết định, dự án.

**Cấu trúc**:
```
Số: ___/TTr-[KH]

                    Kính trình: [Tên cấp trên]

I. SỰ CẦN THIẾT
[Lý do, căn cứ]

II. NỘI DUNG ĐỀ XUẤT
[Chi tiết đề xuất]

III. KIẾN NGHỊ
[Đề nghị cụ thể]

                              [Ký tên]
```

**Điểm nhận diện**:
- Có từ khóa "Kính trình:"
- Thường có các mục La Mã (I, II, III)
- Kết thúc bằng "Kiến nghị" hoặc "Đề nghị"

---

## 3. Thông Báo (TB)

**Ký hiệu mẫu**: `34/TB-UBND`

**Mục đích**: Thông báo chủ trương, quyết định, kết quả công việc.

**Cấu trúc**:
```
Số: ___/TB-[KH]

THÔNG BÁO
[Tiêu đề thông báo]

[Nội dung thông báo]

[Yêu cầu thực hiện nếu có]

Nơi nhận: ...
```

**Điểm nhận diện**:
- Có tiêu đề "THÔNG BÁO" viết hoa
- Không có "Kính gửi" hoặc "Kính trình"
- Số hiệu dạng `\d+/TB-\w+`

---

## 4. Biên Bản (BB)

**Ký hiệu mẫu**: `05/BB-UBND`

**Mục đích**: Ghi lại sự kiện, cuộc họp, buổi làm việc.

**Cấu trúc**:
```
BIÊN BẢN
[Về việc gì / cuộc họp gì]

Thời gian: ...
Địa điểm: ...
Thành phần: ...

I. NỘI DUNG
[Diễn biến]

II. KẾT LUẬN / KẾT QUẢ
[Kết luận, phân công]

Biên bản kết thúc lúc ... giờ ...

[Chữ ký các bên]
```

**Điểm nhận diện**:
- Bắt đầu bằng "BIÊN BẢN" viết hoa
- Có "Thời gian:", "Địa điểm:", "Thành phần:"
- Có chữ ký từ 2 phía trở lên

---

## 5. Quyết Định (QĐ)

**Ký hiệu mẫu**: `100/QĐ-UBND`

**Cấu trúc**:
```
Số: ___/QĐ-[KH]

QUYẾT ĐỊNH
[Về việc / V/v ...]

[CHỨC VỤ NGƯỜI KÝ]

Căn cứ [văn bản pháp lý]...
Theo đề nghị của ...

QUYẾT ĐỊNH:
Điều 1. ...
Điều 2. ...
Điều 3. [Hiệu lực thi hành]

Nơi nhận: ...
```

**Điểm nhận diện**:
- Có "QUYẾT ĐỊNH" viết hoa (2 lần)
- Cấu trúc "Điều 1, Điều 2, Điều 3"
- Có phần "Căn cứ"

---

## Bảng Ký Hiệu Loại Văn Bản Phổ Biến

| Ký hiệu | Loại văn bản        |
|---------|---------------------|
| CV      | Công văn            |
| TTr     | Tờ trình            |
| TB      | Thông báo           |
| BB      | Biên bản            |
| QĐ      | Quyết định          |
| KH      | Kế hoạch            |
| BC      | Báo cáo             |
| TT      | Thông tư            |
| NQ      | Nghị quyết          |
| CT      | Chỉ thị             |

---

## Mức Độ Khẩn Cấp

| Ký hiệu trên bì/văn bản | Ý nghĩa                                  | Thời hạn xử lý thông thường |
|--------------------------|------------------------------------------|-----------------------------|
| HỎA TỐC                 | Cực kỳ khẩn, ưu tiên tuyệt đối          | Trong ngày / ngay lập tức   |
| THƯỢNG KHẨN             | Rất khẩn                                 | Trong 24 giờ                |
| KHẨN                    | Khẩn cấp                                 | Trong 3 ngày                |
| (không ghi)             | Thường                                   | Theo quy định               |

---

## Lưu Ý Khi Xử Lý

1. **Số công văn** là định danh duy nhất — luôn trích xuất để tham chiếu
2. **Ngày ban hành** cần chuyển về format `YYYY-MM-DD` để xử lý deadline
3. **Yêu cầu/chỉ đạo** thường nằm ở phần cuối, đánh số thứ tự
4. Với văn bản có **mức độ khẩn**, cần cảnh báo ngay cho người dùng
5. **Nơi nhận** ở cuối văn bản giúp xác định cơ quan thực hiện
