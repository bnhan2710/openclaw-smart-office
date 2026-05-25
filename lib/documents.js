import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { MAX_DOCUMENT_BYTES } from "./config.js";

const SUPPORTED_TEXT_EXTENSIONS = new Set([".txt", ".md", ".pdf", ".docx"]);

export function validateInputFile(filePath, allowedExtensions = SUPPORTED_TEXT_EXTENSIONS) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`File does not exist: ${absolutePath}`);
  const stats = fs.statSync(absolutePath);
  if (!stats.isFile()) throw new Error("Input must be a file");
  if (stats.size > MAX_DOCUMENT_BYTES) throw new Error(`File exceeds ${MAX_DOCUMENT_BYTES} bytes`);
  const extension = path.extname(absolutePath).toLowerCase();
  if (!allowedExtensions.has(extension)) throw new Error(`Unsupported file format: ${extension}`);
  return { absolutePath, extension, size: stats.size };
}

export function fileHash(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export async function readDocumentText(filePath) {
  const { absolutePath, extension } = validateInputFile(filePath);
  if (extension === ".txt" || extension === ".md") {
    return { text: fs.readFileSync(absolutePath, "utf8"), method: "native-text", absolutePath };
  }
  if (extension === ".pdf") {
    const { default: pdfParse } = await import("pdf-parse");
    const data = await pdfParse(fs.readFileSync(absolutePath));
    return { text: data.text, method: "native-text", absolutePath, pageCount: data.numpages };
  }
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ path: absolutePath });
  return { text: result.value, method: "native-text", absolutePath };
}
