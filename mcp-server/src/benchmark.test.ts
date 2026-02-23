/**
 * @file benchmark.test.ts
 * Performance benchmarks for critical operations.
 * Run with: npm test -- --filter=benchmark
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { openIwd, getCachedRegex } from "./index.js";

describe("Performance Benchmarks", () => {
  let tmpDir: string;
  let largeIwd: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "iw4x-bench-"));
    largeIwd = path.join(tmpDir, "large.iwd");
    
    // Create a large IWD with 100 files
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
    it("opens large archive within 100ms", () => {
      const start = performance.now();
      const result = openIwd(largeIwd);
      const elapsed = performance.now() - start;
      
      expect(result.ok).toBe(true);
      expect(elapsed).toBeLessThan(100);
    });

    it("cache hit is faster than miss", () => {
      // First call (may be cache miss)
      const firstStart = performance.now();
      openIwd(largeIwd);
      const firstElapsed = performance.now() - firstStart;
      
      // Second call (should be cache hit)
      const secondStart = performance.now();
      openIwd(largeIwd);
      const secondElapsed = performance.now() - secondStart;
      
      // Cache hit should be significantly faster
      expect(secondElapsed).toBeLessThan(firstElapsed);
    });
  });

  describe("getCachedRegex", () => {
    it("cached regex retrieval is faster than compilation", () => {
      const pattern = "test.*pattern";
      const flags = "gi";
      
      // First call (compilation)
      const firstStart = performance.now();
      getCachedRegex(pattern, flags);
      const firstElapsed = performance.now() - firstStart;
      
      // Second call (cached)
      const secondStart = performance.now();
      getCachedRegex(pattern, flags);
      const secondElapsed = performance.now() - secondStart;
      
      // Cached retrieval should be faster
      expect(secondElapsed).toBeLessThanOrEqual(firstElapsed);
    });

    it("handles 50 unique patterns within cache limit", () => {
      const start = performance.now();
      for (let i = 0; i < 50; i++) {
        getCachedRegex(`pattern${i}`, "i");
      }
      const elapsed = performance.now() - start;
      
      expect(elapsed).toBeLessThan(10); // Should be very fast
    });
  });
});
