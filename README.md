# PolicyPilot

An MCP (Model Context Protocol) server that gives Claude access to Capgemini HR policy documents via a RAG (Retrieval-Augmented Generation) pipeline. Ask Claude anything about leave, harassment, remote work, benefits, travel reimbursement, or code of conduct — it searches the actual policy documents and answers with citations.

---

## What It Does

Instead of Claude guessing or hallucinating policy details, PolicyPilot:

1. Parses real PDF and DOCX policy documents
2. Breaks them into overlapping chunks and embeds them as vectors (Voyage AI)
3. Stores those vectors in ChromaDB
4. At query time, embeds the user's question, finds the most semantically similar chunks, and returns them as grounded context
5. Exposes everything to Claude Desktop via the MCP protocol

---

## Architecture

```
Policies/ (PDF + DOCX)
    │
    ▼
pdf-parser.ts / docx-parser.ts
    │  Extracts clean text + metadata (department, tags, access level)
    ▼
chunker.ts
    │  Splits text into 500-char windows with 50-char overlap
    │  Snaps to sentence boundaries to avoid mid-sentence cuts
    ▼
embedder.ts
    │  Calls Voyage AI (voyage-2, 1024 dimensions) in batches of 8
    │  Retries automatically on rate limit (429)
    ▼
vector-store.ts
    │  Upserts chunks into ChromaDB with stable IDs (filename_chunk_N)
    │  Safe to re-run — upsert overwrites, never duplicates
    ▼
ChromaDB (local server, ./chroma_data/)
    │
    ▼  (at query time)
retriever.ts
    │  Embeds the user's question with the same Voyage model
    │  Searches ChromaDB for nearest vectors (cosine distance)
    │  Filters out weak matches above threshold (0.65)
    │  Returns ranked chunks with source metadata
    ▼
src/index.ts (MCP Server)
    │  Tools, Resources, Prompts registered here
    ▼
Claude Desktop
```

---

## MCP Primitives

### Tools
| Name | Description |
|------|-------------|
| `search_policies` | Core RAG tool. Embeds question → searches ChromaDB → returns ranked excerpts with citations. Supports optional `department` filter. |
| `hello_policy_pilot` | Health check — verifies the server is running. |

### Resources
| URI | Description |
|-----|-------------|
| `policy://{filename}` | Returns the full parsed text of any policy document on demand. Claude uses this when it needs complete context beyond what chunks provide. |

### Prompts (appear in Claude Desktop's + menu)
| Name | Description |
|------|-------------|
| `summarize_leave` | One-click structured summary of all leave types and entitlements. |
| `know_your_rights` | Parameterised — type a topic (e.g. "sick leave") and get a plain-English explanation. |
| `onboarding_checklist` | Key policies every new Capgemini employee should know. |

---

## Policy Documents

| File | Department |
|------|------------|
| Employee Leave Policy.pdf | Human Resources |
| Anti-Harassment & Discrimination Policy.pdf | Legal & Compliance |
| Remote Work & Hybrid Policy.docx | Operations |
| Employee Benefits Guide 2024.pdf | Human Resources |
| Travel & Reimbursement Policy.pdf | Finance |
| Capgemini Group Code of Business Ethics.docx | Legal & Compliance |

Total: 6 documents → 110 chunks → 110 × 1024-dimensional vectors in ChromaDB.

---

## Setup

### Prerequisites
- Node.js 18+
- Python 3 with `pipx` installed (`brew install pipx`)
- A [Voyage AI](https://www.voyageai.com/) account (free tier — 200M tokens, no payment needed for basic use)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
# Add your Voyage AI key:
# VOYAGE_API_KEY=your_key_here
```

### 3. Install and start ChromaDB

```bash
pipx install chromadb

# In a separate terminal — keep this running whenever using PolicyPilot:
chroma run --path ./chroma_data --port 8000
```

### 4. Ingest policy documents

```bash
npm run ingest
```

This parses all PDFs and DOCXs in `Policies/`, chunks them, embeds them via Voyage AI, and stores them in ChromaDB. Run once on setup, and again whenever documents change.

### 5. Build

```bash
npm run build
```

### 6. Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "policy-pilot": {
      "command": "node",
      "args": ["/absolute/path/to/PolicyPilot/dist/index.js"],
      "env": {
        "VOYAGE_API_KEY": "your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. The hammer icon (🔨) in the chat bar confirms the server is connected.

---

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run ingest` | Run the full ingestion pipeline |
| `npm run dev` | Watch mode — recompiles on file changes |
| `npm run inspector` | Open MCP Inspector to test tools interactively |

---

## How We Built It — The Learning Journey

This project was built step by step, with each decision explained. Here's what we learned at each stage and why each improvement was made.

### Phase 1 — MCP Server Basics

Built a hello world MCP server with one tool. Key insight: **MCP uses JSON-RPC 2.0 over stdin/stdout**. Claude Desktop launches the server as a child process and communicates through pipes — no HTTP, no ports. The SDK handles all protocol framing.

The three MCP primitives:
- **Tools** — functions Claude can call (like API endpoints)
- **Resources** — addressable content Claude can read (like files)
- **Prompts** — reusable query templates shown in the UI

### Phase 2 — Ingestion Pipeline

**Parsing**

PDFs are layout-based (x/y coordinates for every character) so extraction is noisy — page numbers and headers appear as plain text mixed in with content. DOCX files are semantic XML, so mammoth extracts clean prose with no layout noise. Same cleaning logic is applied to both: normalize line endings, collapse whitespace, strip excess blank lines.

Both parsers return a `ParsedDocument` shape with `text` and `metadata`. The metadata (department, tags, access level, effective date) comes from `metadata.json` alongside the policy files and travels with every chunk into ChromaDB so we can filter at query time.

**Chunking**

Documents are split into 500-character windows with 50-character overlap.

- *Why 500 chars?* Large enough to capture a complete policy rule, small enough that the embedding represents one coherent idea rather than an average of many.
- *Why overlap?* Sentences that fall on chunk boundaries appear in both adjacent chunks. No information is lost at the seam.

**Improvement made:** The initial chunker snapped to word boundaries. This produced fragments like `"nal 2 days may be granted..."` at chunk starts. Upgraded to sentence boundary snapping — look backwards from the target position for `. ! ?` followed by whitespace within a 100-char window. Fall back to word boundary, then hard cut. Overlap handles continuity in the fallback cases.

**Embedding**

Voyage AI's `voyage-2` model turns each chunk into a list of 1024 floats. Similar meaning → similar numbers → small cosine angle → high similarity score. Chunks are sent in batches of 8 with 500ms between batches and automatic retry on 429 rate limit errors.

Critical rule: **use the same model at query time as at ingest time.** Different models produce incompatible vector spaces — comparison would be meaningless.

**Vector Store**

ChromaDB stores vectors with flat metadata (ChromaDB only accepts `string | number | boolean` values — arrays like `tags` are serialized to comma-separated strings and deserialized on read).

Key design choices:
- `upsert` not `add` — safe re-runs. `add` throws on duplicate IDs, `upsert` overwrites cleanly.
- Stable IDs (`filename_chunk_N`) — the same document always produces the same IDs, so re-ingesting after a document update overwrites exactly the right chunks.

**Code quality improvements along the way:** `ParsedDocument` was originally defined in `pdf-parser.ts` and imported by `docx-parser.ts`. A parser file shouldn't own a shared interface — moved to `src/types/documents.ts`. Similarly, `loadPolicyMetadata` was duplicated across both parsers and extracted to `src/ingestion/metadata-loader.ts`. Fix once, applies everywhere.

### Phase 3 — RAG Query Engine

The retriever embeds the question using the same Voyage model, queries ChromaDB for the top-K nearest chunks, and filters out weak matches above a score threshold.

**Score threshold calibration**

We measured cosine distances empirically across real queries:
- In-scope queries (leave, harassment, remote work): `0.33–0.55`
- Out-of-scope queries ("how to cook pasta"): `0.73+`

Threshold set at **0.65** — clear gap between the two clusters. Below threshold = relevant, return it. Above threshold = discard, return "No relevant policy found."

One interesting case: *"How do I expense a helicopter?"* scored `0.51` — within the in-scope range, because "expense" maps semantically to the Travel & Reimbursement policy. The retrieval was actually correct. The policy doesn't cover helicopters specifically but does cover the expense domain broadly. This is the right behavior — Claude should answer "helicopters aren't listed, but here's what transportation IS reimbursable."

### Phase 4 — MCP Integration & Enhancements

**Wiring the tool:** The `search_policies` tool calls the retriever and formats the results with source citations. The tool description is read by Claude as instructions — `"Always cite the source document"` in the description is enough for Claude to include citations without needing a system prompt.

**Metadata filtering:** Added an optional `department` parameter. Default: search all 110 chunks across all documents. With filter: only search chunks from that department. Tradeoff — filtering is faster and cheaper but risks missing cross-department relevance (e.g. a leave question that touches both HR and Legal). Default is no filter.

**MCP Resources:** Registered `policy://{filename}` as a resource template. When Claude needs the full document (not just top-5 chunks), it can access `policy://Employee%20Leave%20Policy.pdf` and get the complete parsed text. The URI is decoded and routed to the same parsers used at ingest time — no duplication.

**MCP Prompts:** Three templates in the Claude Desktop `+` menu. `know_your_rights` is parameterised — the user types a topic and the prompt constructs a well-structured query automatically. The other two fire immediately with no input required.

---

## Key Design Decisions

| Decision | Why |
|----------|-----|
| Separate ingest script | Embedding 110 chunks takes ~15s and makes dozens of API calls. Never run at query time. |
| `upsert` over `add` | Safe re-runs. `add` throws on duplicate IDs; `upsert` overwrites cleanly. |
| No metadata filter by default | Cross-department queries need all chunks. Filter only when the user's context is explicit. |
| Stable chunk IDs (`filename_chunk_N`) | Same document always produces same IDs — enables clean re-ingest without duplicates. |
| Same model for ingest and query | Vectors must live in the same embedding space to be comparable. |
| Sentence boundary snapping | Fragment starts in chunks degrade retrieval quality and look broken in citations. |
| Score threshold at 0.65 | Empirically calibrated gap between in-scope (0.33–0.55) and out-of-scope (0.73+) queries. |

---

## Project Structure

```
PolicyPilot/
├── Policies/                    # Source PDF and DOCX policy files
│   └── metadata.json            # Department, tags, access level per document
├── src/
│   ├── index.ts                 # MCP server — all tools, resources, prompts
│   ├── types/
│   │   └── documents.ts         # ParsedDocument, DocumentChunk interfaces
│   ├── ingestion/
│   │   ├── metadata-loader.ts   # Shared metadata.json loader
│   │   ├── pdf-parser.ts        # PDF → ParsedDocument
│   │   ├── docx-parser.ts       # DOCX → ParsedDocument
│   │   ├── chunker.ts           # ParsedDocument → DocumentChunk[]
│   │   ├── embedder.ts          # DocumentChunk[] → EmbeddedChunk[] (Voyage AI)
│   │   └── vector-store.ts      # ChromaDB upsert + query
│   ├── rag/
│   │   └── retriever.ts         # retrieve() + formatContext()
│   └── scripts/
│       ├── ingest.ts            # Full pipeline — run once to populate ChromaDB
│       ├── peek-db.ts           # Inspect what's stored in ChromaDB
│       ├── test-chunker.ts
│       ├── test-embedder.ts
│       ├── test-retriever.ts
│       ├── test-pdf-parser.ts
│       └── test-docx-parser.ts
├── chroma_data/                 # ChromaDB storage (git-ignored — regenerate with npm run ingest)
├── dist/                        # Compiled JS output (git-ignored)
├── .env                         # VOYAGE_API_KEY (git-ignored)
└── package.json
```
