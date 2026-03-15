import { readFile } from 'fs/promises';
import path from 'path';

export interface PolicyMetadata {
  filename: string;
  category: string;
  department: string;
  access_level: string;
  effective_date: string;
  tags: string[];
}

// Loads metadata.json from the policies directory.
// Exported so all parsers share one implementation — fix it once, fixes everywhere.
export async function loadPolicyMetadata(
  policiesDir: string,
): Promise<PolicyMetadata[]> {
  const metadataPath = path.join(policiesDir, 'metadata.json');
  const raw = await readFile(metadataPath, 'utf-8');
  return JSON.parse(raw) as PolicyMetadata[];
}
