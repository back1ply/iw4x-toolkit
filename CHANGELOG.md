# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/).
Releases before 3.0.0 are in the [git history](https://github.com/back1ply/iw4x-toolkit/commits/master).

## [3.0.0] - 2026-10-15

### Changed (breaking)
- `mods_sync` and `userraw_sync` are replaced by one tool and CLI command, `sync_loose_files(source_dir, dest_dir, dry_run)`. Point `dest_dir` at `mods/<name>` or `userraw`.

### Fixed
- `iwd_extract` and the sync tool overwrite existing files but were annotated `destructiveHint: false`; both are now destructive. A test enforces that every non-read-only tool is destructive.

### Changed
- `@modelcontextprotocol/server` and `/client` ^2.3.1; dependencies updated, `npm audit` clean.

### Added
- MIT license.
- `npm run probe` (in `mcp-server/`): lists tools via the MCP Inspector CLI.
- CI on Ubuntu and Windows.

[3.0.0]: https://github.com/back1ply/iw4x-toolkit/releases/tag/v3.0.0
