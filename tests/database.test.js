import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, createTask, getDatabase, getTask, migrateLegacyDeadlines, storeDocument, storeExtraction } from "../lib/database.js";

test("database initializes the shared office schema and migrates legacy deadlines once", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smart-office-db-"));
  const dbPath = path.join(dir, "office.db");
  const legacyPath = path.join(dir, "deadlines.json");
  fs.writeFileSync(legacyPath, JSON.stringify([{ id: "old-1", title: "Bao cao", deadline: "2026-06-01", priority: "high" }]));

  const db = getDatabase(dbPath);
  const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
  assert.ok(tableNames.includes("documents"));
  assert.ok(tableNames.includes("tasks"));
  assert.ok(tableNames.includes("organizations"));
  assert.ok(!tableNames.includes("calendar_events"));

  assert.equal(migrateLegacyDeadlines(db, legacyPath), 1);
  assert.equal(migrateLegacyDeadlines(db, legacyPath), 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM tasks").get().total, 1);
  closeDatabase(db);
});

test("tasks are validated and stored with auditable identifiers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smart-office-task-"));
  const db = getDatabase(path.join(dir, "office.db"));
  const task = createTask(db, { title: "Gui bao cao", deadline: "2026-05-31", priority: "high" });
  assert.ok(task.id);
  assert.equal(task.status, "open");
  assert.equal(getTask(db, task.id).title, "Gui bao cao");
  assert.equal(createTask(db, { title: "Gui bao cao", deadline: "2026-05-31", priority: "high" }).id, task.id);
  assert.throws(() => createTask(db, { title: "", deadline: "bad" }), /title/i);
  closeDatabase(db);
});

test("documents and extractions persist source text for downstream skills", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smart-office-doc-"));
  const db = getDatabase(path.join(dir, "office.db"));
  const document = storeDocument(db, { fileName: "cong-van.txt", source: "test" });
  const extraction = storeExtraction(db, { documentId: document.id, method: "native-text", text: "Noi dung", metadata: { ref: "12/CV" } });
  assert.ok(extraction.id);
  assert.equal(db.prepare("SELECT text_content FROM document_extractions WHERE document_id = ?").get(document.id).text_content, "Noi dung");
  closeDatabase(db);
});
