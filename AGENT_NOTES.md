# IW4x Toolkit MCP Server — Agent Notes & Improvement Ideas

> Recorded: 2026-02-19
> Context: MW2/IW4x modding session working with `.iwd` archives (GSC scripts, menu files, config strings).
> Purpose: Document real friction points observed during agent-assisted modding work, and propose concrete tool improvements.

---

## Current Tool Surface

| Tool | Description |
|------|-------------|
| `iwd_list` | List entries. Optional glob `pattern` filter; `names_only=true` for compact token-efficient output |
| `iwd_read` | Read a single entry's content. Supports `limit`/`offset` for pagination of large files |
| `iwd_write` | Write/overwrite an entry. Returns ±3-line diff on update. `dry_run=true` to validate before writing |
| `iwd_remove` | Remove an entry. Reports CRC and size of removed entry. `dry_run=true` to preview |
| `iwd_diff` | Compare two IWDs (CRC-based). `entry_glob` filter; `content_diff=true` for line-level diffs |
| `iwd_info` | Get entry metadata (size, type, CRC) without reading content |
| `iwd_patch` | Surgical string replacement inside a text entry. Returns ±3-line diff. `count=-1` replaces all. `dry_run=true` to preview |
| `iwd_grep` | Search text entries for a pattern. Case-insensitive literal by default; regex mode available. `max_matches` cap (default: 50) |
| `iwd_extract` | Extract entries to a directory for use with shell tools (rg, fd). Optional `entry_glob`; `dry_run=true` |
| `iwd_rename` | Atomic rename/move of an entry within the archive. `dry_run=true` to preview |
| `iwd_copy` | Copy an entry between archives or within the same archive. `overwrite=true` to clobber; `dry_run=true` to preview |

---

## Session Validation (2026-02-19)

Real session working on `promodlive_v3.3.iwd` (210 entries). Every "High" priority pain point below was hit directly.

### What actually happened without the missing tools

| Missing tool | Actual workaround used | Cost |
|---|---|---|
| `iwd_grep` | Extracted full IWD to `C:\tmp` via Python `zipfile`, ran `rg` on extracted dir | ~15 extra tool calls, temp dir to manage |
| `iwd_patch` | Python script: open IWD, read entry, `str.replace(old, new, 1)`, write back | Fell outside MCP entirely; requires bash + Python |
| `iwd_read` limits | Read full files regardless of size; `_quickmessages.gsc` is ~12 KB minified on **one line** — dumped entire content to discover a single function | Significant context bloat per read |
| `iwd_list` filter | Called `iwd_list`, got all 210 entries, mentally filtered for `.menu` or `.gsc` subset | Noisy output every time |

**Key real-world data points:**
- `maps/mp/gametypes/_playerlogic.gsc` — 35 KB, minified single line. One targeted removal (`self setClientDvar("cg_fov", "80");`) required the full Python fallback because `iwd_write` needs entire file content.
- `maps/mp/gametypes/_quickmessages.gsc` — ~12 KB single line. `iwd_read` dumped it all at once; limit support would have allowed a quick scan first.
- IWD has 210 entries. Every "find which file defines X" required extracting everything to disk to use `rg`.

---

## Recommended Agent Workflow — Current Tools

> **Updated 2026-02-19**: `iwd_grep`, `iwd_patch`, and `iwd_read` limits have all shipped. The Python workarounds below are now **obsolete** for these use cases.

### For searching across entries

Use `iwd_grep` directly:

```
iwd_grep(path=..., pattern="options_promod", entry_glob="*.gsc")
```

Optionally set `is_regex=true` for regex patterns.

### For targeted edits in large files

Use `iwd_patch` directly:

```
iwd_patch(path=..., entry="maps/mp/gametypes/_playerlogic.gsc",
          old='self setClientDvar("cg_fov", "80");',
          new='self setClientDvar("cg_fov", "90");')
```

The response includes a ±3-line diff around the change. No re-read needed for verification.

### For reading large or minified files

Use `iwd_info` to check size first, then `iwd_read` with `limit`/`offset`:

```
iwd_info(path=..., entry="maps/mp/gametypes/_quickmessages.gsc")
# → returns size + readAdvice
iwd_read(path=..., entry=..., offset=0, limit=100)  # read first 100 lines
iwd_read(path=..., entry=..., offset=100, limit=100) # next page
```

### For full file rewrites (small/medium files)

`iwd_write` works fine. Read with `iwd_read`, edit locally, write back. The `.bak` auto-backup on first write per session is a useful safety net.


---

## Observed Pain Points & Improvement Ideas

### 1. No In-IWD Search (`iwd_grep`)

**Pain point:** To find which entries contain a specific string (e.g. `options_promod`, `menuDef`, a function name), the only options were:
- Read entries one by one — massive context waste, especially with many entries.
- Extract the entire IWD to disk first, then run `rg` on the extracted directory.

Neither is token-efficient. A typical IWD can have 200+ entries; scanning them individually is untenable.

**Validated:** Hit in this session for every "find which file defines X" query on a 210-entry IWD.

**Proposed tool:** `iwd_grep(path, pattern, [entry_glob])`
- Searches all text entries (or a filtered subset) inside an IWD for a regex/string pattern.
- Returns: matching entry paths + matched line numbers + line snippets (like `rg --with-filename`).
- Optional `entry_glob` to scope the search (e.g. `*.gsc`, `*.menu`).

**Priority: High** — would eliminate the single most common multi-step workaround.

---

### 2. `iwd_read` Dumps Full File Contents

**Pain point:** No offset or limit support. Large GSC files — especially minified single-line files like `_quickmessages.gsc` (~12 KB on one line) — flood the context window with a single read. For exploration purposes (checking what a file does, finding a function), the full dump is almost never needed upfront.

**Validated:** `_quickmessages.gsc` and `_playerlogic.gsc` (35 KB) both dumped in full on first read.

**Proposed change:** Add `limit` and `offset` parameters to `iwd_read`.
- `limit`: max number of lines (or bytes) to return.
- `offset`: start line (or byte offset).
- Could also add a `head` / `tail` shorthand for convenience.

**Alternative:** A separate `iwd_head(path, entry, lines=50)` tool for quick previews.

**Priority: High** — directly reduces context bloat on every non-trivial read.

---

### 3. No Bulk Extraction Tool (`iwd_extract`)

**Pain point:** IWD is ZIP. When bulk operations are needed — grep across many files, count tokens, compare directories — the only path is to fall back to Python `zipfile`, `7z`, or PowerShell to extract first. This breaks the MCP workflow and requires the user to manage temp directories.

**Note:** `7z` may not be on PATH in every environment. Python `zipfile` is the reliable fallback but requires a bash call + script.

**Proposed tool:** `iwd_extract(path, dest, [entry_glob])`
- Extracts all (or glob-filtered) entries to a local directory.
- Once extracted, standard shell tools (`rg`, `fd`, `bat`, `delta`) work natively.
- Optional cleanup: `iwd_extract` could return the temp path and let the caller clean up, or accept a `cleanup=true` flag.

**Priority: Medium** — useful for power workflows; partially solved by `iwd_grep` if that lands first.

---

### 4. `iwd_write` Requires Sending Full File Content

**Pain point:** Even for a one-line change deep in a 12 KB file, the entire file content must be passed through the tool call. This is expensive in tokens and error-prone (easy to accidentally corrupt the file by omitting a section during reconstruction).

**Validated:** Removing a single `setClientDvar` call from a 35 KB minified `_playerlogic.gsc` required a full Python fallback. `iwd_write` was not usable for this task.

**Proposed tool:** `iwd_patch(path, entry, old_string, new_string, [count=1])`
- Performs a targeted string substitution inside an entry, without requiring full file content.
- Semantics: like `sed 's/old/new/'` but scoped to a single IWD entry.
- `count` controls how many occurrences to replace (default: first occurrence only).
- Should return the number of replacements made (0 = pattern not found, which is an error signal).
- Should return a short diff snippet (±3 lines) of what changed — eliminates the need for a separate verify read.

**Priority: High** — dramatically reduces token cost for targeted edits, especially in large minified GSC files.

---

### 5. No Entry Metadata Before Reading (`iwd_info`)

**Pain point:** `iwd_read` on a binary entry (image, compiled script) returns base64, which is useless for most agent tasks and wastes tokens. There's currently no way to check whether an entry is text or binary before reading it, nor to know its size ahead of time.

**Proposed tool:** `iwd_info(path, entry)`
- Returns: uncompressed size, compressed size, compression ratio, MIME type hint or text/binary classification, CRC32.
- Lets the agent decide: is this worth reading? Is it text I can search? Is it too large to read in one shot?

**Priority: Medium** — quality-of-life; prevents accidental context flooding from binary reads.

---

### 6. `iwd_list` Has No Filtering

**Pain point:** A typical mod IWD has 150–200+ entries spanning GSC scripts, menu files, config strings, and localization strings. `iwd_list` returns all of them. When you only care about `*.menu` files or `*.gsc` files in a specific subdirectory, the full listing is noisy and wastes tokens.

**Validated:** 210-entry IWD listing had to be manually scanned every time.

**Proposed change:** Add a `pattern` parameter to `iwd_list`.
- Accepts a glob pattern (e.g. `ui_mp/*.menu`, `scripts/*.gsc`).
- Returns only matching entries with their size info.
- Consistent with how `fd` and `rg` handle scoping.

**Priority: Medium** — easy to add, meaningfully reduces output noise for focused workflows.

---

### 7. `iwd_diff` Is Entry-Level Only (No Content Diff)

**Pain point:** `iwd_diff` compares two IWDs and reports which entries were added, removed, or have different CRCs. This is useful for a structural overview, but when an entry is flagged as modified, there's no way to see *what* changed inside it without reading both versions and diffing manually.

**Proposed change:** Add a `content_diff=true` option to `iwd_diff`.
- For text entries whose CRC differs, compute and return a unified diff (like `diff -u` or `delta`).
- Binary entries: report size change only.
- Could be scoped with `entry_glob` to keep output manageable.

**Priority: Medium** — especially valuable when comparing mod versions or reviewing what a patch changed.

---

### 8. No `iwd_copy` or `iwd_rename`

**Pain point:** To rename or move an entry (e.g. restructuring a mod's file layout), the current workflow is: `iwd_read` → `iwd_write` (new path) → `iwd_remove` (old path). Three round-trips for what is conceptually one operation.

**Proposed tools:**
- `iwd_rename(path, entry, new_entry)` — rename/move an entry within the same IWD.
- `iwd_copy(src_path, src_entry, dst_path, dst_entry)` — copy an entry between IWDs or within the same one.

**Priority: Low** — nice-to-have; the workaround works, it's just verbose.

---

### 9. No Post-Write Verification (`iwd_patch` should return a diff)

**Pain point (new):** After any write operation (especially the Python-based targeted patch workaround), there's no way to verify the change without reading back the full entry. A verify step requires another full `iwd_read` call, doubling the context cost for large files.

**Proposed behavior:** `iwd_write` and `iwd_patch` should return a short summary of what changed:
- Lines added / lines removed count (for text files).
- A ±3 line diff snippet around the change point.
- CRC before + after, so the agent can confirm without reading the full file.

This would eliminate the "read the file back to verify" step that currently follows every write on a large entry.

**Priority: Medium** — small addition to write tools, eliminates a common verification read.

---

## Priority Summary

| Priority | Tool | Effort Estimate | Session-validated | Status |
|----------|------|-----------------|-------------------|--------|
| High | `iwd_grep` — search entries for a pattern | Medium | ✅ Yes | **Shipped** |
| High | `iwd_read` limit/offset params | Low | ✅ Yes | **Shipped** |
| High | `iwd_patch` — targeted string replace in entry | Medium | ✅ Yes | **Shipped** |
| Medium | `iwd_extract` — bulk extract to disk | Low | ✅ Worked around | Not started |
| Medium | `iwd_diff` content diff option | Medium | — | Not started |
| Medium | `iwd_list` pattern filter | Low | ✅ Yes | **Shipped** |
| Medium | `iwd_info` — entry metadata before read | Low | — | **Shipped** |
| Medium | Post-write diff/verify output (`iwd_patch` returns diff) | Low | ✅ Yes | **Shipped** |
| Low | `iwd_rename` / `iwd_copy` | Low | — | Not started |

---

## General Notes

- The biggest token-efficiency wins come from: `iwd_grep`, `iwd_patch`, and `iwd_read` limits. These three changes would cover ~80% of the friction observed in a typical modding session. **Confirmed by real session.**
- IWD files are just ZIP archives. The implementation of most of these tools is straightforward using Python's `zipfile` module or equivalent.
- Consider adding a `dry_run=true` flag to destructive tools (`iwd_write`, `iwd_remove`, `iwd_patch`) that validates the operation without committing it — useful when agents are running autonomously.
- Error messages should include the entry path and IWD path in all failure cases (currently some errors are context-free).
- The auto-backup (`.bak` on first write per session) works well in practice — keep this behavior.
- `iwd_write` is perfectly fine for full rewrites of small/medium text files (menus, short GSC files). The pain only surfaces on large minified files where a targeted edit is needed.
