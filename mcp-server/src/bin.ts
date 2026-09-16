#!/usr/bin/env node
// `iw4x-toolkit` executable entry. Kept separate from cli.ts so tests can import runCli without running it.
import { runCli } from "./cli.js";

process.exitCode = await runCli(process.argv.slice(2));
