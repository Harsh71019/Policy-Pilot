import type { ParsedDocument } from '../types/documents.js';

export interface DocumentChunk {
  text: string;
  metadata: ParsedDocument['metadata'] & {
    chunkIndex: number;   // 0-based position of this chunk in the document
    totalChunks: number;  // total chunks from this document — useful for debugging
  };
}

interface ChunkOptions {
  chunkSize?: number;  // target character count per chunk (default 500)
  overlap?: number;    // characters to repeat from the previous chunk (default 50)
}

// Find the best split point at or before `pos`, in order of preference:
// 1. Sentence boundary (. ! ? followed by space or newline)
// 2. Word boundary (last space before pos)
// 3. Hard cut at pos (fallback — overlap handles continuity)
function snapToBoundary(text: string, pos: number): number {
  if (pos >= text.length) return text.length;

  // Search backwards from pos for a sentence-ending punctuation followed by whitespace.
  // We search within a 100-char window — no point walking the whole chunk.
  const searchFrom = Math.max(0, pos - 100);
  const window = text.slice(searchFrom, pos);
  const sentenceMatch = window.search(/[.!?][)\]"']?\s/g);

  if (sentenceMatch !== -1) {
    // +1 to include the punctuation character itself in the current chunk
    return searchFrom + sentenceMatch + 1;
  }

  // No sentence boundary — fall back to word boundary
  const lastSpace = text.lastIndexOf(' ', pos);
  if (lastSpace !== -1) return lastSpace;

  // No word boundary either — hard cut
  return pos;
}

export function chunkDocument(
  doc: ParsedDocument,
  options: ChunkOptions = {},
): DocumentChunk[] {
  const chunkSize = options.chunkSize ?? 500;
  const overlap = options.overlap ?? 50;
  const step = chunkSize - overlap; // how far we advance each iteration

  const text = doc.text;
  const chunks: DocumentChunk[] = [];
  let start = 0;

  while (start < text.length) {
    // Raw end position before snapping to sentence/word boundary
    const rawEnd = start + chunkSize;
    const end = snapToBoundary(text, rawEnd);

    const chunkText = text.slice(start, end).trim();

    // Skip empty or whitespace-only chunks (can happen at document end)
    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        metadata: {
          ...doc.metadata,
          chunkIndex: chunks.length,
          totalChunks: 0, // placeholder — filled in after we know the total
        },
      });
    }

    // Advance by step. If snap moved end backwards significantly, ensure we
    // still make forward progress to avoid an infinite loop.
    const nextStart = start + step;
    start = Math.max(nextStart, end - overlap);

    // If the remaining text is shorter than overlap, we're done — the last
    // chunk already captured it via the overlap.
    if (start >= text.length) break;
  }

  // Back-fill totalChunks now that we know the final count
  const total = chunks.length;
  for (const chunk of chunks) {
    chunk.metadata.totalChunks = total;
  }

  return chunks;
}
