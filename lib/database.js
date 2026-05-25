import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import Database from "better-sqlite3";

import { DATABASE_PATH } from "./config.js";
import { normalizeDate } from "./dates.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  file_path TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_hash TEXT,
  source TEXT NOT NULL DEFAULT 'local',
  ocr_status TEXT NOT NULL DEFAULT 'not_required',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS document_extractions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  method TEXT NOT NULL,
  text_content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  confidence REAL,
  page_count INTEGER,
  warning TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  document_id TEXT REFERENCES documents(id),
  title TEXT NOT NULL,
  assignee TEXT,
  deadline TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  reference TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  channel TEXT NOT NULL,
  reminder_key TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  UNIQUE(task_id, channel, reminder_key)
);
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT,
  address TEXT,
  email TEXT,
  phone TEXT,
  source_document_id TEXT REFERENCES documents(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS document_reviews (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  required_fixes_json TEXT NOT NULL,
  suggestions_json TEXT NOT NULL,
  passed INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  status TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS migrations (
  key TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

function identifier(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function timestamp() {
  return new Date().toISOString();
}

export function getDatabase(filePath = DATABASE_PATH) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  const taskColumns = db.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name);
  if (!taskColumns.includes("idempotency_key")) {
    db.exec("ALTER TABLE tasks ADD COLUMN idempotency_key TEXT");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS tasks_idempotency_key_idx ON tasks(idempotency_key) WHERE idempotency_key IS NOT NULL");
  return db;
}

export function closeDatabase(db) {
  db.close();
}

export function logAudit(db, { action, entityType, entityId = null, status = "success", details = {} }) {
  const record = {
    id: identifier("audit"),
    action,
    entityType,
    entityId,
    status,
    details: JSON.stringify(details),
    createdAt: timestamp(),
  };
  db.prepare(
    "INSERT INTO audit_logs (id, action, entity_type, entity_id, status, details_json, created_at) VALUES (@id, @action, @entityType, @entityId, @status, @details, @createdAt)"
  ).run(record);
  return record.id;
}

export function storeDocument(db, { filePath = null, fileName, mimeType = null, fileHash = null, source = "local", ocrStatus = "not_required" }) {
  if (!fileName) throw new Error("fileName is required");
  const id = identifier("doc");
  const createdAt = timestamp();
  db.prepare(
    "INSERT INTO documents (id, file_path, file_name, mime_type, file_hash, source, ocr_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, filePath, fileName, mimeType, fileHash, source, ocrStatus, createdAt);
  logAudit(db, { action: "document.store", entityType: "document", entityId: id });
  return { id, filePath, fileName, mimeType, fileHash, source, ocrStatus, createdAt };
}

export function storeExtraction(db, { documentId, method, text, metadata = {}, confidence = null, pageCount = null, warning = null }) {
  if (!documentId || !method || typeof text !== "string") throw new Error("documentId, method and text are required");
  const id = identifier("extract");
  const createdAt = timestamp();
  db.prepare(
    "INSERT INTO document_extractions (id, document_id, method, text_content, metadata_json, confidence, page_count, warning, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, documentId, method, text, JSON.stringify(metadata), confidence, pageCount, warning, createdAt);
  return { id, documentId, method, text, metadata, confidence, pageCount, warning, createdAt };
}

export function createTask(db, input) {
  if (!String(input?.title ?? "").trim()) throw new Error("Task title is required");
  const deadline = input.deadline ? normalizeDate(input.deadline) : null;
  if (input.deadline && !deadline) throw new Error("Task deadline is invalid");
  const priority = ["high", "medium", "low"].includes(input.priority) ? input.priority : "medium";
  const idempotencyKey = input.idempotencyKey ?? createHash("sha256").update(JSON.stringify({
    documentId: input.documentId ?? null,
    title: String(input.title).trim(),
    deadline,
    reference: input.reference ?? input.ref ?? null,
  })).digest("hex");
  const record = {
    id: input.id ?? identifier("task"),
    idempotencyKey,
    documentId: input.documentId ?? null,
    title: String(input.title).trim(),
    assignee: input.assignee ?? null,
    deadline,
    priority,
    status: input.status ?? "open",
    reference: input.reference ?? input.ref ?? null,
    createdAt: input.createdAt ?? timestamp(),
    completedAt: input.completedAt ?? null,
  };
  const operation = () => {
    const changes = db.prepare(
      "INSERT OR IGNORE INTO tasks (id, idempotency_key, document_id, title, assignee, deadline, priority, status, reference, created_at, completed_at) VALUES (@id, @idempotencyKey, @documentId, @title, @assignee, @deadline, @priority, @status, @reference, @createdAt, @completedAt)"
    ).run(record).changes;
    if (changes) {
      logAudit(db, { action: "task.create", entityType: "task", entityId: record.id });
      return record;
    }
    return getTask(db, db.prepare("SELECT id FROM tasks WHERE idempotency_key = ?").get(idempotencyKey).id);
  };
  return db.inTransaction ? operation() : db.transaction(operation)();
}

export function migrateLegacyDeadlines(db, legacyPath) {
  const resolved = path.resolve(legacyPath);
  const migrationKey = `legacy-deadlines:${resolved}`;
  if (db.prepare("SELECT 1 FROM migrations WHERE key = ?").get(migrationKey)) return 0;
  if (!fs.existsSync(resolved)) return 0;
  const items = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const migrate = db.transaction(() => {
    let total = 0;
    for (const item of items) {
      createTask(db, {
        id: item.id ? `legacy-${item.id}` : undefined,
        title: item.title,
        deadline: item.deadline,
        reference: item.ref,
        priority: item.priority,
        createdAt: item.createdAt,
      });
      total += 1;
    }
    db.prepare("INSERT INTO migrations (key, applied_at) VALUES (?, ?)").run(migrationKey, timestamp());
    return total;
  });
  return migrate();
}

export function getTask(db, id) {
  return db.prepare("SELECT id, document_id AS documentId, title, assignee, deadline, priority, status, reference, created_at AS createdAt, completed_at AS completedAt FROM tasks WHERE id = ?").get(id);
}
