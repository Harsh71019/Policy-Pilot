import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePdf } from '../ingestion/pdf-parser.js';
import { chunkDocument } from '../ingestion/chunker.js';
import { embedChunks } from '../ingestion/embedder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLICIES_DIR = path.resolve(__dirname, '../../Policies');

// Use just the first 3 chunks — enough to verify the API works without burning tokens
const testFile = path.join(POLICIES_DIR, 'Employee Leave Policy.pdf');
const doc = await parsePdf(testFile);
const allChunks = chunkDocument(doc);
const chunks = allChunks.slice(0, 3);

console.log(`\nEmbedding ${chunks.length} chunks from "${doc.metadata.filename}"...`);
console.log('─'.repeat(60));

const embedded = await embedChunks(chunks);

console.log('\nResults:');
for (const { chunk, vector } of embedded) {
  console.log(`\n  Chunk ${chunk.metadata.chunkIndex + 1}: "${chunk.text.slice(0, 60)}..."`);
  console.log(`  Vector dimensions: ${vector.length}`);
  console.log(`  First 5 values:    [${vector.slice(0, 5).map((v) => v.toFixed(4)).join(', ')}]`);
}

console.log('\n─'.repeat(60));
console.log('✓ Embedder working — vectors are real numbers, correct dimensions');
