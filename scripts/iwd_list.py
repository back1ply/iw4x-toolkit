#!/usr/bin/env python3
"""List or extract IWD archives (ZIP-compatible). Accepts a single IWD, multiple IWDs, or a folder."""

import sys
import zipfile
import fnmatch
from pathlib import Path
from collections import Counter


def list_iwd(path: Path, summary: bool = False, pattern: str | None = None) -> None:
    try:
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
    except zipfile.BadZipFile:
        print(f"ERROR: {path.name} is not a valid IWD/ZIP archive", file=sys.stderr)
        return

    if pattern:
        names = [n for n in names if fnmatch.fnmatch(n, pattern)]

    if summary:
        counts = Counter(Path(n).suffix.lower() or "<no-ext>" for n in names)
        parts = ", ".join(f"{v} {k}" for k, v in sorted(counts.items(), key=lambda x: -x[1]))
        print(f"{path.name}: {len(names)} entries  [{parts}]")
    else:
        for name in sorted(names):
            print(f"{path.name}  {name}")


def extract_iwd(path: Path, dest: Path, pattern: str | None = None, flat: bool = False) -> int:
    """Extract entries from an IWD. Returns count of extracted files."""
    try:
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
            if pattern:
                names = [n for n in names if fnmatch.fnmatch(n, pattern)]

            dest.mkdir(parents=True, exist_ok=True)
            extracted = 0
            for name in names:
                if name.endswith("/"):  # skip directory entries
                    continue
                if flat:
                    out_path = dest / Path(name).name
                else:
                    out_path = dest / name
                    out_path.parent.mkdir(parents=True, exist_ok=True)

                out_path.write_bytes(z.read(name))
                print(f"  {name}")
                extracted += 1

    except zipfile.BadZipFile:
        print(f"ERROR: {path.name} is not a valid IWD/ZIP archive", file=sys.stderr)
        return 0

    return extracted


def collect_iwds(targets: list[str]) -> list[Path]:
    iwds: list[Path] = []
    for target in targets:
        p = Path(target)
        if p.is_dir():
            found = sorted(p.glob("*.iwd")) + sorted(p.glob("*.IWD"))
            if not found:
                print(f"WARNING: no .iwd files in {p}", file=sys.stderr)
            iwds.extend(found)
        elif p.is_file() and p.suffix.lower() == ".iwd":
            iwds.append(p)
        else:
            print(f"SKIP: {target} (not an .iwd file or directory)", file=sys.stderr)
    return iwds


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="List or extract IWD archive contents",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List
  iwd_list.py mod.iwd
  iwd_list.py mod.iwd base.iwd
  iwd_list.py mods/mymod/
  iwd_list.py mods/mymod/ --summary
  iwd_list.py mod.iwd --pattern "*.gsc"

  # Extract
  iwd_list.py mod.iwd --extract
  iwd_list.py mod.iwd --extract --output out/
  iwd_list.py mods/ --extract --output out/        # each IWD → out/<iwd-name>/
  iwd_list.py mod.iwd --extract --pattern "*.gsc"
  iwd_list.py mod.iwd --extract --flat             # no subfolders, all files in dest root
""",
    )
    parser.add_argument("targets", nargs="+", help="IWD files or folders containing IWDs")
    parser.add_argument("-s", "--summary", action="store_true", help="One-line type breakdown per IWD")
    parser.add_argument("-p", "--pattern", metavar="GLOB", help="Filter entries by glob (e.g. '*.gsc')")
    parser.add_argument("--count", action="store_true", help="Print entry count only, no names")
    parser.add_argument("-x", "--extract", action="store_true", help="Extract files instead of listing")
    parser.add_argument("-o", "--output", metavar="DIR", help="Output directory for extraction (default: ./<iwd-name>/)")
    parser.add_argument("--flat", action="store_true", help="Extract all files into dest root, no subdirectories")
    args = parser.parse_args()

    iwds = collect_iwds(args.targets)
    if not iwds:
        print("No IWD files found.", file=sys.stderr)
        sys.exit(1)

    if args.extract:
        multi = len(iwds) > 1
        total = 0
        for iwd in iwds:
            if args.output:
                # multiple IWDs → each gets its own subdir; single IWD → straight into output
                dest = Path(args.output) / iwd.stem if multi else Path(args.output)
            else:
                dest = Path(iwd.stem)
            print(f"\n>>> {iwd.name}  →  {dest}/")
            n = extract_iwd(iwd, dest, pattern=args.pattern, flat=args.flat)
            print(f"    {n} file(s) extracted")
            total += n
        if multi:
            print(f"\nTotal: {total} file(s) extracted from {len(iwds)} IWD(s)")
        return

    if args.count:
        for iwd in iwds:
            try:
                with zipfile.ZipFile(iwd) as z:
                    n = len(z.namelist())
                print(f"{iwd.name}: {n}")
            except zipfile.BadZipFile:
                print(f"ERROR: {iwd.name} is not a valid archive", file=sys.stderr)
        return

    for iwd in iwds:
        list_iwd(iwd, summary=args.summary, pattern=args.pattern)


if __name__ == "__main__":
    main()
