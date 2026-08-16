/**
 * Copies the pdf.js worker bundle into /public so the in-app PDF viewer can
 * load it from a same-origin URL (no CDN, per our CSP).
 */
import { copyFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const candidates = [
  'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  'node_modules/pdfjs-dist/build/pdf.worker.mjs',
  'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const target = join(root, 'public', 'pdf.worker.min.mjs');
await mkdir(dirname(target), { recursive: true });

for (const candidate of candidates) {
  const source = join(root, candidate);
  if (await exists(source)) {
    await copyFile(source, target);
    console.log(`[pdf-worker] copied ${candidate} -> public/pdf.worker.min.mjs`);
    process.exit(0);
  }
}

console.warn('[pdf-worker] pdfjs-dist worker not found — run npm install first.');
