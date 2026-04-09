# OpenClaw Smart Office

Skills cho [OpenClaw](https://openclaw.ai) — agent quản lý văn phòng thông minh, xử lý công văn hành chính Việt Nam.

---

## Skills

| Skill | Mô tả | API Key riêng? | User Stories |
|---|---|---|---|
| `cong-van-summary` | Tóm tắt & trích xuất thông tin từ công văn (PDF/DOCX) | Không | US-05, US-06 |
| `knowledge-base` | RAG tra cứu quy định, văn bản nội bộ | **Có** (embedding) | US-08 |
| `soan-thao` | Agent soạn nội dung → script xuất file `.docx` | Không | US-09, US-10, US-11 |
| `deadline-reminder` | Theo dõi & nhắc hạn xử lý qua Telegram/email | Không | US-13, US-14 |
| `task-extractor` | Agent phân tích NLP → script đọc file & rule-based | Không | US-13 |

> **Nguyên tắc thiết kế**: OpenClaw đã có LLM tích hợp sẵn. Scripts chỉ làm những việc agent không làm trực tiếp được: đọc file nhị phân (PDF/DOCX), xuất DOCX, tạo vector index, lưu dữ liệu. Chỉ `knowledge-base` cần API key riêng để tạo vector embedding.

---

## Yêu cầu

- [OpenClaw](https://openclaw.ai) đã cài đặt (`npm i -g openclaw`)
- Node.js >= 18
- OpenAI API Key — **chỉ cho `knowledge-base`** (tạo vector embedding cho RAG)

---

## Cài Đặt Skills

OpenClaw tự động load skills từ thư mục `skills/` trong workspace:

```bash
# Clone repo vào workspace OpenClaw
git clone https://github.com/your-repo/openclaw-smart-office
cd openclaw-smart-office

# Cài dependencies cho từng skill
for skill in cong-van-summary knowledge-base soan-thao deadline-reminder task-extractor; do
  echo "Installing $skill..."
  (cd skills/$skill && npm install)
done
```

---

## Cấu Hình (`~/.openclaw/openclaw.json`)

```json
{
  "skills": {
    "entries": {
      "knowledge-base": {
        "env": {
          "OPENAI_API_KEY": "sk-...",
          "EMBEDDING_MODEL": "text-embedding-3-small",
          "KB_DATA_DIR": "./data/knowledge-base",
          "KB_INDEX_DIR": "./data/kb-index",
          "SIMILARITY_THRESHOLD": "0.75",
          "TOP_K": "5"
        }
      },
      "soan-thao": {
        "env": {
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
      }
    }
  }
}
```

> **Bảo mật**: `~/.openclaw/openclaw.json` có quyền `owner-only`. Không lưu secrets vào source code hay `.env` trong repo.

---

## Xây dựng Knowledge Base

```bash
# Đặt tài liệu (PDF/DOCX/TXT) vào data/documents
mkdir -p data/documents

# Build vector index (cần OPENAI_API_KEY trong openclaw.json)
node skills/knowledge-base/scripts/rag.js --build --source ./data/documents
```

---

## Luồng xử lý điển hình

```
Công văn đến (PDF/DOCX)
  └─► cong-van-summary    ← agent đọc & tóm tắt, script extract text
        └─► task-extractor ← agent phân tích nhiệm vụ, script đọc file
              └─► deadline-reminder ← lưu hạn vào JSON, daemon Telegram

Câu hỏi quy định/thủ tục
  └─► knowledge-base      ← script vector search → agent trả lời + trích dẫn

Yêu cầu soạn văn bản
  └─► (knowledge-base)    ← tra cứu căn cứ pháp lý (nếu cần)
        └─► soan-thao     ← agent soạn nội dung → script xuất .docx
```

---

## Tham khảo

- [OpenClaw Docs — Skills](https://docs.openclaw.ai/tools/skills)
- [ClawHub Registry](https://clawhub.ai)
- [Nghị định 30/2020/NĐ-CP](https://thuvienphapluat.vn/van-ban/Bo-may-hanh-chinh/Nghi-dinh-30-2020-ND-CP-cong-tac-van-thu-435573.aspx) — Chuẩn văn bản hành chính
