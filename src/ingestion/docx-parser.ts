import mammoth from 'mammoth';
import { readFile } from 'fs/promises';
import path from 'path';
import type { ParsedDocument } from '../types/documents.js';
import { loadPolicyMetadata } from './metadata-loader.js';

export async function parseDocx(filePath: string): Promise<ParsedDocument> {
  const buffer = await readFile(filePath);

  const result = await mammoth.extractRawText({ buffer });

  const cleanText = result.value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (result.messages.length > 0) {
    console.warn(`⚠️  mammoth warnings for "${path.basename(filePath)}":`);
    for (const msg of result.messages) {
      console.warn(`   [${msg.type}] ${msg.message}`);
    }
  }

  const filename = path.basename(filePath);
  const policiesDir = path.dirname(filePath);
  const allMetadata = await loadPolicyMetadata(policiesDir);
  const meta = allMetadata.find((m) => m.filename === filename);

  if (!meta) {
    console.warn(
      `⚠️  No metadata found for "${filename}" — using fallback values`,
    );
  }

  return {
    text: cleanText,
    metadata: {
      filename,
      source: filePath,
      category: meta?.category ?? 'Unknown',
      department: meta?.department ?? 'Unknown',
      accessLevel: meta?.access_level ?? 'Internal',
      effectiveDate: meta?.effective_date ?? '',
      tags: meta?.tags ?? [],
      fileType: 'docx',
    },
  };
}
