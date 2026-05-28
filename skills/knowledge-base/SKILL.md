---
name: knowledge-base
description: Tra cứu quy định, văn bản pháp lý, tiền lệ từ kho tài liệu nội bộ sử dụng RAG (Retrieval-Augmented Generation). Dùng khi người dùng hỏi "quy định về...", "tìm văn bản liên quan đến...", "có tiền lệ nào về...", "quy trình xử lý...", hoặc cần tham chiếu văn bản nội bộ trước khi soạn thảo. Trả lời có trích dẫn nguồn cụ thể (số hiệu, tên văn bản).
version: 1.3.0
metadata: {"openclaw":{"emoji":"🔍","requires":{"bins":["node"]},"install":[{"id":"npm","kind":"node","pkg":"{baseDir}","label":"Cài đặt dependencies (openai, pdf-parse, mammoth)"}]}}
---

## Khi nào dùng skill này

Dùng skill này khi:
- Người dùng hỏi về quy định, quy trình, thủ tục hành chính
- Cần tìm văn bản tham chiếu trước khi soạn thảo (`soan-thao`)
- Câu hỏi dạng: "quy định về X", "văn bản nào đề cập đến Y", "tiền lệ Z"
- Cần kiểm tra căn cứ pháp lý

## Quy trình thực hiện

### Tra cứu

```bash
node {baseDir}/scripts/rag.js --query "<câu_hỏi_của_người_dùng>"
```

Nếu dùng local embedding (Ollama/LM Studio), cấu hình thêm biến môi trường trước khi chạy:

```bash
# Ollama
EMBEDDING_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
ENABLE_GENERATION=false

# LM Studio (OpenAI-compatible)
EMBEDDING_PROVIDER=openai-compatible
OPENAI_BASE_URL=http://localhost:1234/v1
OPENAI_API_KEY=lm-studio
ENABLE_GENERATION=false
```

Đọc JSON output, trình bày:
- Câu trả lời có trích dẫn nguồn (tên file, số hiệu nếu có)
- Mức độ liên quan (score)
- Nếu không tìm thấy (score < 0.75): thông báo rõ "không có thông tin trong knowledge base"

Nguyên tắc trả lời:
- Chỉ trả lời dựa trên `results`
- Nếu không có thông tin, nói rõ "không tìm thấy trong knowledge base"

### Thống kê index

```bash
node {baseDir}/scripts/rag.js --stats
```

### Reset / Xóa khỏi index

```bash
# Reset toàn bộ index
node {baseDir}/scripts/rag.js --reset

# Xóa theo tên hiển thị
node {baseDir}/scripts/rag.js --remove --label "<ten_hien_thi>"

# Xóa theo file
node {baseDir}/scripts/rag.js --remove --file <đường_dẫn>
```

### Thêm tài liệu mới

Khi người dùng yêu cầu thêm tài liệu vào knowledge base:
```bash
# Thêm một file
node {baseDir}/scripts/rag.js --add --file <đường_dẫn> --display-name "<tên_hiển_thị>"

# Thêm cả thư mục
node {baseDir}/scripts/rag.js --add --dir <thư_mục>
```

### Xây dựng lại index

```bash
node {baseDir}/scripts/rag.js --build --source <thư_mục_tài_liệu>
```

### Tinh chỉnh chunking (tùy chọn)

```bash
CHUNK_SIZE=350
CHUNK_OVERLAP=80
CHUNK_MIN_CHARS=60
CHUNK_MAX=0
STRICT_ANSWER=true
ALLOW_FALLBACK=true
```

## Lưu ý

- Luôn trích dẫn nguồn trong câu trả lời
- Ưu tiên văn bản có ngày gần nhất nếu có nhiều phiên bản
- Kết hợp với `cong-van-summary` khi người dùng hỏi về một công văn cụ thể
- Index được lưu tại `{baseDir}/../../data/kb-index/index.json`
- Nếu `ENABLE_GENERATION=false`, script chỉ trả về kết quả truy hồi để OpenClaw tự trả lời
- Nếu có `fallback` hoặc `warnings`, cần thông báo độ tin cậy thấp
- `scripts/rag.js` đã có metadata extraction theo loại tài liệu, hybrid scoring, query rewrite, multi-query retrieval, rerank và citation pack; ưu tiên giữ các trường `documentMetadata`, `semantic_score`, `lexical_score`, `metadata_score`, `rerank_score`, `rerank_boost`
- `scripts/rag.js` đã hỗ trợ `schema_version` cho index, có `--migrate-index`, và lưu payload index dạng object có `created_at` / `updated_at`
- Khi chạy local 4GB VRAM, ưu tiên `qwen2.5:3b-instruct` làm model chính cho query rewrite và synthesis; model này đang có sẵn trong Ollama trên máy này và là lựa chọn cân bằng nhất cho KB tiếng Việt
- Nếu ưu tiên summarization dài hoặc prompt rewriting hơn multilingual, `llama3.2:3b` là phương án dự phòng hợp lý; nếu ưu tiên reasoning ngắn gọn, `phi3.5` cũng là một lựa chọn
- LM Studio hiện chỉ thấy embedding model `nomic-embed-text-v1.5-Q4_K_M.gguf`; chưa thấy LLM tương đương nên ưu tiên Ollama cho generation
- Benchmark suite hiện đã mở rộng sang nhiều loại tài liệu: quy chế, tờ trình, biên bản, quyết định; agent sau cần chạy `npm run eval` sau mỗi thay đổi retrieval/index quan trọng

## Tracking & handoff

- Mỗi thay đổi liên quan knowledge base phải cập nhật `track/progress.md`
- Mọi thay đổi lớn hơn 1 tính năng nên thêm mục tương ứng vào `track/roadmap.md`
- Agent kế tiếp nên đọc `track/README.md` trước khi chạm vào `scripts/rag.js`
- Chạy `npm run eval` hoặc `node scripts/rag.js --eval` để kiểm tra regression với benchmark suite
- Khi thêm tính năng mới, ghi rõ: `done`, `partial`, `next`, và `risks`
- Nếu đổi cấu trúc index hoặc metadata, cập nhật cả `SKILL.md` lẫn file track để tránh lệch ngữ cảnh
- Mục tiêu phát triển tiếp theo: tách citation theo đoạn/trang tốt hơn, regression metadata, và benchmark đa tài liệu thật
