# Knowledge Base Roadmap

## Goal

Nâng `knowledge-base` thành RAG hành chính có độ chính xác cao, truy hồi đa tầng, và handoff được cho agent khác mà không cần đoán ngữ cảnh.

## Phase 1 — Retrieval quality

- [x] Metadata extraction cơ bản
- [x] Hybrid scoring
- [x] Query rewrite
- [x] Multi-query retrieval
- [x] Citation pack
- [x] Ollama generation support cho `qwen2.5:3b-instruct`
- [x] Rerank theo metadata + focus terms

## Phase 2 — Structure awareness

- [x] Chuẩn hóa metadata schema theo từng loại tài liệu
- [ ] Tách section/heading/table/attachment thành structure tree
- [ ] Gắn metadata theo trang/khối/chunk
- [ ] Tách citation theo đoạn và trang rõ hơn

## Phase 3 — Evaluation

- [x] Bộ câu hỏi benchmark nền cho quy chế nội bộ
- [x] Chỉ số recall@k / MRR / citation precision
- [x] Benchmark run thành công trên corpus mẫu
- [x] Benchmark đa tài liệu cơ bản cho tờ trình / biên bản / quyết định
- [ ] Bộ test cho metadata accuracy
- [ ] Regression suite trước khi đổi chunking/index
- [ ] Bộ benchmark đa tài liệu thật

## Phase 4 — Operationalization

- [x] Migration cho `index.json` khi schema đổi
- [ ] Rebuild command có versioning
- [ ] Logging rõ lý do rerank và fallback
- [ ] Dashboard/summary stats cho index chất lượng
- [ ] Benchmark dashboard với pass rate và regression trend

## Notes

- Mọi thay đổi không tương thích với index cũ phải ghi vào `progress.md`
- Nếu thêm model local khác, cập nhật cả `SKILL.md` và `roadmap.md`
- `qwen2.5:3b-instruct` hiện là default recommended cho 4GB VRAM
- Benchmark hiện tại bám vào `kb-test-phuc-tap.txt`; nên mở rộng dần sang corpus thật
