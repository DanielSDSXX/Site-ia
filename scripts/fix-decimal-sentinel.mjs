import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/lib/text/nlp.ts';
const before = readFileSync(path, 'utf8');
const from = ".replace(/(\\d)\\.(\\d)/g, '$1$2');";
const to = ".replace(/(\\d)\\.(\\d)/g, '$1\\u0001$2');";
if (!before.includes(from)) {
  console.error('pattern not found');
  process.exit(1);
}
writeFileSync(path, before.replace(from, to));
console.log('ok');
