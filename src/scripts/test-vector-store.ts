import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePdf } from '../ingestion/pdf-parser.js';
import { chunkDocument } from '../ingestion/chunker.js';
import { embedChunks } from '../ingestion/embedder.js';
import { upsertChunks, queryCollection, COLLECTION_NAME } from '../ingestion/vector-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLICIES_DIR = path.resolve(__dirname, '../../Policies');

// --- STEP 1: Parse, chunk, embed (first 3 chunks only) ---
console.log('\n1. Parsing and chunking...');
const doc = await parsePdf(path.join(POLICIES_DIR, 'Employee Leave Policy.pdf'));
const chunks = chunkDocument(doc).slice(0, 3);
console.log(`   ${chunks.length} chunks ready`);

console.log('\n2. Embedding...');
const embedded = await embedChunks(chunks);
console.log(`   ${embedded.length} vectors ready`);

// --- STEP 2: Write to ChromaDB ---
console.log(`\n3. Writing to ChromaDB collection "${COLLECTION_NAME}"...`);
await upsertChunks(embedded);

// --- STEP 3: Query to verify retrieval works ---
console.log('\n4. Running a test query: "how many vacation days do employees get?"');

// Embed the query using the same model — critical that it matches ingest model
const queryEmbedded = await embedChunks([{
  text: 'how many vacation days do employees get?',
  metadata: {
    filename: 'query',
    source: 'query',
    category: 'query',
    department: 'query',
    accessLevel: 'query',
    effectiveDate: 'query',
    tags: [],
    fileType: 'pdf',
    chunkIndex: 0,
    totalChunks: 1,
  },
}]);

const queryVector = queryEmbedded[0].vector;
const results = await queryCollection(queryVector, 3);

console.log('\nTop 3 results:');
for (let i = 0; i < 3; i++) {
  const doc = results.documents[0][i];
  const meta = results.metadatas[0][i];
  const dist = results.distances?.[0][i];
  if (!doc || !meta) continue;
  console.log(`\n  [${i + 1}] distance: ${dist?.toFixed(4)}`);
  console.log(`      file: ${meta.filename}`);
  console.log(`      chunk: ${meta.chunkIndex} of ${meta.totalChunks}`);
  console.log(`      text: "${String(doc).slice(0, 120)}..."`);
}

console.log('\n✓ Vector store working — query returned ranked results');
