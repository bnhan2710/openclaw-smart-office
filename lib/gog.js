import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_GOG_DIR = path.join(ROOT_DIR, "tools", "gog");
const LOCAL_GOG_HOME = path.join(ROOT_DIR, "tools", "gog-state");
const LOCAL_KEYRING_PASSWORD_PATH = path.join(LOCAL_GOG_HOME, "keyring-password.txt");

export function gogBinary() {
  const configuredBinary = process.env.GOG_BIN?.trim();
  if (configuredBinary) return configuredBinary;
  const localBinary = path.join(LOCAL_GOG_DIR, process.platform === "win32" ? "gog.exe" : "gog");
  if (fs.existsSync(localBinary)) return localBinary;
  const dockerBinary = "/home/node/.openclaw/bin/gog";
  return fs.existsSync(dockerBinary) ? dockerBinary : "gog";
}

export function gogEnv() {
  fs.mkdirSync(LOCAL_GOG_HOME, { recursive: true });
  const configuredPassword = process.env.GOG_KEYRING_PASSWORD?.trim();
  let keyringPassword = configuredPassword;
  if (!keyringPassword) {
    if (fs.existsSync(LOCAL_KEYRING_PASSWORD_PATH)) {
      keyringPassword = fs.readFileSync(LOCAL_KEYRING_PASSWORD_PATH, "utf8").trim();
    } else {
      keyringPassword = randomBytes(32).toString("base64url");
      fs.writeFileSync(LOCAL_KEYRING_PASSWORD_PATH, `${keyringPassword}\n`, { mode: 0o600 });
    }
  }
  return {
    ...process.env,
    GOG_HOME: process.env.GOG_HOME?.trim() || LOCAL_GOG_HOME,
    GOG_KEYRING_BACKEND: process.env.GOG_KEYRING_BACKEND?.trim() || "file",
    GOG_KEYRING_PASSWORD: keyringPassword,
  };
}
