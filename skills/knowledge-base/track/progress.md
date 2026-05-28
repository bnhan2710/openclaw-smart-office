# Knowledge Base Progress

Last updated: 2026-05-28

## Current State

- Baseline RAG đã có: ingest tài liệu, build index, query, reset, remove, stats
- Có hỗ trợ embedding OpenAI / Ollama
- Đã xác nhận môi trường local có `qwen2.5:3B` trong Ollama
- LM Studio hiện chỉ thấy `nomic-embed-text-v1.5-Q4_K_M.gguf`
- Có fallback lexical khi embedding không đủ tốt
- Có generation toggle để trả lời bằng model ngoài OpenClaw nếu cần
- `scripts/rag.js` hỗ trợ generation qua Ollama chat nếu `OLLAMA_CHAT_MODEL` được set
- Đã bổ sung metadata extraction cơ bản khi ingest
- Metadata đã được tổ chức theo schema giàu hơn: identity / parties / structure
- Đã bổ sung hybrid scoring: semantic + lexical + metadata + bonus cho exact match
- Đã bổ sung query rewrite plan + multi-query retrieval
- Đã bổ sung citation pack và score breakdown cho từng kết quả
- Đã bổ sung chunking có nhận diện heading/section tốt hơn
- Đã bổ sung rerank dựa trên focus terms, metadata và expected fields
- Đã chuẩn hóa metadata theo type-specific schema: quy chế, công văn, tờ trình, biên bản, quyết định
- Đã thêm benchmark/eval suite cố định
- Benchmark thật trên `kb-test-phuc-tap.txt`: pass_rate 1.0, MRR 1.0, citation_precision 1.0
- Benchmark đa tài liệu mở rộng: 6/6 pass, MRR 1.0, citation_precision trung bình 1.0
- Index đã được nâng sang schema version 2 với payload có `schema_version`, `created_at`, `updated_at`
- Benchmark đã mở rộng sang corpus đa tài liệu: quy chế, tờ trình, biên bản, quyết định

## Done

- `scripts/rag.js` lưu `documentMetadata` trong index
- `scripts/rag.js` đưa metadata vào context trả lời
- `scripts/rag.js` trả thêm score breakdown cho từng kết quả
- `scripts/rag.js` trả `citation_pack` cho downstream agents
- `scripts/rag.js` trả `query_plan` cho downstream agents
- `SKILL.md` có section tracking/handoff
- `SKILL.md` ghi rõ khuyến nghị model local 4GB VRAM
- `track/roadmap.md` liệt kê toàn bộ phase tiếp theo
- `track/benchmarking.md` mô tả cách chạy benchmark/regression
- `npm run eval` đã pass trên benchmark mẫu sau khi cài `nomic-embed-text`
- `scripts/rag.js` hỗ trợ `--migrate-index` để nâng index cũ sang schema mới

## Partial

- Metadata extraction vẫn dựa trên heuristic, chưa phải parser cấu trúc đầy đủ cho mọi loại văn bản
- Chunking tốt hơn nhưng vẫn chưa tách table/attachment/biểu mẫu thành pipeline riêng
- Ranking hiện là hybrid + multi-query + rerank heuristic; chưa có cross-encoder riêng
- Benchmark suite đã có đa tài liệu, nhưng vẫn nên mở rộng thêm corpus thật và tài liệu đã phát hành nội bộ

## Next

1. Tách citation theo đoạn và trang rõ hơn
2. Xây bộ test cho metadata accuracy và regression tự động
3. Thêm logging rõ lý do rerank và fallback
4. Mở rộng benchmark sang corpus thật
5. Làm dashboard/summary stats cho chất lượng index

## Risks

- Nếu thay đổi cấu trúc `index.json`, cần migration hoặc rebuild index
- Nếu đổi tokenization/chunking, score cũ sẽ không còn so sánh được với index cũ
- Nếu metadata heuristic đoán sai, output có thể “đẹp hơn” nhưng chưa chắc đúng hơn
- Multi-query retrieval tăng độ bao phủ nhưng cũng có thể kéo theo nhiều nhiễu nếu query rewrite quá rộng
- Rerank heuristic có thể thiên lệch nếu focus_terms được rewrite quá rộng
- Benchmark có thể phản ánh quá tốt với corpus mẫu và synthetic docs, cần thêm dữ liệu thật để tránh overfit

## Handoff Checklist

- [ ] Đọc `SKILL.md`
- [ ] Đọc file này
- [ ] Xác nhận ảnh hưởng đến index cũ hay không
- [ ] Cập nhật `progress.md` sau khi merge
- [ ] Nếu có thay đổi lớn, thêm note ngắn trong `memory/`
