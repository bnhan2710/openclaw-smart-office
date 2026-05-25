#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import { getDatabase, logAudit } from "../../../lib/database.js";
import { analyzeAdministrativeDocument } from "../../../lib/review.js";
import { printEnvelope, printError } from "../../../lib/response.js";

const SKILL = "document-review";
const { values: args } = parseArgs({ options: { "document-id": { type: "string" }, format: { type: "string", default: "json" }, help: { type: "boolean" } }, strict: false });

function main() {
  if (args.help || !args["document-id"]) {
    console.log("Usage: review.js --document-id <id> [--format json]");
    return;
  }
  const db = getDatabase();
  try {
    const extraction = db.prepare("SELECT text_content FROM document_extractions WHERE document_id = ? ORDER BY created_at DESC LIMIT 1").get(args["document-id"]);
    if (!extraction) throw new Error("Document has no extracted text to review");
    const review = analyzeAdministrativeDocument(extraction.text_content);
    const id = db.transaction(() => {
      const reviewId = `review-${randomUUID()}`;
      db.prepare("INSERT INTO document_reviews (id, document_id, required_fixes_json, suggestions_json, passed, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(reviewId, args["document-id"], JSON.stringify(review.requiredFixes), JSON.stringify(review.suggestions), review.passed ? 1 : 0, new Date().toISOString());
      logAudit(db, { action: "document.review", entityType: "document", entityId: args["document-id"], details: { passed: review.passed } });
      return reviewId;
    })();
    printEnvelope(SKILL, { review_id: id, document_id: args["document-id"], ...review });
  } catch (error) {
    printError(SKILL, error);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
