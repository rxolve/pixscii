#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadPalettes } from '../core/palette.js';
import { loadIndex } from '../core/store.js';
import { loadCharacterAssets } from '../core/character.js';
import { useDiskAssets } from '../node/assets.js';
import { register as registerLibrary } from './tools/library.js';
import { register as registerCanvas } from './tools/canvas.js';
import { register as registerCompose } from './tools/compose.js';
import { register as registerAnimate } from './tools/animate.js';
import { register as registerPalette } from './tools/palette.js';

// Route import/export subcommands to CLI before starting MCP server
const subcommand = process.argv[2];
if (subcommand === 'import' || subcommand === 'export') {
  const { runCLI } = await import('../node/cli.js');
  await runCLI(process.argv.slice(2));
  process.exit(0);
}

const server = new McpServer({
  name: 'pixscii',
  version: '0.4.0',
});

registerLibrary(server);
registerCanvas(server);
registerCompose(server);
registerAnimate(server);
registerPalette(server);

async function main() {
  useDiskAssets();
  await Promise.all([loadIndex(), loadPalettes(), loadCharacterAssets()]);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
