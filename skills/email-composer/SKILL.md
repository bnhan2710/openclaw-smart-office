---
name: email-composer
description: Soan tieu de va noi dung email tieng Viet chuyen nghiep theo van phong hanh chinh truoc khi tao Gmail draft hoac gui SMTP. Dung khi nguoi dung yeu cau soan email, gui email, viet noi dung mail, nhac han qua email, moi hop, yeu cau hop khan, yeu cau bao cao, hoac phan hoi cong viec. Khong gui mail; chi tao subject/body co y nghia de skill email-automation gui.
version: 1.0.0
metadata: {"openclaw":{"requires":{"bins":["node"]},"install":[{"id":"npm","kind":"node","pkg":"{baseDir}","label":"Cai dat skill email-composer"}]}}
---

## Khi nao dung

Dung skill nay moi khi nguoi dung yeu cau soan email hoac gui email ma chua cung cap san tieu de va noi dung hoan chinh. Muc tieu la bien cau lenh ngan, cau lenh noi tu nhien, hoac noi dung thieu y thanh email hanh chinh co the gui duoc.

Khong gui email trong skill nay. Sau khi co JSON ket qua, dung `email.email.subject` va `email.email.body` lam dau vao cho `email-automation`.

## Bat buoc

- Khong dung nguyen cau lenh cua nguoi dung lam subject/body.
- Khong de subject dai kieu "soan noi dung email va gui...".
- Khong gui body mot dong ngan cut.
- Luon tao email bang tieng Viet, van phong hanh chinh, ro muc dich, ro yeu cau, co loi chao va loi ket.
- Luon tao body plain text voi xuong dong that. Khong dung HTML, khong dung `<br>`, khong dung the `<p>`, khong dung markdown table.
- Neu thieu ten nguoi nhan, dung "Kinh gui Anh/Chi,".
- Neu nguoi dung yeu cau hop khan, subject nen la "De nghi tham du cuoc hop khan cap" hoac tuong duong, body phai noi ro muc dich hop, noi dung du kien, de nghi xac nhan tham du.
- Neu co thoi gian, dia diem, han phan hoi, dua vao body theo gach dau dong.

## Quy trinh

Chay wrapper:

```bash
node {baseDir}/scripts/compose.js \
  --request "<cau_lenh_hoac_muc_dich_email>" \
  --to "<email_nguoi_nhan>"
```

Co the them:

```bash
--recipient "<ten_nguoi_nhan_hoac_don_vi>" \
--sender "<ten_nguoi_gui>" \
--time "<thoi_gian_hop>" \
--location "<dia_diem_hinh_thuc>" \
--deadline "<han_phan_hoi>"
```

Doc JSON tra ve. Ket qua can dung:

- `data.email.subject`: tieu de email da soan.
- `data.email.body`: noi dung email da soan.
- `data.email.to`: nguoi nhan neu co.

## Phoi hop voi email-automation

Neu nguoi dung chi noi "soan email", tra preview subject/body cho nguoi dung.

Neu nguoi dung noi "gui email", "gui mail", "da dong y gui", hoac ro rang muon gui that:

1. Chay `email-composer` truoc de lay subject/body.
2. Chay `email-automation` voi `--to`, `--subject`, `--body`.
3. Neu day la lenh gui that da ro rang, duoc dung `--confirmed --smtp` theo cau hinh hien co. Neu chi tao draft, dung `--confirmed` khong `--smtp`.
4. Bao ket qua ngan gon sau khi wrapper gui/tao draft thanh cong.

## Mau chat luong

Subject tot:

```text
De nghi tham du cuoc hop khan cap
```

Body tot:

```text
Kinh gui Anh/Chi,

Toi gui email nay de de nghi Anh/Chi tham du cuoc hop khan cap nham trao doi va thong nhat phuong an xu ly cong viec phat sinh.

Noi dung du kien:
- Trao doi ve noi dung cong viec can xu ly.
- Lam ro tinh hinh, vuong mac va phuong an trien khai.
- Thong nhat dau moi thuc hien, thoi han hoan thanh va cac buoc tiep theo.

De nghi Anh/Chi xac nhan kha nang tham du va chuan bi cac thong tin, tai lieu lien quan de cuoc hop dat hieu qua.

Tran trong,
```
