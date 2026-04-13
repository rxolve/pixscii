#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadPalettes } from './palette.js';
import { loadIndex } from './store.js';
import { loadCharacterAssets } from './character.js';
import { register as registerLibrary } from './tools/library.js';
import { register as registerCanvas } from './tools/canvas.js';
import { register as registerCompose } from './tools/compose.js';
import { register as registerAnimate } from './tools/animate.js';

// Route import/export subcommands to CLI before starting MCP server
const subcommand = process.argv[2];
if (subcommand === 'import' || subcommand === 'export') {
  const { runCLI } = await import('./cli.js');
  await runCLI(process.argv.slice(2));
  process.exit(0);
}

const server = new McpServer({
  name: 'pixscii',
  version: '0.3.1',
});

registerLibrary(server);
registerCanvas(server);
registerCompose(server);
registerAnimate(server);

async function main() {
  await Promise.all([loadIndex(), loadPalettes(), loadCharacterAssets()]);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
