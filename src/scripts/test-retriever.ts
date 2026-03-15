import 'dotenv/config';
import { retrieve, formatContext } from '../rag/retriever.js';

const questions = [
  'How many vacation days do employees get?',
  'What counts as workplace harassment?',
  'Can I work remotely full time?',
];

for (const question of questions) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Q: ${question}`);
  console.log('─'.repeat(60));

  const chunks = await retrieve(question, { topK: 3 });

  if (chunks.length === 0) {
    console.log('No results above threshold.');
    continue;
  }

  for (const chunk of chunks) {
    console.log(
      `\n  score: ${chunk.score.toFixed(4)}  |  ${chunk.filename}  (chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks})`,
    );
    console.log(`  dept:  ${chunk.department}`);
    console.log(`  text:  "${chunk.text.slice(0, 120)}..."`);
  }

  console.log('\n--- Formatted context (what Claude would receive) ---');
  console.log(formatContext(chunks));
}
