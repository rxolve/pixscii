import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Core must run in a browser: no Node built-ins, no sharp, no MCP, and no reaching into node/ or mcp/.

const CORE_DIR = path.dirname(fileURLToPath(import.meta.url));
const NODE_BUILTINS = new Set([
  'fs', 'fs/promises', 'path', 'url', 'os', 'crypto', 'stream', 'buffer', 'child_process', 'http', 'https', 'util',
]);

const sources = fs
  .readdirSync(CORE_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => ({ file: f, text: fs.readFileSync(path.join(CORE_DIR, f), 'utf-8') }));

describe('core boundary', () => {
  it.each(sources)('$file imports only core modules', ({ text }) => {
    const specifiers = [...text.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const bad = specifiers.filter(
      (s) => s.startsWith('node:') || NODE_BUILTINS.has(s) || s === 'sharp' || s.startsWith('@modelcontextprotocol') || s === 'zod' || s.startsWith('..'),
    );
    expect(bad).toEqual([]);
  });

  it.each(sources)('$file uses no Node globals', ({ text }) => {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bBuffer\b|\bprocess\.|\b__dirname\b|\brequire\(/);
  });
});
