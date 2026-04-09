---
name: deadline-reminder
description: Theo dõi và nhắc nhở hạn xử lý công văn, nhiệm vụ. Dùng khi người dùng nói "nhắc tôi về...", "thêm deadline", "việc gì sắp đến hạn", "hạn xử lý...", hoặc khi skill cong-van-summary phát hiện hạn xử lý trong văn bản. Gửi thông báo tự động qua Telegram hoặc email theo lịch cron hàng ngày.
version: 1.0.0
metadata: {"openclaw":{"emoji":"⏰","requires":{"bins":["node"]},"install":[{"id":"npm","kind":"node","pkg":"{baseDir}","label":"Cài đặt dependencies (nodemailer)"}]}}
---

## Khi nào dùng skill này

Dùng skill này khi:
- `cong-van-summary` hoặc `task-extractor` phát hiện `han_xu_ly` trong văn bản → tự động thêm
- Người dùng nói: "nhắc tôi", "thêm nhắc nhở", "đặt deadline", "việc gì cần làm"
- Người dùng hỏi: "deadline nào sắp đến?", "hôm nay cần làm gì?"
- Cần xem danh sách, thêm, hoặc xóa deadline

## Quy trình thực hiện

### Thêm deadline mới

```bash
node {baseDir}/scripts/cron.js --add \
  --title "<tên_nhiệm_vụ>" \
  --deadline "YYYY-MM-DD" \
  --ref "<số_công_văn_tham_chiếu>" \
  --priority high|medium|low
```

### Xem danh sách sắp đến hạn

```bash
# Deadline trong 7 ngày tới
node {baseDir}/scripts/cron.js --list --days 7

# Toàn bộ deadline đang theo dõi
node {baseDir}/scripts/cron.js --list --days 365
```

### Kiểm tra và gửi thông báo ngay

```bash
node {baseDir}/scripts/cron.js --check --notify
```

### Xóa deadline

```bash
node {baseDir}/scripts/cron.js --remove --id <id>
```

### Khởi động daemon nhắc nhở tự động

```bash
node {baseDir}/scripts/cron.js --daemon
```

Daemon gửi thông báo lúc `REMINDER_TIME` (mặc định 08:00) mỗi ngày qua Telegram/email.

## Mức độ ưu tiên

| `--priority` | Dùng khi |
|---|---|
| `high` | Văn bản khẩn/hỏa tốc, deadline ≤ 3 ngày |
| `medium` | Deadline trong 1-2 tuần |
| `low` | Không có hạn rõ ràng, nhiệm vụ định hướng |

## Cấu hình kênh thông báo

Đặt trong `~/.openclaw/openclaw.json`:
```json
{
  "skills": {
    "entries": {
      "deadline-reminder": {
        "env": {
          "TELEGRAM_BOT_TOKEN": "...",
          "TELEGRAM_CHAT_ID": "...",
          "REMINDER_TIME": "08:00",
          "REMINDER_DAYS_BEFORE": "3,1"
        }
      }
    }
  }
}
```

## Lưu ý

- Deadlines được lưu tại `./data/deadlines.json` (hoặc `DEADLINES_FILE`)
- Tự động gọi skill này sau `cong-van-summary` nếu phát hiện hạn xử lý
- Dùng `--daemon` với PM2 để nhắc nhở 24/7: `pm2 start {baseDir}/scripts/cron.js --name deadline-reminder -- --daemon`
