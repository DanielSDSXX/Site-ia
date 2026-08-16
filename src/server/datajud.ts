import { PartySide, ProcessStatus, Severity } from '@prisma/client';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import {
  datajudStatus,
  indexFromCaseNumber,
  searchDatajudProcesses,
  toCnjDigits,
  type DatajudProcess,
  type DatajudSituationCode,
} from '@/lib/integrations/datajud';

/**
 * Consulta processual oficial (CNJ DataJud).
 *
 * Este é o módulo que implementa as "movimentações" que o produto declarava
 * como integração futura. O que ele NÃO faz: alimentar o acervo de
 * jurisprudência. O DataJud entrega andamentos, não ementas — tratar um
 * andamento como precedente seria exatamente o tipo de coisa que a plataforma
 * se recusa a fazer.
 */

/** Partes do processo, vindas do cadastro do escritório (não do CNJ). */
export interface LocalParty {
  name: string;
  role: string;
  side: PartySide;
  lawyerName: string | null;
}

/** O processo do escritório que corresponde ao número consultado. */
export interface LocalMatch {
  id: string;
  number: string;
  status: ProcessStatus;
  parties: LocalParty[];
}

export interface DatajudProcessView extends DatajudProcess {
  /**
   * Cadastro interno correspondente, quando o número bate. É a ÚNICA fonte de
   * nome de parte nesta tela: a API Pública do CNJ não publica esse dado.
   */
  local: LocalMatch | null;
}

export interface DatajudConsultResult {
  enabled: boolean;
  configurationHint: string | null;
  query: string;
  index: string;
  total: number;
  processes: DatajudProcessView[];
  error: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  PLAINTIFF: 'Autor',
  DEFENDANT: 'Réu',
  THIRD_PARTY: 'Terceiro interessado',
  PROSECUTOR: 'Ministério Público',
  JUDGE: 'Juiz',
  LAWYER: 'Advogado',
  EXPERT: 'Perito',
  WITNESS: 'Testemunha',
  OTHER: 'Outro',
};

export async function consultDatajud(
  organizationId: string,
  query: string,
  options: { court?: string; limit?: number } = {},
): Promise<DatajudConsultResult> {
  const trimmed = query.trim();
  const digits = toCnjDigits(trimmed);

  if (trimmed.length < 3 && !digits) {
    throw new ValidationError(
      'Informe o número CNJ do processo (20 dígitos) ou ao menos 3 caracteres de busca.',
    );
  }

  /*
    Quando o usuário informa o número completo e não escolheu tribunal, o
    próprio número diz onde procurar: os dígitos J e TR identificam o segmento
    e o tribunal. Sem isso, a consulta cairia no índice padrão e devolveria
    "não encontrado" por motivo errado.
  */
  const court = options.court || (digits ? (indexFromCaseNumber(digits) ?? undefined) : undefined);

  const status = datajudStatus();
  const result = await searchDatajudProcesses(trimmed, { limit: options.limit ?? 10, court });

  return {
    enabled: status.enabled,
    configurationHint: status.enabled
      ? null
      : 'Defina DATAJUD_ENABLED=true e DATAJUD_API_KEY no .env. A chave pública é publicada pelo CNJ na wiki do DataJud.',
    query: trimmed,
    index: result.index,
    total: result.total,
    processes: await attachLocalMatches(organizationId, result.processes),
    error: result.error,
  };
}

/**
 * Casa cada processo do CNJ com o cadastro do escritório pelo número.
 *
 * Só olhamos processos da própria organização — o isolamento entre escritórios
 * vale aqui como em todo o resto.
 */
async function attachLocalMatches(
  organizationId: string,
  processes: DatajudProcess[],
): Promise<DatajudProcessView[]> {
  const wanted = processes
    .map((process) => process.caseNumberDigits)
    .filter((value): value is string => Boolean(value));

  if (wanted.length === 0) {
    return processes.map((process) => ({ ...process, local: null }));
  }

  const candidates = await prisma.process.findMany({
    where: { organizationId, deletedAt: null },
    select: {
      id: true,
      number: true,
      status: true,
      parties: {
        select: { name: true, role: true, side: true, lawyerName: true },
        orderBy: { name: 'asc' },
      },
    },
  });

  const byDigits = new Map<string, LocalMatch>();
  for (const candidate of candidates) {
    const key = candidate.number.replace(/\D/g, '');
    if (!key || byDigits.has(key)) continue;
    byDigits.set(key, {
      id: candidate.id,
      number: candidate.number,
      status: candidate.status,
      parties: candidate.parties.map((party) => ({
        name: party.name,
        role: ROLE_LABEL[party.role] ?? 'Parte',
        side: party.side,
        lawyerName: party.lawyerName,
      })),
    });
  }

  return processes.map((process) => ({
    ...process,
    local: process.caseNumberDigits ? (byDigits.get(process.caseNumberDigits) ?? null) : null,
  }));
}

/**
 * Importa as movimentações de um processo do DataJud para a linha do tempo.
 *
 * Regras:
 *  - só grava movimentos com data (sem data não há linha do tempo);
 *  - não duplica: um movimento já presente na mesma data e com o mesmo título
 *    é ignorado numa reimportação;
 *  - os eventos entram como `isInferred = false`, porque não são dedução da
 *    análise e sim registro oficial do tribunal.
 */
export async function importDatajudMovements(
  organizationId: string,
  processId: string,
  datajudProcess: DatajudProcess,
): Promise<{ imported: number; skipped: number; statusChanged: ProcessStatus | null }> {
  const process = await prisma.process.findFirst({
    where: { id: processId, organizationId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!process) throw new NotFoundError('Processo não encontrado.');

  const existing = await prisma.timelineEvent.findMany({
    where: { processId },
    select: { occurredAt: true, title: true },
  });
  const seen = new Set(
    existing.map((event) => `${event.occurredAt.toISOString().slice(0, 10)}|${event.title}`),
  );

  let imported = 0;
  let skipped = 0;

  for (const movement of datajudProcess.movements) {
    if (!movement.occurredAt) {
      skipped++;
      continue;
    }

    const title = movement.name.slice(0, 200);
    const key = `${movement.occurredAt.toISOString().slice(0, 10)}|${title}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);

    await prisma.timelineEvent.create({
      data: {
        organizationId,
        processId,
        occurredAt: movement.occurredAt,
        type: 'Movimentação',
        title,
        description: [
          `Registro oficial do CNJ DataJud (${datajudProcess.index}).`,
          movement.code ? `Código CNJ do movimento: ${movement.code}.` : null,
          movement.complements.length > 0
            ? `Complementos: ${movement.complements.join('; ')}.`
            : null,
          movement.judgingBody ? `Órgão: ${movement.judgingBody}.` : null,
        ]
          .filter(Boolean)
          .join(' '),
        importance: importanceOf(movement.name),
        isInferred: false,
      },
    });
    imported++;
  }

  let statusChanged: ProcessStatus | null = null;

  if (imported > 0) {
    const latest = datajudProcess.movements
      .map((movement) => movement.occurredAt)
      .filter((date): date is Date => date !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    /*
      A situação lida das movimentações só sobrescreve o cadastro quando é
      conclusiva (houve um arquivamento, uma suspensão, um desarquivamento).
      "Em curso" por ausência de sinal não mexe no que o escritório anotou.
    */
    const mapped = statusFromSituation(datajudProcess.situation.code);
    if (mapped && mapped !== process.status) statusChanged = mapped;

    await prisma.process.update({
      where: { id: processId },
      data: {
        lastMovementAt: latest ?? undefined,
        ...(statusChanged ? { status: statusChanged } : {}),
        ...(datajudProcess.procedureClass ? { procedureClass: datajudProcess.procedureClass } : {}),
        ...(datajudProcess.judgingBody ? { courtUnit: datajudProcess.judgingBody } : {}),
        ...(datajudProcess.subjects.length > 0
          ? { subject: datajudProcess.subjects.join(', ') }
          : {}),
      },
    });
  }

  return { imported, skipped, statusChanged };
}

/** Só as situações conclusivas viram status do processo no cadastro. */
function statusFromSituation(code: DatajudSituationCode): ProcessStatus | null {
  switch (code) {
    case 'ARQUIVADO':
      return ProcessStatus.ARCHIVED;
    case 'BAIXADO':
      return ProcessStatus.CLOSED;
    case 'SUSPENSO':
      return ProcessStatus.SUSPENDED;
    default:
      return null;
  }
}

/** Movimentos que mudam o rumo do processo pesam mais na linha do tempo. */
function importanceOf(name: string): Severity {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // "tutela" entra junto de "liminar": concedida ou negada, muda o que o
  // escritório precisa fazer hoje.
  const high = [
    'sentenca',
    'julgamento',
    'acordao',
    'decisao',
    'liminar',
    'tutela',
    'transito em julgado',
    'baixa',
  ];
  const low = ['juntada', 'expedicao', 'publicacao', 'conclusao', 'remessa', 'recebimento'];

  if (high.some((term) => normalized.includes(term))) return Severity.HIGH;
  if (low.some((term) => normalized.includes(term))) return Severity.LOW;
  return Severity.MEDIUM;
}
