---
name: document-review
description: Kiểm tra cấu trúc và lỗi bắt buộc của văn bản hành chính trước khi xuất hoặc gửi. Trả danh sách sửa bắt buộc và gợi ý; không tự sửa bản cuối.
version: 1.0.0
metadata: {"openclaw":{"emoji":"✅","requires":{"bins":["node"]},"install":[{"id":"npm","kind":"node","pkg":"{baseDir}","label":"Cài dependencies"}]}}
---

Chạy `node {baseDir}/scripts/review.js --document-id <id>` sau khi soạn thảo. Trình bày lỗi bắt buộc trước, sau đó gợi ý diễn đạt; chỉ chỉnh sửa tài liệu khi người dùng yêu cầu.
