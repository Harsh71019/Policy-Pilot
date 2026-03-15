import path from 'path';
import { fileURLToPath } from 'url';
import { parsePdf } from '../ingestion/pdf-parser.js';
import { chunkDocument } from '../ingestion/chunker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLICIES_DIR = path.resolve(__dirname, '../../Policies');

const testFile = path.join(POLICIES_DIR, 'Employee Leave Policy.pdf');
const doc = await parsePdf(testFile);
const chunks = chunkDocument(doc);

console.log(`\nDocument: ${doc.metadata.filename}`);
console.log(`Total text: ${doc.text.length} chars`);
console.log(`Chunks produced: ${chunks.length}`);
console.log('─'.repeat(60));

// Show first 3 chunks so we can verify overlap is working
for (const chunk of chunks.slice(0, 3)) {
  console.log(`\n[Chunk ${chunk.metadata.chunkIndex + 1} of ${chunk.metadata.totalChunks}]`);
  console.log(`Length: ${chunk.text.length} chars`);
  console.log(`Text:\n${chunk.text}`);
  console.log('─'.repeat(60));
}

// Show the boundary between chunk 0 and chunk 1 explicitly
console.log('\n--- OVERLAP CHECK ---');
console.log('Last 60 chars of chunk 0:');
console.log(`"${chunks[0].text.slice(-60)}"`);
console.log('\nFirst 60 chars of chunk 1:');
console.log(`"${chunks[1].text.slice(0, 60)}"`);
console.log('\n(These should share some text — that is the overlap working)');
