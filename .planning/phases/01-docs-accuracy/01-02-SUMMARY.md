---
phase: 01-docs-accuracy
plan: 02
subsystem: docs
tags: [todo, roadmap, priority-ordering, code-gaps, tests]

requires:
  - phase: 01-docs-accuracy
    provides: "README accurate tool listing to reference for gap analysis"
provides:
  - "docs/TODO.md with structured Phase 2 (Code Gaps) and Phase 3 (Tests/Arch) sections"
  - "Priority ordering: CODE-01/02/03 before new tools before TEST/ARCH items"
  - "Requirement IDs CODE-01..03, TEST-01..03, ARCH-01..02, P2-03, P2-04 tracked in TODO"
affects: [02-code-gaps, 03-test-coverage]

tech-stack:
  added: []
  patterns:
    - "TODO.md mirrors ROADMAP.md phase structure with requirement IDs for traceability"

key-files:
  created: []
  modified:
    - docs/TODO.md

key-decisions:
  - "Code hardening (CODE-01/02/03) placed before new tools (P2-03, P2-04) in priority order"
  - "Tests & Architecture section added as separate 'Next Up' block, not merged into existing Phase 3"
  - "All existing TODO.md content preserved verbatim — only additions, no rewrites"

patterns-established:
  - "Requirement ID traceability: each TODO item references its REQUIREMENTS.md ID"

requirements-completed: [DOCS-04]

duration: 5min
completed: 2026-03-22
---

# Phase 01 Plan 02: TODO.md Roadmap Structure Summary

**docs/TODO.md restructured with explicit Code Gaps & Hardening and Tests & Architecture Quality sections, each item keyed to REQUIREMENTS.md IDs, priority-ordered CODE before TEST**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-22T21:10:00Z
- **Completed:** 2026-03-22T21:20:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added "Next Up — Code Gaps & Hardening" section with CODE-01, CODE-02, CODE-03 items and P2-03/P2-04 new tools
- Added "Next Up — Tests & Architecture Quality" section with TEST-01/02/03 and ARCH-01/02 items
- Preserved all existing TODO.md content (Phase 1 done items, Technical Debt, Phase 2-4 feature sections, Skills Roadmap)

## Task Commits

1. **Task 1: Restructure docs/TODO.md Phase 2/3 sections** - `e1f46d5` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `docs/TODO.md` — Two new priority sections inserted before existing Phase 2 Language Tooling section

## Decisions Made

- Inserted new sections between Technical Debt and existing Phase 2 to keep hardening items visually prominent before new feature work

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- docs/TODO.md now reflects the ROADMAP.md phase structure
- CODE-01/02/03 are the first items any contributor sees after Phase 1 done items
- Ready to begin Phase 2 code-gaps execution

---
*Phase: 01-docs-accuracy*
*Completed: 2026-03-22*
