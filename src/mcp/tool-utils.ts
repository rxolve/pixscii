import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Register an MCP tool with automatic error handling.
 * Wraps the handler in a try-catch so individual tool files don't need boilerplate.
 */
export function defineTool(
  server: McpServer,
  name: string,
  description: string,
  schema: Record<string, any>,
  handler: (args: any) => Promise<any>,
): void {
  server.tool(name, description, schema, async (args: any) => {
    try {
      return await handler(args);
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  });
}
