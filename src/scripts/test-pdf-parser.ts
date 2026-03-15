import { parsePdf } from '../ingestion/pdf-parser.js';
import path from 'path';

const filePath = path.resolve('Policies/Employee Leave Policy.pdf');

console.log('Parsing:', filePath);
console.log('─'.repeat(60));

const doc = await parsePdf(filePath);

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
