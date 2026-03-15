import { embedQuery } from '../ingestion/embedder.js';
import { queryCollection } from '../ingestion/vector-store.js';
import type { QueryFilter } from '../ingestion/vector-store.js';

// What the retriever returns — one entry per matched chunk
export interface RetrievedChunk {
  text: string;
  score: number;      // cosine distance — lower is more similar (0 = identical)
  filename: string;
  department: string;
  chunkIndex: number;
  totalChunks: number;
  tags: string[];
}

export interface RetrieveOptions {
  topK?: number;
  scoreThreshold?: number;
  filter?: QueryFilter;   // optional metadata filter — narrows search to matching chunks
}

export async function retrieve(
  question: string,
  options: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const topK = options.topK ?? 5;
  const scoreThreshold = options.scoreThreshold ?? 0.65;

  // Embed the question with the same model used at ingest time
  const queryVector = await embedQuery(question);

  // Search ChromaDB for the nearest chunks, with optional metadata filter
  const results = await queryCollection(queryVector, topK, options.filter);

  const chunks: RetrievedChunk[] = [];

  for (let i = 0; i < (results.ids[0]?.length ?? 0); i++) {
    const distance = results.distances?.[0][i] ?? 1;
    const meta = results.metadatas?.[0][i];
    const text = results.documents?.[0][i];

    if (!text || !meta) continue;

    // Filter out low-quality matches — a high distance means weak semantic overlap
    if (distance > scoreThreshold) continue;

    chunks.push({
      text: String(text),
      score: distance,
      filename: String(meta.filename ?? ''),
      department: String(meta.department ?? ''),
      chunkIndex: Number(meta.chunkIndex ?? 0),
      totalChunks: Number(meta.totalChunks ?? 0),
      // tags were serialized as comma-separated string at ingest time — deserialize here
      tags: meta.tags ? String(meta.tags).split(',').filter(Boolean) : [],
    });
  }

  return chunks;
}

// Format retrieved chunks into a single context string for Claude.
// Each chunk is clearly delimited with its source so Claude can cite it.
export function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return 'No relevant policy information found.';
  }

  return chunks
    .map(
      (chunk, i) =>
        `[Source ${i + 1}: ${chunk.filename}, chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks}]\n${chunk.text}`,
    )
    .join('\n\n---\n\n');
}
