import assert from "node:assert/strict";
import test from "node:test";

import { daysUntil, normalizeDate } from "../lib/dates.js";

test("normalizeDate understands administrative Vietnamese date formats", () => {
  assert.equal(normalizeDate("15/04/2026"), "2026-04-15");
  assert.equal(normalizeDate("15 tháng 04 năm 2026"), "2026-04-15");
  assert.equal(normalizeDate("2026-04-15"), "2026-04-15");
  assert.equal(normalizeDate("31/02/2026"), null);
});

test("daysUntil compares calendar days without time drift", () => {
  assert.equal(daysUntil("2026-05-27", new Date("2026-05-25T22:00:00+07:00")), 2);
  assert.equal(daysUntil("2026-05-24", new Date("2026-05-25T08:00:00+07:00")), -1);
});
