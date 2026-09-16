# Additional interfaces: research notes

**Date:** 2026-09-16
**Scope:** six candidate interfaces beyond the current MCP server + skills:
1. Live game bridge (rcon + console log)
2. CI / pre-commit
3. Git diff driver for `.iwd`
4. Published knowledge base (JSON + `llms.txt`)
5. Tree-sitter grammar for GSC
6. Watch mode

All six share one prerequisite: a CLI (or at least a runnable entry point) over the existing core modules. Items 2, 3 and 6 are thin wrappers around that CLI.

---

## 1. Live game bridge

### RCON protocol (verified in `iw4x/iw4x-client` `src/Components/Modules/RCon.cpp`, branch `main`)

- Transport: UDP, default port 28960 (`net_port`).
- **Plain rcon request:** `\xff\xff\xff\xffrcon <password> <command>`. The server splits on the first space after the password and strips surrounding quotes from the password.
- **Response:** `\xff\xff\xff\xffprint\n<output>`. The server pipes all console output produced by the command into a buffer and sends it back in one `print` packet.
- **rconSafe:** `\xff\xff\xff\xffrconSafe ` followed by a protobuf `Proto::RCon::Command` with field 1 = command (tag `0x0A`) and field 2 = signature (tag `0x12`). The signature is RSA PKCS#1 v1.5 over SHA-512 of the command. The key is RSA 4096, DER format; the server reads `rsa-public.key` next to `iw4x.exe`. Reference client: `kkrruumm/iw4x-rcon` (Go).
- Server refuses plain rcon when `rcon_password` is empty ("RCon request from … dropped. No password set!").
- Rate limit: one request per IP per `rcon_timeout` ms (default 500, range 100–10000). Can be disabled with the `-disable-rate-limit-check` flag.
- `rcon_log_requests` (default false) logs each executed command.

### Critical constraint: rcon is dedicated-server only

`RCon::RCon()` returns early when `!Dedicated::IsEnabled()`, before the `rcon`/`rconSafe` packet handlers are registered. A normal game client or private match (listen server) **does not accept rcon at all**.

Consequences for the dev loop:
- Server-side mod work: run a local dedicated server (`DedicatedServer.bat` / `-dedicated`) with `rcon_password` set, connect to it from the client, and drive it over rcon. Works.
- Client/private-match work (menus, HUD, trickshot-style menus): no remote command channel. Options still to investigate: stdin of the external console (`-stdout`), or read-only mode (tail the log only, user restarts manually).

### Console log (verified in `Logger.cpp`, `Debug.cpp`, and on the local install)

- Logging is on by default (IW4X sets `logfile` to 1).
- File: `console_mp.log`. On this machine it lives at `F:/Call Of Duty Modern Warfare 2/userraw/console_mp.log`.
- Rotation: IW4X rotates on open, producing `console_mp.log.001`, `.002`, … (local install currently has up to `.019`). A tailer must follow the newest file, not a fixed name.
- Line format: `[<ms since start>] message`, e.g. `[     47493] CL_Disconnect called for local client 0`. Errors are framed by `********************` lines.
- Game event log (`g_log`) is separate: `userraw/logs/games_mp.log`.
- Dedicated servers also expose `g_log_add` / `g_log_del` / `g_log_list` SV commands for a network log target. Not yet verified what the stream contains; could replace file tailing for remote servers.

### Script errors

- Set `developer 1` and `developer_script 1` to get extended GSC VM errors (AlterWare forum, IW4X/IW4-SP):
  - compile errors report file, line and column;
  - runtime errors include a full stack trace with file/line/column per frame.
- Output goes to the in-game console, the external console with `-stdout`, and the log file in `userraw`.
- No script compile/runtime error sample exists in the local logs yet. **Next step:** trigger one deliberately and capture the exact text before writing a parser.

### Script reload

- Loose `.gsc` files in `userraw/scripts` (and `userraw/maps/...`) load without packing an IWD.
- `map_restart` reloads scripts and restarts the map. `fast_restart` restarts without the full reload (per Muhlex/iw4x-gsc command table: "fastrestart: Restart the map", "maprestart: Reload and restart the map").

### Open questions

- Exact format of script compile/runtime error lines (capture a real sample).
- Whether the external console (`-stdout`) accepts commands on stdin for listen servers.
- Contents of the `g_log_add` network stream.
- Whether `fast_restart` picks up edited scripts in practice.

---

## 2. CI and pre-commit

- **Binary:** `bun build --compile --target=<target>` cross-compiles single-file executables from one machine. Targets include `bun-windows-x64`, `bun-linux-x64`, `bun-linux-arm64`, `bun-darwin-x64`, `bun-darwin-arm64` (plus `-baseline`/`-modern`/`-musl` variants). Publish per-platform binaries on GitHub Releases.
- **pre-commit:** ship `.pre-commit-hooks.yaml` in this repo. Binary-backed hooks avoid a toolchain requirement on the user side (first run ~1s vs 30s+ source builds, per Adaptive Enforcement Lab).
- **GitHub Action:** a composite action that downloads the release binary and runs `lint` / `format --check`. Users can also run pre-commit in CI via `pre-commit/action`.
- **Prior art:** `xensik/gsc-tool` (GPL-3.0, active, 323 stars) has a `parse` mode and a `setup-gsc-tool` action. Its supported-games list covers IW5, IW6, IW7, IW8, IW9, S1, S2, S4, H1, H2, T6, T7, T8, T9, T10, JUP. **IW4 is not listed**, so it cannot serve as an authoritative IW4 syntax check. Our linter stays the IW4 source of truth.

---

## 3. Git diff driver for `.iwd`

Mechanism (gitattributes docs, nesbitt.io 2026-03-30):

```gitattributes
*.iwd diff=iwd
```

```ini
[diff "iwd"]
    textconv = iw4x iwd textconv
    cachetextconv = true
```

- `textconv` takes one filename argument and writes text to stdout. Git diffs the text of both sides. Applies to `git diff`, `git show`, `git log -p`.
- `cachetextconv` stores results in `refs/notes/textconv/iwd`, avoiding re-runs over history.
- One-way: the diff can be viewed, not applied as a patch.
- The `.gitattributes` line is committed; the `[diff "iwd"]` section must be set per clone (`git config`), because git does not run commands from committed config.
- Prior art: `costerwi/zipdoc` does the same for generic zip files.

Suggested output: sorted entry list (`path  size  crc32`) followed by full text of text entries (`.gsc`, `.cfg`, `.menu`, `.str`, `.csv`). Binary entries show only size/CRC, so a change is visible without dumping bytes. Existing `iwd_list` / `iwd_read` / `iwd_diff` logic covers most of this.

---

## 4. Published knowledge base

- `knowledge/` already holds the data: `dvars.json` (528 KB), `gsc-builtins.json` (556 KB), `gsc-anti-patterns.json`, `gsc-menu-hud.json`, `templates.json`.
- **llms.txt spec (llmstxt.org, v2):** Markdown file at `/llms.txt` or any subpath. Sections in order: H1 project name (only required part), blockquote summary, optional non-heading detail, then H2 sections of link lists (`- [name](url): description`). An H2 named `Optional` marks skippable links. Companion `llms-full.txt` holds all content inline.
- Adoption: Claude reads `llms.txt` during live fetches. Google says it is not required for AI Overviews.
- Delivery options: GitHub Pages from `knowledge/`, raw GitHub URLs, or jsDelivr (`cdn.jsdelivr.net/gh/<owner>/<repo>@<tag>/knowledge/...`) for versioned JSON.
- Add a JSON Schema per file so consumers can validate. Version with git tags.

---

## 5. Tree-sitter grammar for GSC

Existing grammars:

| Repo | License | Target | State |
|---|---|---|---|
| `Cjdcoy/tree-sitter-gsc` | MIT | CoD2 first, permissive superset of other dialects | Active (pushed 2026-08-30), CI, corpus tests. Built for `codebase-memory-mcp`. Deliberately not a linter. |
| `echo000/tree-sitter-gsc` | none stated | Black Ops III GSC/CSC | Work in progress, last push 2025-11. Includes `queries/highlights.scm`. |

Adjacent tool: `eyza-cod2/vscode-cod-gsc` (GPL-3.0, 27 stars, pushed 2026-05). VS Code extension with highlighting, completion, diagnostics, go-to-definition, references, rename, `#include` resolution. CoD2/CoD4 supported. Status for MW2 IW4 original: "Tested, errors childthread, call". Status for AlterWare IW4x: untested. Builtin completion is CoD2 MP functions.

Implications:
- Start from `Cjdcoy/tree-sitter-gsc` (MIT): contribute IW4 syntax to its corpus, or fork. Do not write a grammar from scratch.
- `vscode-cod-gsc` already covers the editor experience for CoD2/CoD4. The IW4x gap is IW4-specific builtins, dvars, and anti-pattern rules, which this repo already has. Contributing IW4 data there, or a GSC language server built on our linter, are both options. Its GPL-3.0 license matters if code is reused.

---

## 6. Watch mode

- Dev loop does not need IWD repacking: loose files in `userraw` load directly. Pack only for release.
- Existing building blocks: `userraw_sync` / `mods_sync` (`mcp-server/src/iwd/sync-tools.ts`) already copy changed loose files into the install.
- Loop: file change → lint → copy to `userraw` → (dedicated server only) rcon `map_restart` → tail newest `console_mp.log*` → report script errors with file:line.
- Watching: `fs.watch` with recursive mode works on Windows and macOS (Bun and Node). Debounce saves.
- Blocked on item 1 open questions for listen servers. On a local dedicated server the full loop works.

---

## Suggested order

1. CLI entry point over existing core (prerequisite for 2, 3, 6).
2. Git diff driver: smallest, and self-contained.
3. Publish knowledge base + `llms.txt`: no code changes to tools.
4. Capture real script error samples; build log tailer + rcon client.
5. Watch mode on top of 4.
6. CI action + pre-commit hook once binaries are released.
7. Tree-sitter: contribute IW4 corpus to `Cjdcoy/tree-sitter-gsc`.

## Sources

- IW4X RCON docs: https://docs.iw4x.io/hosting/rcon/
- IW4X server hosting docs: https://docs.iw4x.io/hosting/server-hosting/
- `RCon.cpp`: https://github.com/iw4x/iw4x-client/blob/main/src/Components/Modules/RCon.cpp
- `Logger.cpp`, `Debug.cpp`: https://github.com/iw4x/iw4x-client/tree/main/src/Components/Modules
- Safe RCON guide: https://forum.alterware.dev/t/safe-rcon-with-rsa-cryptosystem/70
- Extended GSC VM errors: https://forum.alterware.dev/t/extended-error-messages-from-the-gsc-vm/813
- Go rcon client: https://github.com/kkrruumm/iw4x-rcon
- Muhlex/iw4x-gsc: https://github.com/Muhlex/iw4x-gsc
- Bun executables: https://bun.com/docs/bundler/executables
- Pre-commit binary hooks: https://adaptive-enforcement-lab.com/blog/2025/12/10/pre-commit-hooks-binary-releases/
- pre-commit action: https://github.com/pre-commit/action
- gsc-tool: https://github.com/xensik/gsc-tool
- setup-gsc-tool: https://github.com/xensik/setup-gsc-tool
- Git diff drivers: https://nesbitt.io/2026/03/30/git-diff-drivers.html
- gitattributes: https://git-scm.com/docs/gitattributes
- zipdoc: https://github.com/costerwi/zipdoc
- llms.txt: https://llmstxt.org/
- tree-sitter-gsc (Cjdcoy): https://github.com/Cjdcoy/tree-sitter-gsc
- tree-sitter-gsc (echo000): https://github.com/echo000/tree-sitter-gsc
- vscode-cod-gsc: https://github.com/eyza-cod2/vscode-cod-gsc
