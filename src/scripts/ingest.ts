import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { readdir } from 'fs/promises';
import { parsePdf } from '../ingestion/pdf-parser.js';
import { parseDocx } from '../ingestion/docx-parser.js';
import { chunkDocument } from '../ingestion/chunker.js';
import { embedChunks } from '../ingestion/embedder.js';
import { upsertChunks } from '../ingestion/vector-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLICIES_DIR = path.resolve(__dirname, '../../Policies');

// Read all files in the Policies directory and filter to supported types
const allFiles = await readdir(POLICIES_DIR);
const policyFiles = allFiles.filter(
  (f) => f.endsWith('.pdf') || f.endsWith('.docx'),
);

console.log(`\nFound ${policyFiles.length} policy documents to ingest:`);
for (const f of policyFiles) console.log(`  - ${f}`);
console.log();

let totalChunks = 0;

for (const filename of policyFiles) {
  const filePath = path.join(POLICIES_DIR, filename);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Processing: ${filename}`);

  // 1. Parse
  const doc = filename.endsWith('.pdf')
    ? await parsePdf(filePath)
    : await parseDocx(filePath);
  console.log(`  Parsed: ${doc.text.length} characters`);

  // 2. Chunk
  const chunks = chunkDocument(doc);
  console.log(`  Chunked: ${chunks.length} chunks`);

  // 3. Embed
  console.log(`  Embedding...`);
  const embedded = await embedChunks(chunks);

  // 4. Store
  await upsertChunks(embedded);

  totalChunks += chunks.length;
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`✓ Ingest complete`);
console.log(`  Documents processed: ${policyFiles.length}`);
console.log(`  Total chunks stored: ${totalChunks}`);
console.log(`${'═'.repeat(60)}\n`);
