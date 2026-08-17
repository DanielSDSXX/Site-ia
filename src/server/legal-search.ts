import { consultDatajud, type DatajudProcessView } from '@/server/datajud';
import { searchJurisprudence, type JurisprudenceHit } from '@/server/jurisprudence';
import { toCnjDigits } from '@/lib/integrations/datajud';

/**
 * Busca jurídica unificada.
 *
 * Uma caixa só: o usuário digita o número do processo OU uma palavra-chave, e
 * a plataforma procura nas duas fontes ao mesmo tempo.
 *
 *  - PROCESSOS vêm da API Pública do CNJ (DataJud): dados oficiais e
 *    movimentações. É o que responde "o que está acontecendo neste processo".
 *  - ENTENDIMENTOS vêm do acervo de ementas do escritório, com busca semântica
 *    + BM25. É o que responde "o que já se decidiu sobre este tema".
 *
 * As duas continuam identificadas por origem no resultado, e não misturadas na
 * mesma lista: um andamento processual não é precedente, e apresentar os dois
 * como a mesma coisa levaria o advogado a citar um pelo outro. Mas a BUSCA é
 * uma só — quem pesquisa não deveria precisar saber de qual base o dado vem.
 *
 * Uma fonte que falha não derruba a outra: cada uma volta com o seu próprio
 * erro, e o que deu certo aparece.
 */

export interface LegalSearchResult {
  query: string;
  /** true quando a busca foi por número CNJ de 20 dígitos. */
  byCaseNumber: boolean;

  processes: DatajudProcessView[];
  processesTotal: number;
  processesError: string | null;
  /** Índice do CNJ efetivamente consultado. */
  index: string;
  datajudEnabled: boolean;

  entendimentos: JurisprudenceHit[];
  entendimentosError: string | null;
}

export async function searchLegal(
  organizationId: string,
  query: string,
  options: { court?: string; limit?: number; includeDemo?: boolean } = {},
): Promise<LegalSearchResult> {
  const q = query.trim();
  const limit = options.limit ?? 10;
  const digits = toCnjDigits(q);

  // As duas fontes são independentes: consultamos em paralelo e cada uma
  // responde por si. `allSettled` porque o DataJud fora do ar não pode
  // esconder um entendimento que está no acervo.
  const [processesOutcome, entendimentosOutcome] = await Promise.allSettled([
    consultDatajud(organizationId, q, { court: options.court, limit }),
    searchJurisprudence(organizationId, {
      q,
      limit,
      includeDemo: options.includeDemo ?? false,
    }),
  ]);

  const datajud =
    processesOutcome.status === 'fulfilled'
      ? processesOutcome.value
      : {
          processes: [],
          total: 0,
          index: options.court ?? '',
          enabled: false,
          error: messageOf(processesOutcome.reason),
          configurationHint: null,
          query: q,
        };

  return {
    query: q,
    byCaseNumber: digits !== null,

    processes: datajud.processes,
    processesTotal: datajud.total,
    processesError: datajud.error,
    index: datajud.index,
    datajudEnabled: datajud.enabled,

    entendimentos: entendimentosOutcome.status === 'fulfilled' ? entendimentosOutcome.value : [],
    entendimentosError:
      entendimentosOutcome.status === 'rejected' ? messageOf(entendimentosOutcome.reason) : null,
  };
}

function messageOf(reason: unknown): string {
  if (reason instanceof Error && reason.message) return reason.message;
  return 'Não foi possível concluir esta parte da busca.';
}
