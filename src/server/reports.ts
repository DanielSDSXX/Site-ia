import { AnalysisType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { formatCurrencyCents, formatDate } from '@/lib/utils';
import { isDemoAI } from '@/lib/env';
import { getLatestAnalyses, getProcessDetail, RISK_LABELS, STATUS_LABELS } from './processes';

/**
 * Geração de relatórios em PDF e DOCX.
 *
 * O conteúdo vem exclusivamente do que já está no banco: análises concluídas,
 * achados e citações. Não há chamada de IA aqui — um relatório é uma
 * apresentação do que já foi analisado, não uma nova análise.
 */

export type ReportType = 'executive' | 'client' | 'internal' | 'risk' | 'full';
export type ReportFormat = 'pdf' | 'docx';

export const REPORT_LABELS: Record<ReportType, string> = {
  executive: 'Relatório executivo',
  client: 'Relatório para o cliente',
  internal: 'Relatório interno',
  risk: 'Relatório de risco',
  full: 'Relatório completo',
};

interface Section {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

interface ReportContent {
  title: string;
  subtitle: string;
  sections: Section[];
  footer: string[];
}

const DISCLAIMER =
  'Este relatório foi gerado automaticamente pelo LegalMind AI a partir dos documentos enviados à plataforma. ' +
  'As análises são de natureza estratégica e probabilística, não constituem parecer jurídico e não substituem ' +
  'a avaliação profissional do advogado responsável. Nenhuma afirmação aqui deve ser lida como previsão de ' +
  'resultado judicial.';

export async function buildReportContent(
  organizationId: string,
  processId: string,
  type: ReportType,
): Promise<ReportContent> {
  const process = await getProcessDetail(organizationId, processId);
  const analyses = await getLatestAnalyses(organizationId, processId);

  const findings = await prisma.finding.findMany({
    where: { organizationId, processId },
    orderBy: [{ severity: 'desc' }, { position: 'asc' }],
    include: {
      citations: { select: { pageNumber: true, document: { select: { title: true } } } },
    },
  });

  const summary = analyses.get(AnalysisType.PROCESS_SUMMARY)?.result as
    | { executiveSummary?: string; currentSituation?: string; probableNextStep?: string; riskRationale?: string }
    | undefined;

  const clientExplanation = analyses.get(AnalysisType.CLIENT_EXPLANATION)?.result as
    | { text?: string; glossary?: { term: string; meaning: string }[] }
    | undefined;

  const sections: Section[] = [];

  const identification: Section = {
    heading: 'Identificação',
    paragraphs: [],
    bullets: [
      `Processo: ${process.number}`,
      `Tribunal: ${process.court ?? 'não informado'}`,
      `Vara: ${process.courtUnit ?? 'não informada'}`,
      `Classe: ${process.procedureClass ?? 'não informada'}`,
      `Assunto: ${process.subject ?? 'não informado'}`,
      `Cliente: ${process.client?.name ?? 'não vinculado'}`,
      `Situação: ${STATUS_LABELS[process.status] ?? process.status}`,
      `Valor da causa: ${formatCurrencyCents(process.caseValueCents)}`,
      `Partes: ${process.parties.map((p) => `${p.name} (${p.role})`).join('; ') || 'não cadastradas'}`,
    ],
  };

  if (type === 'client') {
    sections.push({
      heading: 'Sobre o seu processo',
      paragraphs: clientExplanation?.text
        ? clientExplanation.text.split('\n').filter(Boolean)
        : [
            'A explicação em linguagem simples ainda não foi gerada para este processo. ' +
              'Execute a análise "Explicar para o cliente" na tela do processo.',
          ],
    });
    if (clientExplanation?.glossary?.length) {
      sections.push({
        heading: 'Glossário',
        paragraphs: [],
        bullets: clientExplanation.glossary.map((g) => `${g.term}: ${g.meaning}`),
      });
    }
    sections.push(identification);
  } else {
    sections.push(identification);

    sections.push({
      heading: 'Resumo executivo',
      paragraphs: summary?.executiveSummary
        ? [summary.executiveSummary]
        : ['O resumo executivo ainda não foi gerado. Execute a análise do processo na plataforma.'],
    });

    sections.push({
      heading: 'Situação atual e próximo passo esperado',
      paragraphs: [
        summary?.currentSituation ?? 'Não disponível.',
        summary?.probableNextStep ?? 'Não disponível.',
      ],
    });

    sections.push({
      heading: 'Avaliação de risco',
      paragraphs: [
        `Nível: ${RISK_LABELS[process.riskLevel]}${
          process.riskScore !== null ? ` (índice ${process.riskScore}/100)` : ''
        }`,
        process.riskRationale ?? summary?.riskRationale ?? 'Fundamentação não disponível.',
      ],
    });
  }

  if (type === 'risk' || type === 'full' || type === 'internal') {
    const vulnerabilities = findings.filter((f) => f.type === 'VULNERABILITY' || f.type === 'EVIDENCE_GAP');
    sections.push({
      heading: 'Vulnerabilidades identificadas',
      paragraphs: vulnerabilities.length === 0 ? ['Nenhuma vulnerabilidade registrada.'] : [],
      bullets: vulnerabilities.map(
        (f) =>
          `[${f.severity}] ${f.title} — ${f.description}${
            f.suggestion ? ` Sugestão: ${f.suggestion}` : ''
          }${formatCitations(f.citations)}`,
      ),
    });

    const contradictions = findings.filter((f) => f.type === 'CONTRADICTION');
    if (contradictions.length > 0) {
      sections.push({
        heading: 'Contradições detectadas',
        paragraphs: [],
        bullets: contradictions.map((f) => `${f.title} — ${f.description}${formatCitations(f.citations)}`),
      });
    }
  }

  if (type === 'full' || type === 'internal') {
    const adversarial = findings.filter((f) => f.type === 'ADVERSARIAL_ARGUMENT');
    if (adversarial.length > 0) {
      sections.push({
        heading: 'Perspectiva da parte contrária',
        paragraphs: [],
        bullets: adversarial.map((f) => `${f.title} — ${f.description}${formatCitations(f.citations)}`),
      });
    }

    const actions = findings.filter((f) => f.type === 'STRATEGIC_ACTION');
    if (actions.length > 0) {
      sections.push({
        heading: 'Próximas ações sugeridas',
        paragraphs: [],
        bullets: actions.map((f) => `[${f.severity}] ${f.title} — ${f.description}`),
      });
    }
  }

  if (type === 'full') {
    sections.push({
      heading: 'Linha do tempo',
      paragraphs: process.timeline.length === 0 ? ['Nenhum evento registrado.'] : [],
      bullets: process.timeline.map(
        (event) => `${formatDate(event.occurredAt)} — ${event.type}: ${event.title}`,
      ),
    });

    sections.push({
      heading: 'Documentos analisados',
      paragraphs: [],
      bullets: process.documents.map(
        (doc) => `${doc.title} (${doc.kind}, ${doc.pageCount} página(s), ${doc.status})`,
      ),
    });
  }

  if (type === 'internal' || type === 'full') {
    const deadlines = process.deadlines.filter((d) => d.status === 'OPEN');
    sections.push({
      heading: 'Prazos em aberto',
      paragraphs: deadlines.length === 0 ? ['Nenhum prazo em aberto cadastrado.'] : [],
      bullets: deadlines.map(
        (d) => `${formatDate(d.dueDate)} — ${d.title}${d.computed ? ' (data calculada automaticamente)' : ''}`,
      ),
    });
  }

  const footer = [DISCLAIMER];
  if (isDemoAI()) {
    footer.unshift(
      'ATENÇÃO — MODO DEMONSTRAÇÃO: nenhum modelo de linguagem estava conectado quando estas análises ' +
        'foram produzidas. Os resultados vieram de verificação estrutural determinística dos documentos ' +
        '(extração de datas e valores, detecção de alegações sem lastro, comparação entre peças) e têm ' +
        'alcance limitado.',
    );
  }

  return {
    title: REPORT_LABELS[type],
    subtitle: `Processo ${process.number}${process.client ? ` — ${process.client.name}` : ''}`,
    sections,
    footer,
  };
}

function formatCitations(citations: { pageNumber: number | null; document: { title: string } | null }[]): string {
  if (citations.length === 0) return '';
  const refs = citations
    .slice(0, 3)
    .map((c) => `${c.document?.title ?? 'documento'}, p. ${c.pageNumber ?? '?'}`)
    .join('; ');
  return ` [Fonte: ${refs}]`;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export async function renderPdf(content: ReportContent): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${content.title} — ${content.subtitle}`);
  pdf.setCreator('LegalMind AI');

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 56;
  const maxWidth = pageWidth - margin * 2;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - margin;

  const ink = rgb(0.11, 0.12, 0.16);
  const muted = rgb(0.42, 0.44, 0.5);
  const accent = rgb(0.31, 0.33, 0.85);

  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    cursorY = pageHeight - margin;
  };

  const write = (
    text: string,
    opts: { size?: number; font?: typeof regular; color?: typeof ink; gap?: number; indent?: number } = {},
  ) => {
    const size = opts.size ?? 10.5;
    const font = opts.font ?? regular;
    const color = opts.color ?? ink;
    const indent = opts.indent ?? 0;
    const lines = wrapText(sanitizeForPdf(text), font, size, maxWidth - indent);

    for (const line of lines) {
      if (cursorY < margin + 40) newPage();
      page.drawText(line, { x: margin + indent, y: cursorY, size, font, color });
      cursorY -= size * 1.45;
    }
    cursorY -= opts.gap ?? 4;
  };

  write(content.title, { size: 20, font: bold, gap: 2 });
  write(content.subtitle, { size: 11, color: muted, gap: 6 });
  write(`Gerado em ${new Date().toLocaleString('pt-BR')}`, { size: 9, color: muted, gap: 16 });

  for (const section of content.sections) {
    if (cursorY < margin + 90) newPage();
    write(section.heading.toUpperCase(), { size: 11, font: bold, color: accent, gap: 6 });

    for (const paragraph of section.paragraphs) {
      write(paragraph, { gap: 8 });
    }
    for (const bullet of section.bullets ?? []) {
      write(`•  ${bullet}`, { indent: 8, gap: 5 });
    }
    cursorY -= 8;
  }

  cursorY -= 10;
  for (const line of content.footer) {
    write(line, { size: 8.5, color: muted, gap: 6 });
  }

  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawText(`LegalMind AI  ·  ${index + 1}/${pages.length}`, {
      x: margin,
      y: 28,
      size: 8,
      font: regular,
      color: muted,
    });
  });

  return Buffer.from(await pdf.save());
}

/** As fontes padrão do PDF usam WinAnsi; removemos o que não é representável. */
function sanitizeForPdf(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[^ -ÿ]/g, '');
}

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split('\n')) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

export async function renderDocx(content: ReportContent): Promise<Buffer> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx');

  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ text: content.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: content.subtitle, italics: true })] }),
    new Paragraph({
      children: [new TextRun({ text: `Gerado em ${new Date().toLocaleString('pt-BR')}`, size: 18, color: '6B7280' })],
    }),
    new Paragraph({ text: '' }),
  ];

  for (const section of content.sections) {
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_2 }));
    for (const paragraph of section.paragraphs) {
      children.push(new Paragraph({ text: paragraph }));
    }
    for (const bullet of section.bullets ?? []) {
      children.push(new Paragraph({ text: bullet, bullet: { level: 0 } }));
    }
    children.push(new Paragraph({ text: '' }));
  }

  for (const line of content.footer) {
    children.push(new Paragraph({ children: [new TextRun({ text: line, size: 16, color: '6B7280' })] }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

export async function generateReport(
  organizationId: string,
  processId: string,
  type: ReportType,
  format: ReportFormat,
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const process = await prisma.process.findFirst({
    where: { id: processId, organizationId, deletedAt: null },
    select: { number: true },
  });
  if (!process) throw new NotFoundError('Processo não encontrado.');

  const content = await buildReportContent(organizationId, processId, type);
  const slug = process.number.replace(/\D/g, '') || processId;

  if (format === 'docx') {
    return {
      buffer: await renderDocx(content),
      filename: `legalmind-${type}-${slug}.docx`,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  return {
    buffer: await renderPdf(content),
    filename: `legalmind-${type}-${slug}.pdf`,
    contentType: 'application/pdf',
  };
}
