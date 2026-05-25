#!/usr/bin/env node
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";

import { createTask, getDatabase } from "../../../lib/database.js";
import { normalizeDate } from "../../../lib/dates.js";
import { readDocumentText } from "../../../lib/documents.js";
import { printEnvelope, printError } from "../../../lib/response.js";

const SKILL = "task-extractor";
const { values: args } = parseArgs({
  options: {
    file: { type: "string", short: "f" }, text: { type: "string", short: "t" }, stdin: { type: "boolean" },
    "document-id": { type: "string" }, "read-only": { type: "boolean" }, "add-deadline": { type: "boolean" },
    title: { type: "string" }, deadline: { type: "string" }, ref: { type: "string" }, assignee: { type: "string" },
    priority: { type: "string", default: "medium" }, output: { type: "string", default: "json" }, help: { type: "boolean" },
  },
  strict: false,
});

async function inputText(db) {
  if (args["document-id"]) {
    const row = db.prepare("SELECT text_content FROM document_extractions WHERE document_id = ? ORDER BY created_at DESC LIMIT 1").get(args["document-id"]);
    if (!row) throw new Error("Document has no extraction");
    return row.text_content;
  }
  if (args.text) return args.text;
  if (args.file) return (await readDocumentText(args.file)).text;
  if (args.stdin) {
    let value = "";
    for await (const chunk of process.stdin) value += chunk;
    return value;
  }
  throw new Error("Provide --document-id, --file, --text, or --stdin");
}

export function extractTasksRuleBased(text) {
  return text.split(/\r?\n/).flatMap((line) => {
    const clean = line.trim();
    if (!/(giao|yêu cầu|đề nghị|phân công|chịu trách nhiệm)/iu.test(clean)) return [];
    const assignee = clean.match(/(?:giao|yêu cầu|đề nghị|phân công)\s+([^,;]{3,50}?)(?:\s+thực hiện|\s+báo cáo|\s+hoàn thành)/iu)?.[1]?.trim() ?? null;
    return [{
      id: `suggest-${createHash("sha256").update(clean).digest("hex").slice(0, 10)}`,
      title: clean.slice(0, 180),
      assignee,
      deadline: normalizeDate(clean),
      priority: /khẩn|hỏa tốc|gấp/iu.test(clean) ? "high" : "medium",
      confidence: 0.65,
      method: "rule-based",
    }];
  });
}

async function main() {
  if (args.help) {
    console.log("Usage: extract-task.js --document-id <id> | --file <path> | --add-deadline --title <title> --deadline YYYY-MM-DD");
    return;
  }
  const db = getDatabase();
  try {
    if (args["add-deadline"]) {
      const task = createTask(db, {
        documentId: args["document-id"],
        title: args.title,
        deadline: args.deadline,
        reference: args.ref,
        assignee: args.assignee,
        priority: args.priority,
      });
      printEnvelope(SKILL, { task, saved: true });
      return;
    }
    const text = await inputText(db);
    if (args["read-only"]) {
      printEnvelope(SKILL, { document_id: args["document-id"] ?? null, text: text.slice(0, 15000), truncated: text.length > 15000 });
      return;
    }
    const tasks = extractTasksRuleBased(text);
    printEnvelope(SKILL, { document_id: args["document-id"] ?? null, tasks, requires_confirmation_before_save: true });
  } catch (error) {
    printError(SKILL, error);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
