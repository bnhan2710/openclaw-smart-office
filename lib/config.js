import path from "node:path";

export const DEFAULT_TIMEZONE = process.env.TIMEZONE ?? "Asia/Ho_Chi_Minh";
export const DATABASE_PATH = path.resolve(process.env.SMART_OFFICE_DB ?? "./data/smart-office.db");
export const LEGACY_DEADLINES_PATH = path.resolve(process.env.DEADLINES_FILE ?? "./data/deadlines.json");
export const MAX_DOCUMENT_BYTES = Number.parseInt(process.env.MAX_DOCUMENT_BYTES ?? `${25 * 1024 * 1024}`, 10);
