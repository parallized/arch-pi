#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const isWin = process.platform === 'win32';
const cmd = isWin ? (process.env.ComSpec || 'cmd.exe') : 'pnpm';
const args = isWin
  ? ['/d', '/s', '/c', 'pnpm', 'dev', ...process.argv.slice(2)]
  : ['dev', ...process.argv.slice(2)];

const child = spawn(cmd, args, {
  cwd: repoRoot,
  stdio: 'inherit'
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
