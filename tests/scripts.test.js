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
  assert.equal(calendar.data.event.title, "Hop xu ly cong van");
  assert.equal(calendar.data.event.calendar_id, "primary");
  assert.equal(calendar.data.command[1], "calendar");
  assert.equal(email.data.action, "preview-draft");
  assert.equal(email.data.requires_confirmation, true);
  assert.equal(email.data.ready_for_confirmation, true);
  assert.equal(email.data.email.subject, "Nhac han");
  assert.equal(email.data.command[1], "gmail");
});

test("Google Workspace previews cover PLAN.md calendar and email scenarios", () => {
  const calendar = runScript("scripts/calendar-management.js", [
    "--title", "Họp rà soát hồ sơ cán bộ năm 2026",
    "--start", "2026-06-02T09:00:00+07:00",
    "--end", "2026-06-02T10:30:00+07:00",
    "--description", "Phân công rà soát hồ sơ và thống nhất hạn gửi báo cáo",
  ]);
  const email = runScript("scripts/email-automation.js", [
    "--subject", "Nhắc hạn rà soát hồ sơ cán bộ",
    "--body", "Kính gửi Phòng Hành chính - Tổng hợp,\n\nĐề nghị Phòng hoàn thành rà soát hồ sơ trước ngày 05/06/2026.",
  ]);

  assert.equal(calendar.data.action, "preview");
  assert.equal(calendar.data.event.title, "Họp rà soát hồ sơ cán bộ năm 2026");
  assert.equal(calendar.data.event.start, "2026-06-02T09:00:00+07:00");
  assert.equal(calendar.data.event.end, "2026-06-02T10:30:00+07:00");
  assert.equal(calendar.data.command.includes("--json"), true);
  assert.equal(email.data.action, "preview-draft");
  assert.equal(email.data.ready_for_confirmation, false);
  assert.deepEqual(email.data.missing, ["to"]);
  assert.equal(email.data.command, null);
  assert.match(email.data.email.body, /05\/06\/2026/);
});

test("calendar wrapper previews multiple events in one batch", () => {
  const events = [
    {
      title: "[Công văn 128/PNV-VP] Rà soát danh mục hồ sơ cán bộ/công chức",
      start: "2026-06-01T08:30:00+07:00",
      end: "2026-06-01T09:30:00+07:00",
      description: "Ưu tiên cao",
    },
    {
      title: "[Công văn 128/PNV-VP] Kiểm tra hồ sơ theo 3 nhóm giấy tờ",
      start: "2026-06-03T08:30:00+07:00",
      end: "2026-06-03T09:30:00+07:00",
      description: "Ưu tiên cao",
    },
  ];
  const calendar = runScript("scripts/calendar-management.js", [
    "--events-json", JSON.stringify(events),
  ]);

  assert.equal(calendar.data.action, "preview-batch");
  assert.equal(calendar.data.requires_confirmation, true);
  assert.equal(calendar.data.count, 2);
  assert.equal(calendar.data.events[0].calendar_id, "primary");
  assert.equal(calendar.data.commands.length, 2);
  assert.equal(calendar.data.commands[1][1], "calendar");
});

test("calendar wrapper reads batch events from utf8 bom file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "calendar-events-"));
  const eventsPath = path.join(dir, "events.json");
  fs.writeFileSync(eventsPath, `\uFEFF${JSON.stringify([
    {
      title: "Task tu file",
      start: "2026-06-05T08:30:00+07:00",
      end: "2026-06-05T09:30:00+07:00",
    },
  ])}`, "utf8");

  const calendar = runScript("scripts/calendar-management.js", [
    "--events-file", eventsPath,
  ]);

  assert.equal(calendar.data.action, "preview-batch");
  assert.equal(calendar.data.count, 1);
  assert.equal(calendar.data.events[0].title, "Task tu file");
});

test("email wrapper supports SMTP dry-run after confirmation", () => {
  const email = runScript("scripts/email-automation.js", [
    "--to", "canbo@example.com",
    "--subject", "Nhac han",
    "--body", "Noi dung nhap",
    "--smtp",
    "--confirmed",
    "--dry-run",
  ], {
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_USER: "sender@example.com",
    SMTP_PASS: "app-password",
  });

  assert.equal(email.data.action, "smtp-dry-run");
  assert.equal(email.data.to, "canbo@example.com");
  assert.equal(email.data.from, "sender@example.com");
});

test("email wrapper normalizes escaped newlines to plain text line breaks", () => {
  const email = runScript("scripts/email-automation.js", [
    "--to", "canbo@example.com",
    "--subject", "Đề nghị tham dự cuộc họp khẩn cấp",
    "--body", "Kính gửi Anh/Chị,\\n\\nTôi gửi email này để đề nghị Anh/Chị tham dự cuộc họp.\\n\\nTrân trọng,",
  ]);

  assert.equal(email.data.action, "preview-draft");
  assert.match(email.data.email.body, /Kính gửi Anh\/Chị,\n\nTôi gửi email này/);
  assert.doesNotMatch(email.data.email.body, /\\n/);
});

test("email composer emits plain text body without html tags", () => {
  const composed = runScript("scripts/email-composer.js", [
    "--request", "soạn nội dung email và gửi tin nhắn với nội dung đó đến mail thanhbinhnkd@gmail.com để yêu cầu họp khẩn cấp",
    "--to", "thanhbinhnkd@gmail.com",
  ]);

  assert.equal(composed.data.action, "composed");
  assert.match(composed.data.email.body, /\n\nNội dung dự kiến:\n-/);
  assert.doesNotMatch(composed.data.email.body, /<br|<p|<\/p|\\n/i);
});

test("email composer turns raw office request into professional subject and body", () => {
  const composed = runScript("scripts/email-composer.js", [
    "--request", "soạn nội dung email và gửi tin nhắn với nội dung đó đến mail thanhbinhnkd@gmail.com để yêu cầu họp khẩn cấp",
    "--to", "thanhbinhnkd@gmail.com",
  ]);

  assert.equal(composed.data.action, "composed");
  assert.equal(composed.data.email.to, "thanhbinhnkd@gmail.com");
  assert.equal(composed.data.email.subject, "Đề nghị tham dự cuộc họp khẩn cấp");
  assert.match(composed.data.email.body, /Kính gửi Anh\/Chị/);
  assert.match(composed.data.email.body, /Nội dung dự kiến/);
  assert.match(composed.data.email.body, /xác nhận khả năng tham dự/);
  assert.doesNotMatch(composed.data.email.subject, /soạn nội dung email/i);
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
