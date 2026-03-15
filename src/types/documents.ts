// Shared document types used across the ingestion pipeline.
// All parsers return ParsedDocument — the chunker, embedder, and vector store
// all consume it. Keeping it here (not in a parser file) makes the ownership clear.

export interface ParsedDocument {
  text: string;
  metadata: {
    filename: string;
    source: string;
    category: string;
    department: string;
    accessLevel: string;
    effectiveDate: string;
    tags: string[];
    fileType: 'pdf' | 'docx';
  };
}
