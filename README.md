# OpenClaw Smart Office

Skills cho [OpenClaw](https://openclaw.ai) — agent quản lý văn phòng thông minh, xử lý công văn hành chính Việt Nam.

---

## Skills

| Skill | Mô tả | User Stories |
|---|---|---|
| `cong-van-summary` | Tóm tắt & trích xuất thông tin từ công văn (PDF/DOCX)|
| `knowledge-base` | RAG tra cứu quy định, văn bản nội bộ|
| `soan-thao` | Soạn công văn, tờ trình, biên bản → xuất `.docx`|
| `deadline-reminder` | Theo dõi & nhắc hạn xử lý qua Telegram/email|
| `task-extractor` | NLP tự động trích xuất nhiệm vụ từ văn bản|

---

## Yêu cầu

- [OpenClaw](https://openclaw.ai) đã cài đặt (`npm i -g openclaw`)
- Node.js >= 18
- OpenAI API Key (cho knowledge-base, soan-thao, task-extractor)

---

## Cài Đặt Skills

OpenClaw tự động load skills từ thư mục `skills/` trong workspace. Clone repo này vào workspace OpenClaw của bạn:

```bash
# Option 1: Clone vào workspace hiện tại
git clone https://github.com/your-repo/openclaw-smart-office ./openclaw-smart-office
cd openclaw-smart-office

# Option 2: Dùng clawhub CLI (nếu publish lên ClawHub)
npx clawhub@latest install smart-office
```

### Cài dependencies cho từng skill

```bash
for skill in cong-van-summary knowledge-base soan-thao deadline-reminder task-extractor; do
  echo "Installing $skill..."
  (cd skills/$skill && npm install)
done
```

---

## Cấu Hình

Thêm vào `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "knowledge-base": {
        "env": {
          "OPENAI_API_KEY": "sk-...",
          "KB_DATA_DIR": "./data/knowledge-base",
          "KB_INDEX_DIR": "./data/kb-index"
        }
      },
      "soan-thao": {
        "env": {
          "OPENAI_API_KEY": "sk-...",
          "CO_QUAN_TEN": "UBND Tỉnh X",
          "CO_QUAN_KY_HIEU": "UBND",
          "OUTPUT_DIR": "./output/van-ban"
        }
      },
      "deadline-reminder": {
        "env": {
          "TELEGRAM_BOT_TOKEN": "...",
          "TELEGRAM_CHAT_ID": "...",
          "REMINDER_TIME": "08:00",
          "REMINDER_DAYS_BEFORE": "3,1",
          "DEADLINES_FILE": "./data/deadlines.json"
        }
      },
      "task-extractor": {
        "env": {
          "OPENAI_API_KEY": "sk-..."
        }
      }
    }
  }
}
```

> **Lưu ý bảo mật**: Không hardcode API key trong source code. Dùng `~/.openclaw/openclaw.json` (file chỉ owner đọc được) hoặc SecretRef cho production.

---

## Xây dựng Knowledge Base

```bash
# Đặt tài liệu (PDF/DOCX/TXT) vào thư mục data/documents
mkdir -p data/documents

# Build vector index
node skills/knowledge-base/scripts/rag.js --build --source ./data/documents
```

---

## Luồng xử lý điển hình

```
Công văn đến → cong-van-summary → task-extractor → deadline-reminder
                                                          ↓
                                               Thông báo Telegram 08:00
Câu hỏi quy định → knowledge-base → câu trả lời có trích dẫn
Yêu cầu soạn văn bản → (knowledge-base) → soan-thao → file .docx
```

---

## Tham khảo

- [OpenClaw Docs — Skills](https://docs.openclaw.ai/tools/skills)
- [ClawHub Registry](https://clawhub.ai)
- [Nghị định 30/2020/NĐ-CP](https://thuvienphapluat.vn/van-ban/Bo-may-hanh-chinh/Nghi-dinh-30-2020-ND-CP-cong-tac-van-thu-435573.aspx) — Chuẩn văn bản hành chính
