---
name: organization-tracker
description: Lưu và tra cứu cơ quan, phòng ban và thông tin liên hệ từ tài liệu đã xử lý. Dữ liệu trùng hoặc mâu thuẫn luôn cần người dùng duyệt trước khi hợp nhất.
version: 1.0.0
metadata: {"openclaw":{"emoji":"🏢","requires":{"bins":["node"]},"install":[{"id":"npm","kind":"node","pkg":"{baseDir}","label":"Cài dependencies"}]}}
---

Chạy `node {baseDir}/scripts/organizations.js --extract --document-id <id>` để đề xuất cơ quan từ văn bản, `--search "<từ khóa>"` để tra cứu, và `--update --id <id> ...` chỉ khi người dùng xác nhận chỉnh sửa.
