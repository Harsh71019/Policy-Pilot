import { VoyageAIClient } from 'voyageai';
import type { DocumentChunk } from '../ingestion/chunker.js';

// A chunk that has been embedded — text + metadata + its vector representation.
// This is what gets written to ChromaDB.
export interface EmbeddedChunk {
  chunk: DocumentChunk;
  vector: number[];
}

// How many chunks to send in one Voyage API call.
// Voyage's free tier allows up to 1M tokens/month — batching keeps us well within limits
// and avoids hitting per-request token caps.
const BATCH_SIZE = 8;

// Small delay between batches to be a good API citizen on the free tier.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function embedChunks(
  chunks: DocumentChunk[],
): Promise<EmbeddedChunk[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY is not set in environment variables');
  }

  const client = new VoyageAIClient({ apiKey });
  const results: EmbeddedChunk[] = [];

  // Split chunks into batches
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

    console.log(`  Embedding batch ${batchNum}/${totalBatches} (${batch.length} chunks)...`);

    const response = await client.embed({
      input: batch.map((c) => c.text),
      model: 'voyage-2',
    });

    // response.data is an array in the same order as the input texts.
    // Zip each chunk with its corresponding embedding vector.
    for (let j = 0; j < batch.length; j++) {
      const embedding = response.data?.[j]?.embedding;
      if (!embedding) {
        throw new Error(
          `Missing embedding for chunk ${i + j} ("${batch[j].metadata.filename}")`,
        );
      }
      results.push({ chunk: batch[j], vector: embedding });
    }

    // Pause between batches — skip the delay after the last batch
    if (i + BATCH_SIZE < chunks.length) {
      await sleep(200);
    }
  }

  return results;
}
