#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { getDatabase } from "../lib/database.js";
import { printEnvelope, printError } from "../lib/response.js";

const SKILL = "report-generator";
const { values: args } = parseArgs({
  options: {
    month: { type: "string" },
    output: { type: "string", default: "./output/reports/monthly-report.json" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function validateMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Month must use YYYY-MM format");
  }
  return month;
}

function buildReport(db, month) {
  const taskCounts = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status NOT IN ('completed', 'removed') THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN status NOT IN ('completed', 'removed') AND deadline < date('now') THEN 1 ELSE 0 END) AS overdue
    FROM tasks
    WHERE deadline IS NOT NULL AND substr(deadline, 1, 7) = ?
  `).get(month);
  const documentCount = db.prepare(
    "SELECT COUNT(*) AS total FROM documents WHERE substr(created_at, 1, 7) = ?"
  ).get(month).total;
  const reviewCount = db.prepare(
    "SELECT COUNT(*) AS total FROM document_reviews WHERE substr(created_at, 1, 7) = ?"
  ).get(month).total;
  return {
    period: month,
    documents_processed: documentCount,
    document_reviews: reviewCount,
    tasks: {
      total: taskCounts.total,
      completed: taskCounts.completed ?? 0,
      open: taskCounts.open ?? 0,
      overdue: taskCounts.overdue ?? 0,
    },
  };
}

function main() {
  if (args.help) {
    console.log("Usage: node scripts/report-generator.js [--month YYYY-MM] [--output path.json]");
    return;
  }
  let db;
  try {
    const month = validateMonth(args.month ?? currentMonth());
    const outputPath = path.resolve(args.output);
    db = getDatabase();
    const report = buildReport(db, month);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    printEnvelope(SKILL, { output: outputPath, report });
  } catch (error) {
    printError(SKILL, error);
    process.exitCode = 1;
  } finally {
    db?.close();
  }
}

main();
