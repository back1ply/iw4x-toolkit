---
phase: 2
slug: code-gaps
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `mcp-server/vitest.config.ts` (or package.json scripts) |
| **Quick run command** | `cd mcp-server && npm test -- --reporter=verbose` |
| **Full suite command** | `cd mcp-server && npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd mcp-server && npm test -- --reporter=verbose`
- **After every plan wave:** Run `cd mcp-server && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | CODE-01 | unit | `cd mcp-server && npm test -- --reporter=verbose` | ✅ | ⬜ pending |
| 2-01-02 | 01 | 1 | CODE-02 | unit | `cd mcp-server && npm test -- --reporter=verbose` | ✅ | ⬜ pending |
| 2-01-03 | 01 | 1 | CODE-03 | unit | `cd mcp-server && npm test -- --reporter=verbose` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `mcp-server/src/index.test.ts` — add unit test stubs for CODE-01 (rate limiter eviction), CODE-02 (temp file cleanup scan dirs), CODE-03 (getKnowledgeDir bundled path)

*Existing infrastructure covers the test runner — only new test cases need to be added.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
