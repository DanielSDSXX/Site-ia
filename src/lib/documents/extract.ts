import { AppError } from '@/lib/errors';

/**
 * Extração de texto preservando a relação DOCUMENTO -> PÁGINA.
 *
 * Manter o número da página é requisito de produto: sem ele a IA não pode
 * dizer "isto está na página 37", e uma afirmação sem página não pode ser
 * verificada pelo advogado.
 */

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  /** true quando a página não tem camada de texto (provável digitalização). */
  needsOcr: boolean;
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  method: 'NATIVE_TEXT' | 'PLAIN_TEXT' | 'DOCX' | 'NONE';
  metadata: Record<string, unknown>;
}

/** Abaixo disto consideramos a página "sem texto útil". */
const MIN_CHARS_PER_PAGE = 25;

export async function extractDocument(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractionResult> {
  if (mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
    return extractPdf(buffer);
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    filename.toLowerCase().endsWith('.docx')
  ) {
    return extractDocx(buffer);
  }
  if (mimeType.startsWith('text/') || filename.toLowerCase().endsWith('.txt')) {
    return extractPlainText(buffer);
  }
  if (mimeType.startsWith('image/')) {
    // Imagens só produzem texto via OCR; aqui apenas registramos a página.
    return {
      pages: [{ pageNumber: 1, text: '', needsOcr: true }],
      method: 'NONE',
      metadata: { imageOnly: true },
    };
  }

  throw new AppError(`Tipo de arquivo não suportado: ${mimeType}`, {
    status: 415,
    code: 'unsupported_media_type',
    expose: true,
  });
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const pdfjs = await loadPdfJs();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // Endurecimento: um PDF é conteúdo não confiável.
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  });

  const doc = await loadingTask.promise;
  const pages: ExtractedPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = joinTextItems(content.items as PdfTextItem[]);
      pages.push({
        pageNumber,
        text,
        needsOcr: text.trim().length < MIN_CHARS_PER_PAGE,
      });
      page.cleanup();
    }

    const info = await doc.getMetadata().catch(() => null);
    return {
      pages,
      method: 'NATIVE_TEXT',
      metadata: {
        pdfVersion: (info?.info as Record<string, unknown> | undefined)?.PDFFormatVersion ?? null,
        title: (info?.info as Record<string, unknown> | undefined)?.Title ?? null,
        author: (info?.info as Record<string, unknown> | undefined)?.Author ?? null,
        creationDate: (info?.info as Record<string, unknown> | undefined)?.CreationDate ?? null,
        pageCount: doc.numPages,
      },
    };
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];
}

/**
 * Reconstrói o texto da página a partir dos fragmentos posicionados do PDF.
 * Usa a coordenada Y para detectar troca de linha, porque `hasEOL` sozinho
 * não é confiável em PDFs gerados por sistemas de tribunais.
 */
function joinTextItems(items: PdfTextItem[]): string {
  let out = '';
  let lastY: number | null = null;
  let pendingNewline = false;

  for (const item of items) {
    const str = item.str ?? '';
    const y = item.transform?.[5] ?? null;

    // Troca de linha detectada pela coordenada Y — `hasEOL` sozinho não é
    // confiável em PDFs de tribunais. As duas fontes são combinadas num único
    // sinal para não emitir duas quebras pela mesma troca de linha, o que
    // transformaria cada linha visual num parágrafo e destruiria a
    // segmentação de frases mais adiante.
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) pendingNewline = true;

    if (str) {
      if (pendingNewline) {
        out += '\n';
        pendingNewline = false;
      } else if (out && !out.endsWith(' ') && !out.endsWith('\n') && !str.startsWith(' ')) {
        out += ' ';
      }
      out += str;
    }

    if (item.hasEOL) pendingNewline = true;
    if (y !== null) lastY = y;
  }

  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const mod = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as PdfJsModule;

      // Em Node não existe Web Worker. O pdf.js carrega então um "fake worker"
      // na própria thread, mas exige que workerSrc aponte para um módulo
      // importável — daí resolvermos o caminho real do pacote.
      const { createRequire } = await import('node:module');
      const { pathToFileURL } = await import('node:url');
      const require = createRequire(import.meta.url);
      mod.GlobalWorkerOptions.workerSrc = pathToFileURL(
        require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
      ).href;

      return mod;
    })();
  }
  return pdfjsPromise;
}

// ---------------------------------------------------------------------------
// DOCX / texto
// ---------------------------------------------------------------------------

/**
 * DOCX não tem paginação estável fora do Word. Em vez de inventar números de
 * página, paginamos por volume de caracteres e registramos isso nos metadados
 * — a citação diz "página 3 (paginação estimada)" em vez de fingir precisão.
 */
const DOCX_CHARS_PER_PAGE = 2800;

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.replace(/\n{3,}/g, '\n\n').trim();
  return {
    pages: paginateText(text, DOCX_CHARS_PER_PAGE),
    method: 'DOCX',
    metadata: { paginationEstimated: true, warnings: result.messages.slice(0, 10) },
  };
}

async function extractPlainText(buffer: Buffer): Promise<ExtractionResult> {
  const text = buffer.toString('utf8').replace(/\r\n/g, '\n').trim();
  return {
    pages: paginateText(text, 3000),
    method: 'PLAIN_TEXT',
    metadata: { paginationEstimated: true },
  };
}

/** Divide texto corrido em "páginas" quebrando em parágrafos. */
export function paginateText(text: string, charsPerPage: number): ExtractedPage[] {
  if (!text) return [{ pageNumber: 1, text: '', needsOcr: false }];

  const paragraphs = text.split(/\n{2,}/);
  const pages: ExtractedPage[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length > charsPerPage) {
      pages.push({ pageNumber: pages.length + 1, text: current.trim(), needsOcr: false });
      current = '';
    }
    current += (current ? '\n\n' : '') + paragraph;
  }
  if (current.trim()) {
    pages.push({ pageNumber: pages.length + 1, text: current.trim(), needsOcr: false });
  }

  return pages.length > 0 ? pages : [{ pageNumber: 1, text: '', needsOcr: false }];
}
