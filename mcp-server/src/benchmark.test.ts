/**
 * @file benchmark.test.ts
 * IWD and regex caches. Asserts cache behavior (same instance on a hit, fresh
 * instance after a change) instead of wall-clock timings, which flake on busy machines.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { openIwd, invalidateIwdCache, getCachedRegex } from "./utils.js";

describe("Caches", () => {
  let tmpDir: string;
  let largeIwd: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "iw4x-bench-"));
    largeIwd = path.join(tmpDir, "large.iwd");
    const zip = new AdmZip();
    for (let i = 0; i < 100; i++) {
      const content = Array.from({ length: 100 }, (_, j) => `line ${j} of file ${i}`).join("\n");
      zip.addFile(`scripts/file${i}.gsc`, Buffer.from(content));
    }
    zip.writeZip(largeIwd);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("openIwd", () => {
    it("opens a 100-entry archive", () => {
      const result = openIwd(largeIwd);
      expect(result.ok && result.value.getEntries().length).toBe(100);
    });

    it("returns the cached archive until the file changes", () => {
      invalidateIwdCache(largeIwd);
      const first = openIwd(largeIwd);
      const second = openIwd(largeIwd);
      expect(first.ok && second.ok && first.value === second.value).toBe(true);

      const later = new Date(Date.now() + 5000);
      fs.utimesSync(largeIwd, later, later);
      const third = openIwd(largeIwd);
      expect(third.ok && second.ok && third.value !== second.value).toBe(true);
    });
  });

  describe("getCachedRegex", () => {
    it("returns the same compiled RegExp for the same pattern and flags", () => {
      expect(getCachedRegex("test.*pattern", "i")).toBe(getCachedRegex("test.*pattern", "i"));
      expect(getCachedRegex("test.*pattern", "i")).not.toBe(getCachedRegex("test.*pattern", "g"));
    });

    it("keeps 50 distinct patterns cached", () => {
      const compiled = Array.from({ length: 50 }, (_, i) => getCachedRegex(`pattern${i}`, "m"));
      compiled.forEach((re, i) => expect(getCachedRegex(`pattern${i}`, "m")).toBe(re));
    });
  });
});
