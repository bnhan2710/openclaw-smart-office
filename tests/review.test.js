import assert from "node:assert/strict";
import test from "node:test";

import { analyzeAdministrativeDocument } from "../lib/review.js";

test("document review catches mandatory administrative fields", () => {
  const review = analyzeAdministrativeDocument("Kinh gui: UBND tinh\nNoi dung de xuat");
  assert.equal(review.passed, false);
  assert.ok(review.requiredFixes.some((issue) => issue.code === "missing_national_header"));
  assert.ok(review.requiredFixes.some((issue) => issue.code === "missing_document_number"));
});

test("document review accepts a minimally structured Vietnamese document", () => {
  const review = analyzeAdministrativeDocument(
    "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\nSố: 12/CV-DV\nNgày 25 tháng 05 năm 2026\nKính gửi: UBND Tỉnh\nNơi nhận:\n- Như trên;"
  );
  assert.equal(review.requiredFixes.length, 0);
});
