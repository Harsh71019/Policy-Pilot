import 'dotenv/config';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';
import { retrieve, formatContext } from './rag/retriever.js';
import { parsePdf } from './ingestion/pdf-parser.js';
import { parseDocx } from './ingestion/docx-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLICIES_DIR = path.resolve(__dirname, '../Policies');

const server = new McpServer({
  name: 'policy-pilot',
  version: '1.0.0',
});

// ─── Tool 1: search_policies ─────────────────────────────────────────────────
// The core RAG tool. Claude calls this when the user asks a policy question.
// It embeds the question, searches ChromaDB, and returns relevant policy text
// as context. Claude then synthesizes an answer from that context.
server.registerTool(
  'search_policies',
  {
    title: 'Search HR Policies',
    description:
      'Search Capgemini HR policy documents and return relevant excerpts. ' +
      'Use this tool whenever the user asks about leave, harassment, remote work, ' +
      'benefits, travel reimbursement, or code of conduct. ' +
      'Always cite the source document in your response.',
    inputSchema: {
      question: z
        .string()
        .describe('The user\'s question about HR policy, in plain English'),
      topK: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe('Number of policy excerpts to retrieve (default 5)'),
      department: z
        .enum(['Human Resources', 'Operations', 'Legal & Compliance', 'Finance'])
        .optional()
        .describe('Filter results to a specific department. Omit to search all departments.'),
    },
  },
  async ({ question, topK, department }) => {
    const chunks = await retrieve(question, {
      topK: topK ?? 5,
      filter: department ? { department } : undefined,
    });
    const context = formatContext(chunks);

    // Return both the formatted context AND structured metadata so Claude
    // knows which documents were searched and can cite them accurately.
    const sourceList = chunks
      .map((c) => `${c.filename} (${c.department})`)
      .filter((v, i, arr) => arr.indexOf(v) === i) // deduplicate
      .join(', ');

    const responseText =
      chunks.length === 0
        ? 'No relevant policy information found for this question. The query may be outside the scope of available HR policy documents.'
        : `Found ${chunks.length} relevant excerpt(s) from: ${sourceList}\n\n${context}`;

    return {
      content: [{ type: 'text' as const, text: responseText }],
    };
  },
);

// ─── Tool 2: hello_policy_pilot (health check) ───────────────────────────────
server.registerTool(
  'hello_policy_pilot',
  {
    title: 'Hello Policy Pilot',
    description: 'Health check — verifies the MCP server is running correctly',
    inputSchema: {
      message: z.string().describe('A test message to echo back'),
    },
  },
  async ({ message }) => ({
    content: [
      {
        type: 'text' as const,
        text: `PolicyPilot is running. You said: "${message}"`,
      },
    ],
  }),
);

// ─── Prompt 1: summarize_leave ───────────────────────────────────────────────
// Appears in Claude Desktop's + menu. One click gives the user a full leave summary.
server.registerPrompt(
  'summarize_leave',
  {
    title: 'Summarize Leave Entitlements',
    description: 'Get a structured summary of all leave types and entitlements',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Using the search_policies tool, look up all types of leave available to Capgemini employees. Then give me a structured summary with: leave type, number of days, eligibility, and any key conditions. Format it as a clear table or list.',
        },
      },
    ],
  }),
);

// ─── Prompt 2: know_your_rights ──────────────────────────────────────────────
// Parameterised prompt — user fills in a topic when they select it
server.registerPrompt(
  'know_your_rights',
  {
    title: 'Know Your Rights',
    description: 'Find out what the policies say about a specific topic',
    argsSchema: {
      topic: z.string().describe('The topic you want to understand (e.g. "harassment", "remote work", "sick leave")'),
    },
  },
  ({ topic }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Using the search_policies tool, find everything relevant to: "${topic}". Summarise what the policy says in plain English — what am I entitled to, what are the rules, and what should I do if I need to act on this?`,
        },
      },
    ],
  }),
);

// ─── Prompt 3: onboarding_checklist ──────────────────────────────────────────
server.registerPrompt(
  'onboarding_checklist',
  {
    title: 'New Employee Policy Checklist',
    description: 'Key policies every new Capgemini employee should know',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Using the search_policies tool, search for policies relevant to a new employee joining Capgemini. Cover: leave entitlements, remote work rules, code of conduct, and benefits. Present this as a friendly onboarding checklist with the most important points from each area.',
        },
      },
    ],
  }),
);

// ─── Resource: policy://{filename} ───────────────────────────────────────────
// Exposes each policy document as a readable resource.
// Claude can access policy://Employee%20Leave%20Policy.pdf to read the full text
// when it needs more context than the RAG chunks provide.
server.registerResource(
  'policy-document',
  new ResourceTemplate('policy://{filename}', { list: undefined }),
  {
    title: 'Policy Document',
    description: 'Full text of a Capgemini HR policy document. Available files: ' +
      'Employee Leave Policy.pdf, Anti-Harassment & Discrimination Policy.pdf, ' +
      'Remote Work & Hybrid Policy.docx, Employee Benefits Guide 2024.pdf, ' +
      'Travel & Reimbursement Policy.pdf, Capgemini Group Code of Business Ethics.docx',
    mimeType: 'text/plain',
  },
  async (uri, { filename }) => {
    const decodedFilename = decodeURIComponent(String(filename));
    const filePath = path.join(POLICIES_DIR, decodedFilename);

    const doc = decodedFilename.endsWith('.pdf')
      ? await parsePdf(filePath)
      : await parseDocx(filePath);

    return {
      contents: [
        {
          uri: uri.href,
          text: doc.text,
          mimeType: 'text/plain',
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
