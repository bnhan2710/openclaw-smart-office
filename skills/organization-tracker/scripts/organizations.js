#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import { getDatabase, logAudit } from "../../../lib/database.js";
import { printEnvelope, printError } from "../../../lib/response.js";

const SKILL = "organization-tracker";
const { values: args } = parseArgs({
  options: {
    extract: { type: "boolean" }, search: { type: "string" }, update: { type: "boolean" }, id: { type: "string" },
    "document-id": { type: "string" }, name: { type: "string" }, department: { type: "string" },
    address: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, help: { type: "boolean" },
  },
  strict: false,
});

function extractOrganizations(db, documentId) {
  const row = db.prepare("SELECT text_content FROM document_extractions WHERE document_id = ? ORDER BY created_at DESC LIMIT 1").get(documentId);
  if (!row) throw new Error("Document has no extracted text");
  const candidates = [...row.text_content.matchAll(/(?:UBND|ỦY BAN NHÂN DÂN|SỞ|BỘ|PHÒNG|CỤC)\s+[^\n,.;]{2,80}/giu)]
    .map((match) => match[0].trim())
    .filter((value, index, all) => all.indexOf(value) === index);
  const stored = db.transaction(() => {
    const organizations = candidates.map((name) => {
      const existing = db.prepare("SELECT id, name FROM organizations WHERE lower(name) = lower(?) LIMIT 1").get(name);
      if (existing) return { ...existing, status: "existing" };
      const id = `org-${randomUUID()}`;
      const now = new Date().toISOString();
      db.prepare("INSERT INTO organizations (id, name, source_document_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, name, documentId, now, now);
      return { id, name, status: "created" };
    });
    logAudit(db, { action: "organization.extract", entityType: "document", entityId: documentId, details: { candidates: organizations.length } });
    return organizations;
  })();
  return { document_id: documentId, organizations: stored };
}

function search(db, term) {
  return db.prepare("SELECT id, name, department, address, email, phone FROM organizations WHERE name LIKE ? OR department LIKE ? ORDER BY name").all(`%${term}%`, `%${term}%`);
}

function update(db) {
  if (!args.id) throw new Error("--id is required");
  const current = db.prepare("SELECT * FROM organizations WHERE id = ?").get(args.id);
  if (!current) throw new Error("Organization not found");
  const next = {
    name: args.name ?? current.name,
    department: args.department ?? current.department,
    address: args.address ?? current.address,
    email: args.email ?? current.email,
    phone: args.phone ?? current.phone,
  };
  if (next.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next.email)) throw new Error("Invalid email address");
  db.transaction(() => {
    db.prepare("UPDATE organizations SET name = ?, department = ?, address = ?, email = ?, phone = ?, updated_at = ? WHERE id = ?")
      .run(next.name, next.department, next.address, next.email, next.phone, new Date().toISOString(), args.id);
    logAudit(db, { action: "organization.update", entityType: "organization", entityId: args.id });
  })();
  return { id: args.id, ...next };
}

function main() {
  if (args.help) {
    console.log("Usage: organizations.js --extract --document-id <id> | --search <term> | --update --id <id>");
    return;
  }
  const db = getDatabase();
  try {
    let result;
    if (args.extract && args["document-id"]) result = extractOrganizations(db, args["document-id"]);
    else if (args.search) result = search(db, args.search);
    else if (args.update) result = update(db);
    else throw new Error("Choose --extract, --search, or --update");
    printEnvelope(SKILL, result);
  } catch (error) {
    printError(SKILL, error);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
