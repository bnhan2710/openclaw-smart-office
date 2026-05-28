# Knowledge Base Benchmarking

## Purpose

Đo chất lượng retrieval của `knowledge-base` bằng benchmark cố định, để mọi agent sau có thể kiểm tra regression.

## Benchmark source

- `references/eval-benchmark.json`
- `references/kb-test-phuc-tap.txt`
- `references/kb-to-trinh-mau.txt`
- `references/kb-bien-ban-mau.txt`
- `references/kb-quyet-dinh-mau.txt`

## Run

- `node scripts/rag.js --eval`
- hoặc `npm run eval`

## Expected flow

1. Đảm bảo toàn bộ tài liệu benchmark đã được đưa vào index
2. Chạy benchmark
3. So sánh `pass_rate`, `mean_reciprocal_rank`, `mean_top1_coverage`, `mean_citation_precision`
4. Nếu schema index đổi, chạy `node scripts/rag.js --migrate-index`
5. Nếu metrics giảm sau thay đổi, cập nhật `progress.md` và `roadmap.md`

## Notes

- Benchmark này đánh vào văn bản quy chế nhiều mục để thử chunking, metadata, rerank và citation selection cùng lúc
- Benchmark hiện đã bao phủ nhiều loại văn bản: quy chế, tờ trình, biên bản, quyết định
- Nếu đổi schema index, chạy lại benchmark sau rebuild hoặc sau migrate
