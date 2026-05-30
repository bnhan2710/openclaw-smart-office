---
name: calendar-management
description: Bat buoc goi exec wrapper scripts/calendar-management.js de preview hoac tao su kien Google Calendar. Dung khi nguoi dung yeu cau tao lich hop, dat lich xu ly cong van, tao calendar event, tao lich that, hoac preview lich. Neu nguoi dung noi ro "tao lich that", "dat lich that", "xac nhan tao" thi phai chay wrapper voi --confirmed, khong tra loi bang lenh thu cong cho nguoi dung.
version: 1.0.0
metadata: {"openclaw":{"requires":{"bins":["node"]},"install":[{"id":"npm","kind":"node","pkg":"{baseDir}","label":"Cai dat skill calendar-management"}]}}
---

## Khi nao dung

Dung skill nay khi nguoi dung muon tao lich hop, lich xu ly cong van, Google Calendar event, hoac xem truoc lich hop. Skill nay khong goi Google Calendar truc tiep; no goi wrapper an toan o workspace root.

Neu nguoi dung noi ro muon "tao lich that", "dat lich that", "tao vao Google Calendar", "xac nhan tao", hoac "confirm", day la quyen ro rang de tao event. Trong truong hop do, cau tra loi dung la goi `exec` chay wrapper voi `--confirmed`, sau do bao ket qua. Khong duoc noi "khong co quyen truy cap", "hay chay lenh nay", hoac dua lenh `gog calendar ...` cho nguoi dung tru khi wrapper that su bao loi.

Neu co nhieu task/su kien trong cung yeu cau, bat buoc tao theo batch bang `--events-file` hoac `--events-json` trong mot lan goi wrapper. Khong tao tung lich mot roi dung lai, khong tra loi "se tao tiep" neu chua chay wrapper cho tat ca su kien.

Neu agent da de xuat khung gio mac dinh va nguoi dung tra loi "xac nhan tao lich that", "dong y gio mac dinh", "tao ngay", hoac tuong duong, xem nhu da du xac nhan. Khong hoi lai cung mot thong tin, khong xin them "xac nhan cuoi cung".

## Quy trinh

Neu nguoi dung chi yeu cau preview, noi "chua goi Google Calendar", "nhap", "xem truoc", hoac chua ro co muon tao that hay khong, tao preview truoc, khong co `--confirmed`:

```bash
node {baseDir}/scripts/calendar.js \
  --title "<tieu_de>" \
  --start "<ISO_8601_co_timezone>" \
  --end "<ISO_8601_co_timezone>" \
  --description "<noi_dung>"
```

Doc JSON tra ve, trinh bay ngan gon cho nguoi dung: tieu de, thoi gian bat dau, thoi gian ket thuc, noi dung, attendee neu co.

Neu nguoi dung da xac nhan ro rang trong cung cau lenh hoac cau vua truoc, vi du "tao lich that", "dat lich that", "xac nhan tao", "dong y tao vao Google Calendar", "confirm", chay wrapper voi `--confirmed`:

```bash
node {baseDir}/scripts/calendar.js \
  --title "<tieu_de>" \
  --start "<ISO_8601_co_timezone>" \
  --end "<ISO_8601_co_timezone>" \
  --description "<noi_dung>" \
  --confirmed
```

Neu can tao nhieu su kien, ghi JSON array vao file tam va goi wrapper mot lan:

```bash
node {baseDir}/scripts/calendar.js \
  --events-file "/tmp/calendar-events.json" \
  --confirmed
```

File JSON co dang:

```json
[
  {
    "title": "[Cong van 128/PNV-VP] Ra soat danh muc ho so can bo/cong chuc",
    "start": "2026-06-01T08:30:00+07:00",
    "end": "2026-06-01T09:30:00+07:00",
    "description": "Task tu cong van 128/PNV-VP. Uu tien cao."
  }
]
```

Neu muon kiem tra duong goi `gog` nhung van khong tao that, dung `--confirmed --dry-run`.

Neu lenh thanh cong, tra loi ngan gon rang da tao lich va tom tat tieu de/thoi gian. Neu batch thanh cong, bao tong so da tao va liet ke tat ca su kien. Neu lenh loi, tra lai dung loi cua wrapper. Khong suy doan rang chua co quyen khi chua chay wrapper.

## Tham so

- `--title`: tieu de su kien, bat buoc.
- `--start`: thoi gian bat dau ISO 8601, vi du `2026-06-02T09:00:00+07:00`.
- `--end`: thoi gian ket thuc ISO 8601.
- `--description`: noi dung su kien.
- `--attendees`: danh sach email ngan cach bang dau phay, tuy chon.
- `--calendar-id`: lich can tao, mac dinh `GOOGLE_CALENDAR_ID` hoac `primary`.
- `--events-json`: JSON array nhieu su kien, moi phan tu co `title`, `start`, `end`, `description`, `attendees`, `calendar_id`.
- `--events-file`: duong dan file JSON array nhieu su kien.
- `--confirmed`: dung khi nguoi dung da noi ro muon tao lich that, hoac sau khi da xem preview va xac nhan.

## Cau hinh

- Cai va auth `gog` tren may host neu can tao lich that.
- Neu `gog` duoc cai trong workspace, wrapper tu tim `tools/gog/gog.exe`.
- Wrapper mac dinh dung `tools/gog-state` lam `GOG_HOME`, nen khi auth thu cong hay dung cung thu muc nay.
- Dat `GOG_BIN` neu binary `gog` khong nam trong `PATH`.
- Dat `GOOGLE_CALENDAR_ID` neu khong muon tao vao calendar `primary`.

## An toan

- Duoc them `--confirmed` trong lan goi dau tien neu chinh cau lenh cua nguoi dung da noi ro muon tao lich that.
- Khong tao lich that neu nguoi dung chi yeu cau preview.
- Neu wrapper tra loi loi thieu `gog`, huong dan nguoi dung cai/auth `gog` thay vi bypass wrapper.
