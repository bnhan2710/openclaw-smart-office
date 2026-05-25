#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "smart-office-smoke-"));
const dbPath = path.join(temp, "office.db");
const source = path.join(temp, "cong-van.txt");
const env = { ...process.env, SMART_OFFICE_DB: dbPath };
fs.writeFileSync(source, [
  "UBND TỈNH X",
  "Số: 12/CV-UBND",
  "Ngày 25 tháng 05 năm 2026",
  "V/v báo cáo tiến độ",
  "Kính gửi: Phòng Hành chính",
  "1. Giao Phòng Hành chính báo cáo trước ngày 29/05/2026.",
  "Nơi nhận:",
  "- Như trên;",
].join("\n"), "utf8");

function run(script, args) {
  const output = execFileSync(process.execPath, [script, ...args], { cwd: path.resolve("."), env, encoding: "utf8" });
  return JSON.parse(output);
}

const summary = run("skills/cong-van-summary/scripts/extract.js", ["--file", source]);
if (!summary.success || !summary.data.document_id) throw new Error("summary smoke failed");
const summarizedStoredText = run("skills/cong-van-summary/scripts/extract.js", ["--document-id", summary.data.document_id]);
if (summarizedStoredText.data.document_id !== summary.data.document_id) throw new Error("stored extraction summary smoke failed");
const task = run("skills/task-extractor/scripts/extract-task.js", [
  "--add-deadline", "--document-id", summary.data.document_id, "--title", "Báo cáo tiến độ",
  "--deadline", "2026-05-29", "--ref", "12/CV-UBND", "--priority", "high",
]);
const retry = run("skills/task-extractor/scripts/extract-task.js", [
  "--add-deadline", "--document-id", summary.data.document_id, "--title", "Báo cáo tiến độ",
  "--deadline", "2026-05-29", "--ref", "12/CV-UBND", "--priority", "high",
]);
if (retry.data.task.id !== task.data.task.id) throw new Error("task retry is not idempotent");
const deadlines = run("skills/deadline-reminder/scripts/cron.js", ["--list", "--days", "365"]);
if (deadlines.data.length !== 1) throw new Error("deadline list smoke failed");
console.log("Smoke workflow passed: document -> stored summary -> idempotent task/deadline.");
