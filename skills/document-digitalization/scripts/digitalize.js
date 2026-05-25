#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { getDatabase, storeDocument, storeExtraction } from "../../../lib/database.js";
import { fileHash, readDocumentText, validateInputFile } from "../../../lib/documents.js";
import { printEnvelope, printError } from "../../../lib/response.js";

const SKILL = "document-digitalization";
const IMAGE_TYPES = new Set([".png", ".jpg", ".jpeg", ".tiff"]);
const ALL_TYPES = new Set([".pdf", ...IMAGE_TYPES]);
const { values: args } = parseArgs({
  options: { file: { type: "string", short: "f" }, output: { type: "string", default: "json" }, help: { type: "boolean" } },
  strict: false,
});

function requireBinary(binary) {
  const result = spawnSync(binary, ["--version"], { encoding: "utf8" });
  if (result.error?.code === "ENOENT") throw new Error(`Thiếu binary ${binary}. Hãy cài ${binary} trước khi OCR.`);
}

function runTesseract(filePath) {
  requireBinary(process.env.TESSERACT_BIN ?? "tesseract");
  return execFileSync(process.env.TESSERACT_BIN ?? "tesseract", [filePath, "stdout", "-l", process.env.OCR_LANG ?? "vie"], { encoding: "utf8" });
}

async function digitalize(filePath) {
  const { absolutePath, extension } = validateInputFile(filePath, ALL_TYPES);
  let text = "";
  let method = "ocr";
  let pageCount = null;

  if (extension === ".pdf") {
    const native = await readDocumentText(absolutePath);
    pageCount = native.pageCount ?? null;
    if (native.text.trim().length >= 30) {
      text = native.text;
      method = "native-text";
    } else {
      requireBinary("pdftoppm");
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "office-ocr-"));
      try {
        execFileSync("pdftoppm", ["-png", "-r", "300", absolutePath, path.join(tempDir, "page")]);
        const pages = fs.readdirSync(tempDir).filter((name) => name.endsWith(".png")).sort();
        pageCount = pages.length;
        text = pages.map((name) => runTesseract(path.join(tempDir, name))).join("\n\n");
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  } else {
    text = runTesseract(absolutePath);
    pageCount = 1;
  }

  const warning = method === "ocr" && text.trim().length < 50
    ? "OCR tra ve rat it noi dung; can kiem tra lai chat luong anh."
    : null;
  const db = getDatabase();
  const result = db.transaction(() => {
    const document = storeDocument(db, {
      filePath: absolutePath,
      fileName: path.basename(absolutePath),
      fileHash: fileHash(absolutePath),
      source: "digitalization",
      ocrStatus: method === "ocr" ? "completed" : "not_required",
    });
    const extraction = storeExtraction(db, { documentId: document.id, method, text, pageCount, warning });
    return { document_id: document.id, extraction_id: extraction.id, method, page_count: pageCount, warning, text };
  })();
  db.close();
  return result;
}

async function main() {
  if (args.help || !args.file) {
    console.log("Usage: node digitalize.js --file <pdf|image> [--output json|text]");
    return;
  }
  try {
    const result = await digitalize(args.file);
    if (args.output === "text") console.log(result.text);
    else printEnvelope(SKILL, result);
  } catch (error) {
    printError(SKILL, error);
    process.exitCode = 1;
  }
}

main();
