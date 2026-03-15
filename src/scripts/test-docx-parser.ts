import path from 'path';
import { fileURLToPath } from 'url';
import { parseDocx } from '../ingestion/docx-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLICIES_DIR = path.resolve(__dirname, '../../Policies');

const testFile = path.join(POLICIES_DIR, 'Remote Work & Hybrid Policy.docx');

console.log(`\n    Parsing: ${testFile}`);
console.log('─'.repeat(60));

const doc = await parseDocx(testFile);

console.log('METADATA:');
console.log(JSON.stringify(doc.metadata, null, 2));
console.log('─'.repeat(60));
console.log(`TEXT LENGTH: ${doc.text.length} characters`);
console.log('─'.repeat(60));
console.log('FIRST 500 CHARS:');
console.log(doc.text.slice(0, 500));
console.log('─'.repeat(60));
console.log('LAST 500 CHARS:');
console.log(doc.text.slice(-500));
console.log('─'.repeat(60));
