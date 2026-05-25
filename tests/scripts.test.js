import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createTask, getDatabase, storeDocument } from "../lib/database.js";

function runScript(script, args, env = {}) {
  const output = execFileSync(process.execPath, [script, ...args], {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return JSON.parse(output);
}

function runFailingScript(script, args, env = {}) {
  try {
    runScript(script, args, env);
    assert.fail("Expected script to fail");
  } catch (error) {
    return JSON.parse(error.stdout);
  }
}

test("Google wrappers return previews until explicitly confirmed", () => {
  const calendar = runScript("scripts/calendar-management.js", [
    "--title", "Hop xu ly cong van",
    "--start", "2026-05-29T09:00:00+07:00",
    "--end", "2026-05-29T10:30:00+07:00",
  ]);
  const email = runScript("scripts/email-automation.js", [
    "--to", "canbo@example.com",
    "--subject", "Nhac han",
    "--body", "Noi dung nhap",
  ]);

  assert.equal(calendar.data.action, "preview");
  assert.equal(calendar.data.requires_confirmation, true);
  assert.equal(calendar.data.command[1], "calendar");
  assert.equal(email.data.action, "preview-draft");
  assert.equal(email.data.requires_confirmation, true);
  assert.equal(email.data.command[1], "gmail");
});

test("calendar wrapper rejects invalid scheduling input before gog execution", () => {
  const invalid = runFailingScript("scripts/calendar-management.js", [
    "--title", "Hop xu ly cong van",
    "--start", "2026-05-29T10:00:00+07:00",
    "--end", "2026-05-29T09:00:00+07:00",
  ]);

  assert.equal(invalid.success, false);
  assert.match(invalid.error, /after/);
});

test("report generator exports monthly SQLite statistics as JSON", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smart-office-report-"));
  const dbPath = path.join(dir, "office.db");
  const outputPath = path.join(dir, "monthly-report.json");
  const db = getDatabase(dbPath);
  storeDocument(db, { fileName: "cong-van.txt", source: "test" });
  createTask(db, { title: "Bao cao thang", deadline: "2026-05-31" });
  db.close();

  const result = runScript("scripts/report-generator.js", [
    "--month", "2026-05",
    "--output", outputPath,
  ], { SMART_OFFICE_DB: dbPath });
  const savedReport = JSON.parse(fs.readFileSync(outputPath, "utf8"));

  assert.equal(result.data.report.tasks.total, 1);
  assert.equal(savedReport.documents_processed, 1);
  assert.equal(savedReport.tasks.open, 1);
});

test("report generator returns an error envelope for an invalid month", () => {
  const invalid = runFailingScript("scripts/report-generator.js", ["--month", "2026-13"]);

  assert.equal(invalid.success, false);
  assert.match(invalid.error, /YYYY-MM/);
});
