import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const sourceDir = join(root, "src", "prompts");
const outputDir = join(root, "dist", "prompts");

mkdirSync(outputDir, { recursive: true });

for (const file of readdirSync(sourceDir)) {
  if (file.endsWith(".md")) {
    copyFileSync(join(sourceDir, file), join(outputDir, file));
  }
}
