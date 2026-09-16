// Writes knowledge/llms.txt and knowledge/schemas/*.schema.json. Run with `npm run knowledge`.
import * as fs from "node:fs";
import * as path from "node:path";
import { knowledgeArtifacts } from "../src/knowledge/publish.js";

const root = path.resolve(process.cwd(), "..", "knowledge");
for (const [rel, content] of knowledgeArtifacts()) {
  const out = path.join(root, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, content);
  console.log(`wrote knowledge/${rel}`);
}
