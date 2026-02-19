# IW4X Toolkit — Workflow Guide

> **For vibe coders using this toolkit with an LLM.**  
> Paste this at the start of a new chat session to prime the LLM on the right tool sequence.

---

## The Golden Rule

> **Every tool defaults to the cheapest output. Verbose details are opt-in.**

| Need | Default call | Add this for more detail |
|------|-------------|--------------------------|
| What files are in this IWD? | `iwd_list summary_only=true` | `iwd_list pattern="*.gsc"` |
| See a list of .gsc scripts | `iwd_list pattern="*.gsc"` | `names_only=false` for sizes |
| Read a file | `iwd_info` first, then `iwd_read limit=50` | remove `limit` for full file |
| Find something | `iwd_grep pattern="X" entry_glob="*.gsc"` | increase `max_matches` if needed |
| Edit something | `iwd_patch dry_run=true` first | remove `dry_run` to commit |
| Compare two IWDs | `iwd_diff` | `content_diff=true` for line diffs |

---

## 4 Golden Paths

### 🔍 Path 1: Find & Fix ("change X to Y in this mod")

```
1. iwd_grep  path="mod.iwd"  pattern="X"  entry_glob="*.gsc"  max_matches=5
   → tells you which file and line number

2. iwd_read  path="mod.iwd"  entry="<file>"  offset=<line-5>  limit=20
   → read just the context around the match

3. iwd_patch  path="mod.iwd"  entry="<file>"  old="X"  new="Y"  dry_run=true
   → preview the diff

4. iwd_patch  path="mod.iwd"  entry="<file>"  old="X"  new="Y"
   → commit
```

### 🗺️ Path 2: Explore ("what's in this IWD?")

```
1. iwd_list  path="mod.iwd"  summary_only=true
   → "127 entries: 45 .gsc, 12 .menu, 8 .csv, 62 binary"

2. iwd_list  path="mod.iwd"  pattern="*.gsc"
   → compact name list of all scripts

3. iwd_info  path="mod.iwd"  entry="<interesting file>"
   → size, type, CRC — decide if worth reading

4. iwd_read  path="mod.iwd"  entry="<file>"  limit=50
   → first 50 lines
```

### ➕ Path 3: Add a New File

```
1. iwd_list  path="mod.iwd"  pattern="scripts/*"
   → confirm path doesn't clash

2. iwd_write  path="mod.iwd"  entry="scripts/myscript.gsc"  content="..."  dry_run=true
   → verify what will be created

3. iwd_write  path="mod.iwd"  entry="scripts/myscript.gsc"  content="..."
   → commit
```

### 📊 Path 4: Compare Two IWDs ("what changed?")

```
1. iwd_diff  path1="original.iwd"  path2="modded.iwd"
   → summary: N added, N removed, N modified

2. iwd_read  path="modded.iwd"  entry="<specific changed file>"  limit=40
   → read just the changed file if needed
   (or use content_diff=true on iwd_diff for inline diffs of all changed files)
```

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

```
I'm working with IWD files using the iw4x-toolkit MCP server.
Rules for this session:
- Start all IWD exploration with iwd_list summary_only=true
- Always run iwd_info before iwd_read on any unfamiliar file
- Use iwd_patch for edits, not iwd_write, unless adding a new file
- Use dry_run=true before any destructive operation
- Keep entry_glob set on all iwd_grep calls
- Use limit= on iwd_read — never read a whole file if we only need part of it
```
