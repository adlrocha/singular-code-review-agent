import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function readJsonFile<T>(file: string, fallback: T): T {
  try {
    const raw = readFileSync(file, "utf8");
    if (!raw.trim()) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export function writeJsonFile(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmpFile = join(dirname(file), `.${file.split("/").pop()}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmpFile, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmpFile, file);
}
