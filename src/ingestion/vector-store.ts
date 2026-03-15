import { ChromaClient } from 'chromadb';
import type { EmbeddedChunk } from './embedder.js';

// ChromaDB collection name — all policy chunks live in one collection.
// We filter by metadata (department, fileType, etc.) at query time.
export const COLLECTION_NAME = 'policy_chunks';

// ChromaDB metadata must be flat — only string, number, or boolean.
// Arrays and nested objects are not allowed, so we serialize tags to a
// comma-separated string. We'll deserialize when reading results back.
function serializeMetadata(meta: EmbeddedChunk['chunk']['metadata']): Record<string, string | number | boolean> {
  return {
    filename: meta.filename,
    source: meta.source,
    category: meta.category,
    department: meta.department,
    accessLevel: meta.accessLevel,
    effectiveDate: meta.effectiveDate,
    tags: meta.tags.join(','),         // ["leave", "vacation"] → "leave,vacation"
    fileType: meta.fileType,
    chunkIndex: meta.chunkIndex,
    totalChunks: meta.totalChunks,
  };
}

function getClient(): ChromaClient {
  // ChromaDB JS SDK is HTTP-only — it connects to a running ChromaDB server.
  // Default: http://localhost:8000
  // Start the server with: chroma run --path ./chroma_data
  return new ChromaClient({ host: 'localhost', port: 8000 });
}

export async function getCollection() {
  const client = getClient();
  // No embeddingFunction specified — we always supply vectors directly to upsert()
  // and queryEmbeddings to query(). ChromaDB doesn't need to generate embeddings.
  return client.getOrCreateCollection({ name: COLLECTION_NAME });
}

export async function upsertChunks(embedded: EmbeddedChunk[]): Promise<void> {
  const collection = await getCollection();

  // Build stable, deterministic IDs from filename + chunkIndex.
  // Same chunk always gets the same ID → upsert overwrites cleanly on re-ingest.
  const ids = embedded.map(
    ({ chunk }) => `${chunk.metadata.filename}_chunk_${chunk.metadata.chunkIndex}`,
  );

  const embeddings = embedded.map(({ vector }) => vector);
  const documents = embedded.map(({ chunk }) => chunk.text);
  const metadatas = embedded.map(({ chunk }) => serializeMetadata(chunk.metadata));

  await collection.upsert({ ids, embeddings, documents, metadatas });

  console.log(`  ✓ Upserted ${embedded.length} chunks into "${COLLECTION_NAME}"`);
}

// Query the collection with a pre-computed embedding vector.
// Returns the top-k most similar chunks with their metadata and distances.
export async function queryCollection(
  queryVector: number[],
  topK: number = 5,
) {
  const collection = await getCollection();
  return collection.query({
    queryEmbeddings: [queryVector],
    nResults: topK,
    include: ['documents', 'metadatas', 'distances'],
  });
}
