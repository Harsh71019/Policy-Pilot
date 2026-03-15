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

// Find the nearest word boundary at or before `pos` so we never split mid-word.
// Example: "...employee benefits are" split at 22 → snaps back to 20 (before "are")
function snapToWordBoundary(text: string, pos: number): number {
  if (pos >= text.length) return text.length;
  // If we're already at a space or the char before is a space, we're clean
  if (text[pos] === ' ' || text[pos - 1] === ' ') return pos;
  // Walk back to find the last space before pos
  const lastSpace = text.lastIndexOf(' ', pos);
  return lastSpace === -1 ? pos : lastSpace;
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
    // Raw end position before snapping to word boundary
    const rawEnd = start + chunkSize;
    // Snap end to nearest word boundary so we don't cut a word in half
    const end = snapToWordBoundary(text, rawEnd);

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
