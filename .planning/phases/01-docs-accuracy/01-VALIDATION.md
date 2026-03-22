---
phase: 1
slug: docs-accuracy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing 99-test suite) |
| **Config file** | `vitest.config.ts` (or project root config) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | DOCS-01 | manual | `npm test` (regression gate) | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | DOCS-02 | manual | `npm test` (regression gate) | ✅ | ⬜ pending |
| 1-01-03 | 01 | 1 | DOCS-03 | manual | `npm test` (regression gate) | ✅ | ⬜ pending |
| 1-01-04 | 01 | 1 | DOCS-04 | manual | `npm test` (regression gate) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* The 99-test suite already validates tool behavior; no new test stubs are needed for docs changes.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| README tool list matches implemented tools exactly | DOCS-01 | Prose accuracy requires human review | Cross-check README tool list against `src/` exports; verify no phantom tools listed |
| Phantom tools removed from README | DOCS-02 | No automated check for absent content | Confirm `gsc_find_orphans`, `dvar_integrity_check`, `iwd_index_symbols` do NOT appear in README |
| Implementation details section is accurate | DOCS-03 | Behavioral description accuracy is manual | Read "Implementation details" section; verify cache cap = 10, atomic writes = synchronous |
| docs/TODO.md Phase 2 order is clear and prioritized | DOCS-04 | Roadmap alignment is editorial judgment | Open `docs/TODO.md`; confirm Phase 2 section exists with prioritized task list aligned to ROADMAP.md |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
