# IW4X Toolkit — Workflow Guide

> **For vibe coders using this toolkit with an LLM.**  
> Paste this at the start of a new chat session to prime the LLM on the right tool sequence.

---

## The Golden Rule

> **Every tool defaults to the cheapest output. Verbose details are opt-in.**

| Need | Default call | Add this for more detail |
|------|--------------|--------------------------|
| What files are in this IWD? | `iwd_list summary_only=true` | `iwd_list pattern="*.gsc"` |
| See a list of .gsc scripts | `iwd_list pattern="*.gsc"` | `names_only=false` for sizes, `limit=N` for many files |
| Read a file | `iwd_info` first, then `iwd_read limit=50` | remove `limit` for full file |
| Find something | `iwd_grep pattern="X" entry_glob="*.gsc"` | increase `max_matches` if needed |
| Edit something | `iwd_patch dry_run=true` first | remove `dry_run` to commit |
| Compare two IWDs | `iwd_diff` | `content_diff=true` for line diffs |

---

## 6 Golden Paths

### 🏗️ Path 1: Workspace Workflow (The "Dual Pathway" A - Extract & Sync)

> **Pro Tip**: This is the preferred way for large overhauls or when you want to use standard AI filesystem tools.

```text
1. iwd_extract  path="mod.iwd"  dest="./workspace"
   → unpack the archive to plain files locally

2. (Use standard tools: replace_file_content, run_command, etc.)
   → edit the loose files in ./workspace

3. mods_sync  source_dir="./workspace"  mod_dir="C:/path/to/game/mods/my_mod"
   → copy loose files to the engine's mod override directory for instant live testing

4. iwd_sync  source_dir="./workspace"  dest_path="mod.iwd"
   → finally, inject the updated files back into the IWD archive without rebuilding it from scratch
```

### � Path 2: Full Rebuild (The "Dual Pathway" A - Pack New Archive)

> **Pro Tip**: Use this if you extracted a small mod, modified multiple files, and want to completely rebuild the `.iwd` from scratch instead of syncing.

```text
1. iwd_extract  path="mod.iwd"  dest="./workspace"
   → unpack the archive to plain files locally

2. (Use standard tools: replace_file_content, run_command, etc.)
   → edit the raw loose files in ./workspace

3. iwd_pack  source_dir="./workspace"  dest_path="new_mod.iwd"
   → packs the entire directory into a brand new archive, overwriting if it exists
```

### �💉 Path 3: Surgical Fix (The "Dual Pathway" B - Find & Fix In-Place)

> **Pro Tip**: Use this for quick, targeted edits inside an IWD without the overhead of extraction.

```text
1. iwd_grep  path="mod.iwd"  pattern="X"  entry_glob="*.gsc"  max_matches=5
   → tells you which file and line number

2. iwd_read  path="mod.iwd"  entry="<file>"  offset=<line-5>  limit=20
   → read just the context around the match

3. iwd_patch  path="mod.iwd"  entry="<file>"  old="X"  new="Y"  dry_run=true
   → preview the diff

4. iwd_patch  path="mod.iwd"  entry="<file>"  old="X"  new="Y"
   → commit
```

### 🗺️ Path 4: Explore ("what's in this IWD?")

```text
1. iwd_list  path="mod.iwd"  summary_only=true
   → "127 entries: 45 .gsc, 12 .menu, 8 .csv, 62 binary"

2. iwd_list  path="mod.iwd"  pattern="*.gsc"
   → compact name list of all scripts

3. iwd_info  path="mod.iwd"  entry="<interesting file>"
   → size, type, CRC — decide if worth reading

4. iwd_read  path="mod.iwd"  entry="<file>"  limit=50
   → first 50 lines
```

### ➕ Path 5: Add a New File

```text
1. iwd_list  path="mod.iwd"  pattern="scripts/*"
   → confirm path doesn't clash

2. iwd_write  path="mod.iwd"  entry="scripts/myscript.gsc"  content="..."  dry_run=true
   → verify what will be created

3. iwd_write  path="mod.iwd"  entry="scripts/myscript.gsc"  content="..."
   → commit
```

### 📊 Path 6: Compare Two IWDs ("what changed?")

```text
1. iwd_diff  path1="original.iwd"  path2="modded.iwd"
   → summary: N added, N removed, N modified

2. iwd_read  path="modded.iwd"  entry="<specific changed file>"  limit=40
   → read just the changed file if needed
   (or use content_diff=true on iwd_diff for inline diffs of all changed files)
```text

---

## ⛔ Never Do These

| Anti-pattern | Problem | Use instead |
|---|---|---|
| `iwd_list` with no filter on a big mod | Dumps 400+ entries with sizes | Add `summary_only=true` first |
| `iwd_read` on an unknown file without `iwd_info` first | Could dump 200KB of text or binary base64 | Always `iwd_info` → then `iwd_read limit=N` |
| `iwd_grep` with no `entry_glob` on a full mod | Scans all 400 files | Add `entry_glob="*.gsc"` |
| `iwd_write` for a tiny spelling fix | Re-sends the full file content | Use `iwd_patch` instead |
| `iwd_diff content_diff=true` upfront | Can be very verbose for many changed files | Start with summary, then drill into specific files |

---

## Backup & Safety

- All write operations create a `.bak` file **automatically** on first modification per session.
- Use `dry_run=true` on `iwd_write`, `iwd_patch`, `iwd_remove`, `iwd_rename`, `iwd_copy`, `iwd_extract` to preview before committing.
- If things go wrong: restore from `mod.iwd.bak`.

---

## Quick Copy-Paste Primer for LLM Sessions

> Paste this at the top of a new chat:

```text
I'm working with IWD files using the iw4x-toolkit MCP server.
Rules for this session:
- Start all IWD exploration with iwd_list summary_only=true
- Always run iwd_info before iwd_read on any unfamiliar file
- Use iwd_patch for edits, not iwd_write, unless adding a new file
- Use dry_run=true before any destructive operation
- Keep entry_glob set on all iwd_grep calls
- Use limit= on iwd_read — never read a whole file if we only need part of it
```text
