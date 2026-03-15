import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// McpServer is the high-level abstraction — it handles protocol negotiation,
// capability advertisement, and message routing so we don't have to
const server = new McpServer({
  name: 'policy-pilot',
  version: '1.0.0',
});

// registerTool: name → config object (title + description + inputSchema) → handler
// Bundling metadata into one config object is the current SDK pattern (v1.27+)
// The schema (Zod) does double duty: TypeScript types at compile time +
// runtime validation of what Claude actually sends us
server.registerTool(
  'hello_policy_pilot',
  {
    title: 'Hello Policy Pilot',
    description: 'Test tool to verify the MCP server is running correctly',
    inputSchema: {
      // Zod schema defines what inputs this tool accepts.
      // Claude Desktop reads this schema and knows what arguments to pass.
      message: z.string().describe('A test message to echo back'),
    },
  },
  async ({ message }) => {
    // Every tool handler must return this shape:
    // { content: Array<{ type: "text" | "image" | "resource", ... }> }
    // The MCP protocol requires this envelope — the SDK won't accept plain strings
    return {
      content: [
        {
          type: 'text' as const,
          text: `PolicyPilot is running. You said: "${message}"`,
        },
      ],
    };
  },
);

// StdioTransport = Claude Desktop launches this process and talks to it
// via stdin/stdout. No ports, no HTTP, no network — just a pipe.
const transport = new StdioServerTransport();

// connect() starts the message loop — server now listens for incoming
// MCP messages and dispatches them to the right tool/resource/prompt handler
await server.connect(transport);
