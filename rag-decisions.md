1. Embedding:
   - Vogayer
   - Local (ChromaDB)
2. Vector Store:
   - ChromaDB
   - Pinecone
   - Milvus
3. Document Ingestion:
   - PDF/DOCX
   - CSV/TSV
   - JSON
4. RAG Pipeline:
   - Query → Embed → Search → Metadata Filter → Re-rank → Return Chunks
5. Writing a simple MCP server for learning.

What is MCP?

MCP (Model Context Protocol) is an open protocol (built by Anthropic) that standardizes
how AI models connect to external data sources and capabilities. Think of it as USB-C
for AI — one standard plug that works with any compliant device.

Without MCP, every AI app has a bespoke integration. With MCP, Claude (or any compliant
model) can talk to your server using one standard wire format.

---

The Three Primitives

MCP gives you exactly three building blocks. Understanding when to use each is the whole
game.

---

1. Tools — "Do something for me"

What: A function the model can call to take an action or fetch dynamic data.

Characteristics:

- Triggered by the model when it decides it needs them
- Can have side effects (writes, API calls, mutations)
- Returns data the model uses to compose its response
- Has a JSON schema that describes inputs

Real-world analogy: Tools are like the apps on your phone. When you want to check the
weather, you open the weather app (call the tool). The app fetches live data and returns
it.

In PolicyPilot, Tools are:
policy_search("maternity leave") → finds relevant chunks from vector store
policy_get_by_category("benefits") → lists all benefits policies
policy_check_eligibility("remote work", {"tenure": 1}) → checks if user qualifies

When to reach for Tools: Any time the answer requires computation, search, or dynamic
lookup that can't be pre-loaded.

---

2. Resources — "Give me data you already have"

What: Static or semi-static data the model can read, like files, documents, or database
records. Think of it as a read-only data endpoint.

Characteristics:

- No side effects — purely reads
- Addressed by a URI (like policy://leave/maternity)
- The host application decides when to include them (not just the model)
- Better for large, structured content you want to expose as "context"

Real-world analogy: Resources are like web pages. They sit there with a URL. You
navigate to them when you want to read them. They don't do anything — they just are
something.

In PolicyPilot, Resources are:
policy://catalogue → list of all policies with metadata
policy://leave/maternity → full text of the maternity leave policy
policy://benefits/health → full health benefits document

When to reach for Resources: When you want to expose entire documents or catalogues that
clients can browse — not just search results.

---

3. Prompts — "Here's a reusable template for talking to the model"

What: Pre-written prompt templates that users or client apps can invoke. They're like
saved workflows — a structured way to start a conversation about a topic.

Characteristics:

- Defined on the server, invoked by the client
- Can accept arguments to fill in variables
- Ensure consistent, well-engineered prompts across all uses
- Show up as slash-commands or suggestions in Claude Desktop

Real-world analogy: Prompts are like legal form templates. Instead of a lawyer writing a
contract from scratch every time, they fill in a standard template. The template
encodes best practices so the output is always high quality.

In PolicyPilot, Prompts are:
/policy-question → "You are an HR assistant. The user has asked: {{question}}.
Search for relevant policies and answer clearly..."

/eligibility-check → "Given employee profile: {{profile}},
check the following policies and determine eligibility..."

When to reach for Prompts: When you want to standardize how people ask questions — not
just what data they get back.

---

The Decision Matrix

┌────────────────────────────────────────────┬──────────┐
│ I want to... │ Use │
├────────────────────────────────────────────┼──────────┤
│ Search the vector store dynamically │ Tool │
├────────────────────────────────────────────┼──────────┤
│ Let Claude check if someone is eligible │ Tool │
├────────────────────────────────────────────┼──────────┤
│ Expose a full policy document for reading │ Resource │
├────────────────────────────────────────────┼──────────┤
│ List all available policy categories │ Resource │
├────────────────────────────────────────────┼──────────┤
│ Standardize how HR questions are asked │ Prompt │
├────────────────────────────────────────────┼──────────┤
│ Create a consistent eligibility check flow │ Prompt │
└────────────────────────────────────────────┴──────────┘

---

How They Work Together in PolicyPilot

User in Claude Desktop:
"Am I eligible for remote work after 6 months?"
↓
Claude invokes /eligibility-check Prompt
→ Prompt gives Claude a structured template to reason with
↓
Claude calls policy_check_eligibility Tool
→ Tool searches vector store, returns relevant chunks
↓
Claude reads policy://remote-work Resource
→ Gets the full policy document for precise answer
↓
Claude responds with structured, accurate answer

All three primitives working together — each doing what it's best at.

Good. That JSON-RPC 2.0 observation is sharp — most people use MCP without ever noticing
the wire format. You'll appreciate that knowledge when you debug a malformed tool
response later.

---

Phase 2, Step 2.1 — RAG Pipeline Architecture

Before we write a single parser, you need the full mental map of what we're building.
Every file in Phase 2-4 is just one piece of this pipeline.

---

The Two Modes of a RAG System

RAG has two completely separate runtime modes. Confusing them is the most common
beginner mistake.

┌─────────────────────────────────────────────────────┐
│ INGEST TIME (runs once, offline, you trigger it) │
│ │
│ Raw Doc → Parse → Chunk → Embed → Store in DB │
│ │
│ `npm run ingest` │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ QUERY TIME (runs on every user question) │
│ │
│ Question → Embed → Search DB → Retrieve chunks │
│ → Pass to LLM → Answer │
│ │
│ MCP tool call from Claude Desktop │
└─────────────────────────────────────────────────────┘

Ingest time is expensive and slow — you're reading files, calling the embedding API for
thousands of chunks, writing to a database. You do this once (or when documents change).

Query time must be fast — user is waiting. You embed one query string, do a vector
similarity search, retrieve 3-5 chunks, done. The heavy work was already done at ingest
time.

---

Full Pipeline Diagram

INGEST TIME
───────────
PDF/DOCX files
│
▼
┌─────────────┐
│ Parser │ src/ingestion/pdf-parser.ts
│ │ src/ingestion/docx-parser.ts
└─────────────┘
│ raw text + metadata
▼
┌─────────────┐
│ Chunker │ src/rag/chunker.ts
│ │ splits text into overlapping chunks
└─────────────┘
│ chunks[]
▼
┌─────────────┐
│ Embedder │ src/rag/embedder.ts
│ │ chunk text → float[] vector via Voyage AI
└─────────────┘
│ vectors[]
▼
┌─────────────┐
│ Vector Store│ src/rag/vector-store.ts
│ (ChromaDB) │ stores vectors + original text + metadata
└─────────────┘

QUERY TIME
──────────
User question: "Am I eligible for remote work?"
│
▼
┌─────────────┐
│ Embedder │ same embedder, one call
│ │ question text → float[] vector
└─────────────┘
│ query vector
▼
┌─────────────┐
│ Retriever │ src/rag/retriever.ts
│ │ cosine similarity search in ChromaDB
│ │ returns top-k most similar chunks
└─────────────┘
│ relevant chunks[]
▼
┌─────────────┐
│ MCP Tool │ src/tools/search-policy.ts
│ │ formats chunks as tool response
│ │ Claude uses them to compose answer
└─────────────┘

---

Why Each Step Exists

Parser — PDFs and DOCXs aren't plain text. They have binary encoding, layout metadata,
fonts. The parser's only job is: binary file → clean plain text string.

Chunker — LLMs have context windows. You can't embed or retrieve a 40-page policy
document as one unit. You split it into overlapping pieces so no information falls
between the cracks.

Embedder — Converts text into a position in high-dimensional space. Similar meaning =
nearby position. This is what makes semantic search possible — you're not matching
keywords, you're matching meaning.

Vector Store — A database optimized for "find me the N vectors closest to this query
vector." ChromaDB does this locally. Each stored vector also carries the original chunk
text and metadata (which document, which page, which category).

Retriever — The query-time brain. Embeds the question, searches the store, applies any
metadata filters, returns the most relevant chunks ranked by similarity score.

---

The Critical Insight

The embedder is used in both modes — but doing different things:

- At ingest: embed hundreds of chunks, store them
- At query: embed one question, search with it

The model that embedded your chunks must be the same model you use to embed queries. If
you ingest with voyage-3-lite and query with a different model, you're searching in the
wrong vector space and results will be garbage. We'll enforce this by keeping the
embedder as a single module used in both pipelines.

---

That's the full map. Every file we write from here fits into one of those boxes.

One question before we write the PDF parser:

Look at the pipeline diagram. At query time, the Retriever returns chunks to the MCP
Tool. The MCP Tool passes them to Claude. But Claude doesn't see the raw vector numbers
— what exactly does it receive, and how does that become a natural language answer?

I think we again embed the chunks recieved and convert it to text and then pass it to claude i think this is the right way to do it
