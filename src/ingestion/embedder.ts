import { VoyageAIClient } from 'voyageai';
import type { DocumentChunk } from '../ingestion/chunker.js';

export interface EmbeddedChunk {
  chunk: DocumentChunk;
  vector: number[];
}

const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 500;       // delay between batches (normal)
const RETRY_DELAY_MS = 20_000;    // wait 20s on 429 before retrying
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedBatchWithRetry(
  client: VoyageAIClient,
  texts: string[],
  batchLabel: string,
): Promise<number[][]> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.embed({ input: texts, model: 'voyage-2' });
      return response.data?.map((d) => d.embedding ?? []) ?? [];
    } catch (err: unknown) {
      const isRateLimit =
        typeof err === 'object' &&
        err !== null &&
        'statusCode' in err &&
        (err as { statusCode: number }).statusCode === 429;

      if (isRateLimit && attempt < MAX_RETRIES) {
        console.warn(
          `  ⚠️  Rate limited on ${batchLabel} — waiting ${RETRY_DELAY_MS / 1000}s before retry ${attempt}/${MAX_RETRIES - 1}...`,
        );
        await sleep(RETRY_DELAY_MS);
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Failed to embed ${batchLabel} after ${MAX_RETRIES} attempts`);
}

// Embed a single query string — lighter than embedChunks which expects DocumentChunks.
// Must use the same model as ingest (voyage-2) or similarity scores are meaningless.
export async function embedQuery(query: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY is not set in environment variables');

  const client = new VoyageAIClient({ apiKey });
  const response = await client.embed({ input: [query], model: 'voyage-2' });
  const embedding = response.data?.[0]?.embedding;
  if (!embedding) throw new Error('No embedding returned for query');
  return embedding;
}

export async function embedChunks(
  chunks: DocumentChunk[],
): Promise<EmbeddedChunk[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY is not set in environment variables');

  const client = new VoyageAIClient({ apiKey });
  const results: EmbeddedChunk[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);
    const batchLabel = `batch ${batchNum}/${totalBatches}`;

    console.log(`  Embedding ${batchLabel} (${batch.length} chunks)...`);

    const embeddings = await embedBatchWithRetry(
      client,
      batch.map((c) => c.text),
      batchLabel,
    );

    for (let j = 0; j < batch.length; j++) {
      if (!embeddings[j]) {
        throw new Error(`Missing embedding for chunk ${i + j} ("${batch[j].metadata.filename}")`);
      }
      results.push({ chunk: batch[j], vector: embeddings[j] });
    }

    if (i + BATCH_SIZE < chunks.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}
