import 'dotenv/config';
import { getCollection } from '../ingestion/vector-store.js';

const collection = await getCollection();
const count = await collection.count();

console.log(`\nCollection: policy_chunks`);
console.log(`Total chunks: ${count}`);
console.log('─'.repeat(60));

// Peek at a sample — get first 5 chunks with metadata
const sample = await collection.get({ limit: 5, include: ['metadatas', 'documents'] });

console.log('\nSample chunks:\n');
for (let i = 0; i < sample.ids.length; i++) {
  const meta = sample.metadatas?.[i];
  const doc = sample.documents?.[i];
  console.log(`  ID:   ${sample.ids[i]}`);
  console.log(`  File: ${meta?.filename}  [${meta?.fileType}]`);
  console.log(`  Dept: ${meta?.department}`);
  console.log(`  Text: "${String(doc).slice(0, 80)}..."`);
  console.log();
}
