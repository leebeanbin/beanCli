#!/usr/bin/env node
/**
 * beancli — Terminal-First Database Console
 *
 * This shim launches the Ink TUI via tsx so no pre-build step is needed.
 * Usage:
 *   beancli              # real mode (requires API + DB)
 *   beancli --mock       # mock mode (no external services needed)
 *   MOCK=true beancli    # same as --mock via env var
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, '../src/index-ink.tsx');

spawn(process.execPath, ['--import', 'tsx/esm', entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
}).on('exit', (code) => process.exit(code ?? 0));
