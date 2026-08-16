import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { env } from '@/lib/env';
import { logError } from '@/lib/errors';

const exec = promisify(execFile);

/**
 * OCR de páginas digitalizadas.
 *
 * Implementação via binários do sistema (`pdftoppm` + `tesseract`) em vez de
 * uma biblioteca WASM: o processamento roda no worker, fora do request, e o
 * tesseract nativo é significativamente mais rápido em documentos longos.
 *
 * Se OCR_PROVIDER=none (padrão), as páginas sem camada de texto ficam
 * marcadas como `needsOcr` e a interface diz isso ao usuário. Preferimos uma
 * lacuna declarada a um texto silenciosamente ausente.
 */

export interface OcrPageResult {
  pageNumber: number;
  text: string;
}

export function isOcrEnabled(): boolean {
  return env().OCR_PROVIDER === 'tesseract';
}

export async function ocrAvailable(): Promise<{ available: boolean; reason?: string }> {
  if (!isOcrEnabled()) return { available: false, reason: 'OCR_PROVIDER=none' };
  try {
    await exec('tesseract', ['--version']);
  } catch {
    return { available: false, reason: 'binário `tesseract` não encontrado no PATH' };
  }
  try {
    await exec('pdftoppm', ['-v']);
  } catch {
    return { available: false, reason: 'binário `pdftoppm` (poppler-utils) não encontrado no PATH' };
  }
  return { available: true };
}

/**
 * Roda OCR nas páginas indicadas de um PDF.
 * Retorna apenas as páginas em que algum texto foi efetivamente reconhecido.
 */
export async function ocrPdfPages(pdf: Buffer, pageNumbers: number[]): Promise<OcrPageResult[]> {
  const status = await ocrAvailable();
  if (!status.available) return [];

  const limit = env().OCR_MAX_PAGES;
  const targets = pageNumbers.slice(0, limit);
  if (targets.length === 0) return [];

  const dir = await mkdtemp(join(tmpdir(), 'legalmind-ocr-'));
  const pdfPath = join(dir, 'input.pdf');
  const results: OcrPageResult[] = [];

  try {
    await writeFile(pdfPath, pdf);

    for (const pageNumber of targets) {
      try {
        const imagePrefix = join(dir, `page-${pageNumber}`);
        await exec('pdftoppm', [
          '-f', String(pageNumber),
          '-l', String(pageNumber),
          '-r', '300',
          '-png',
          '-singlefile',
          pdfPath,
          imagePrefix,
        ]);

        const outPrefix = join(dir, `ocr-${pageNumber}`);
        await exec('tesseract', [`${imagePrefix}.png`, outPrefix, '-l', env().OCR_LANG, '--psm', '1']);

        const text = await readFile(`${outPrefix}.txt`, 'utf8');
        if (text.trim().length > 0) {
          results.push({ pageNumber, text: text.replace(/\n{3,}/g, '\n\n').trim() });
        }
      } catch (err) {
        logError('ocr.page', err, { pageNumber });
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }

  return results;
}

/** OCR de uma imagem isolada (PNG/JPEG enviado diretamente). */
export async function ocrImage(image: Buffer, extension = 'png'): Promise<string> {
  const status = await ocrAvailable();
  if (!status.available) return '';

  const dir = await mkdtemp(join(tmpdir(), 'legalmind-ocr-'));
  try {
    const imagePath = join(dir, `input.${extension}`);
    const outPrefix = join(dir, 'out');
    await writeFile(imagePath, image);
    await exec('tesseract', [imagePath, outPrefix, '-l', env().OCR_LANG, '--psm', '1']);
    return (await readFile(`${outPrefix}.txt`, 'utf8')).trim();
  } catch (err) {
    logError('ocr.image', err);
    return '';
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
