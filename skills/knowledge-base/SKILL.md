---
name: knowledge-base
description: Tra cứu quy định, văn bản pháp lý, tiền lệ từ kho tài liệu nội bộ sử dụng RAG (Retrieval-Augmented Generation). Dùng khi người dùng hỏi "quy định về...", "tìm văn bản liên quan đến...", "có tiền lệ nào về...", "quy trình xử lý...", hoặc cần tham chiếu văn bản nội bộ trước khi soạn thảo. Trả lời có trích dẫn nguồn cụ thể (số hiệu, tên văn bản).
version: 1.0.2
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
