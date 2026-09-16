/**
 * @file knowledge/knowledge.test.ts
 * The knowledge files match their schemas, and the published schemas / llms.txt
 * committed under knowledge/ are what `npm run knowledge` would generate.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { DVARS, GSC_BUILTINS } from "./data.js";
import { KNOWLEDGE_FILES, knowledgeArtifacts } from "./publish.js";
import { runCli } from "../cli.js";

const KNOWLEDGE_DIR = fileURLToPath(new URL("../../../knowledge/", import.meta.url));

describe("knowledge base", () => {
  for (const { file, schema } of KNOWLEDGE_FILES) {
    it(`${file} matches its schema`, () => {
      const data = JSON.parse(fs.readFileSync(KNOWLEDGE_DIR + file, "utf-8"));
      const result = schema.safeParse(data);
      expect(result.success ? [] : result.error.issues.slice(0, 5)).toEqual([]);
    });
  }

  it("declared totals match the data", () => {
    expect(DVARS.total).toBe(DVARS.dvars.length);
    expect(GSC_BUILTINS.meta.totalFunctions).toBe(GSC_BUILTINS.functions.length);
  });

  it("published schemas and llms.txt are up to date (run `npm run knowledge` if this fails)", () => {
    for (const [rel, expected] of knowledgeArtifacts()) {
      const onDisk = fs.existsSync(KNOWLEDGE_DIR + rel) ? fs.readFileSync(KNOWLEDGE_DIR + rel, "utf-8") : "";
      expect(onDisk.replace(/\r\n/g, "\n"), rel).toBe(expected);
    }
  });
});

describe("gsc_lookup renders both builtin entry formats", () => {
  async function lookup(query: string): Promise<string> {
    let out = "";
    await runCli(["gsc_lookup", "--query", query], { stdout: (t) => { out += t; }, stderr: () => {} });
    return out;
  }

  it("shows parameters for hand-curated entries", async () => {
    expect(await lookup("setModel")).toContain("Params: model: string");
  });

  it("shows parameters and the calling entity for gsc-doc entries", async () => {
    const out = await lookup("addPitch");
    expect(out).toContain("Called on: entity");
    expect(out).toContain("Params: angle: float|int");
  });
});
