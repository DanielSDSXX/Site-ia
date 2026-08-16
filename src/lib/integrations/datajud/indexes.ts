import { env } from '@/lib/env';

/**
 * Índices da API Pública do DataJud — um por tribunal.
 *
 * O índice vai na URL da consulta, e não no corpo. Um processo do TJSP não
 * aparece no índice do TJGO: escolher o tribunal certo é parte da busca.
 */
export const DATAJUD_INDEXES: { value: string; label: string }[] = [
  { value: 'api_publica_stj', label: 'STJ — Superior Tribunal de Justiça' },
  { value: 'api_publica_tst', label: 'TST — Tribunal Superior do Trabalho' },
  { value: 'api_publica_tse', label: 'TSE — Tribunal Superior Eleitoral' },
  { value: 'api_publica_stm', label: 'STM — Superior Tribunal Militar' },
  { value: 'api_publica_trf1', label: 'TRF1 — Tribunal Regional Federal da 1ª Região' },
  { value: 'api_publica_trf2', label: 'TRF2 — Tribunal Regional Federal da 2ª Região' },
  { value: 'api_publica_trf3', label: 'TRF3 — Tribunal Regional Federal da 3ª Região' },
  { value: 'api_publica_trf4', label: 'TRF4 — Tribunal Regional Federal da 4ª Região' },
  { value: 'api_publica_trf5', label: 'TRF5 — Tribunal Regional Federal da 5ª Região' },
  { value: 'api_publica_trf6', label: 'TRF6 — Tribunal Regional Federal da 6ª Região' },
  { value: 'api_publica_tjac', label: 'TJAC — Acre' },
  { value: 'api_publica_tjal', label: 'TJAL — Alagoas' },
  { value: 'api_publica_tjam', label: 'TJAM — Amazonas' },
  { value: 'api_publica_tjap', label: 'TJAP — Amapá' },
  { value: 'api_publica_tjba', label: 'TJBA — Bahia' },
  { value: 'api_publica_tjce', label: 'TJCE — Ceará' },
  { value: 'api_publica_tjdft', label: 'TJDFT — Distrito Federal e Territórios' },
  { value: 'api_publica_tjes', label: 'TJES — Espírito Santo' },
  { value: 'api_publica_tjgo', label: 'TJGO — Goiás' },
  { value: 'api_publica_tjma', label: 'TJMA — Maranhão' },
  { value: 'api_publica_tjmg', label: 'TJMG — Minas Gerais' },
  { value: 'api_publica_tjms', label: 'TJMS — Mato Grosso do Sul' },
  { value: 'api_publica_tjmt', label: 'TJMT — Mato Grosso' },
  { value: 'api_publica_tjpa', label: 'TJPA — Pará' },
  { value: 'api_publica_tjpb', label: 'TJPB — Paraíba' },
  { value: 'api_publica_tjpe', label: 'TJPE — Pernambuco' },
  { value: 'api_publica_tjpi', label: 'TJPI — Piauí' },
  { value: 'api_publica_tjpr', label: 'TJPR — Paraná' },
  { value: 'api_publica_tjrj', label: 'TJRJ — Rio de Janeiro' },
  { value: 'api_publica_tjrn', label: 'TJRN — Rio Grande do Norte' },
  { value: 'api_publica_tjro', label: 'TJRO — Rondônia' },
  { value: 'api_publica_tjrr', label: 'TJRR — Roraima' },
  { value: 'api_publica_tjrs', label: 'TJRS — Rio Grande do Sul' },
  { value: 'api_publica_tjsc', label: 'TJSC — Santa Catarina' },
  { value: 'api_publica_tjse', label: 'TJSE — Sergipe' },
  { value: 'api_publica_tjsp', label: 'TJSP — São Paulo' },
  { value: 'api_publica_tjto', label: 'TJTO — Tocantins' },
];

const FALLBACK_INDEX = 'api_publica_tjgo';

/** Aceita "tjsp", "TJSP" ou "api_publica_tjsp". */
export function resolveDatajudIndex(court?: string): string {
  const normalized = (court ?? '').trim().toLowerCase();
  if (!normalized) return env().DATAJUD_TRIBUNAL_INDEX || FALLBACK_INDEX;
  if (normalized.startsWith('api_publica_')) return normalized;

  const direct = DATAJUD_INDEXES.find((item) => item.value === `api_publica_${normalized}`);
  if (direct) return direct.value;

  return env().DATAJUD_TRIBUNAL_INDEX || FALLBACK_INDEX;
}

export function indexToCourt(index: string): string {
  return index.replace('api_publica_', '').toUpperCase() || 'DataJud';
}

/**
 * Deduz o índice a partir do próprio número CNJ.
 *
 * No padrão NNNNNNN-DD.AAAA.J.TR.OOOO, `J` é o segmento do Judiciário e `TR` o
 * tribunal. Cobrimos o que dá para afirmar com segurança — Justiça Federal
 * (J=4 → TRF1..TRF6) e Justiça Estadual (J=8 → TR = código do estado). Fora
 * disso devolvemos null e a escolha continua com o usuário, em vez de chutar
 * um tribunal e devolver "processo não encontrado" por motivo errado.
 */
const STATE_BY_CODE: Record<string, string> = {
  '01': 'tjac', '02': 'tjal', '03': 'tjap', '04': 'tjam', '05': 'tjba',
  '06': 'tjce', '07': 'tjdft', '08': 'tjes', '09': 'tjgo', '10': 'tjma',
  '11': 'tjmt', '12': 'tjms', '13': 'tjmg', '14': 'tjpa', '15': 'tjpb',
  '16': 'tjpr', '17': 'tjpe', '18': 'tjpi', '19': 'tjrj', '20': 'tjrn',
  '21': 'tjrs', '22': 'tjro', '23': 'tjrr', '24': 'tjsc', '25': 'tjse',
  '26': 'tjsp', '27': 'tjto',
};

export function indexFromCaseNumber(digits: string): string | null {
  if (digits.length !== 20) return null;
  const segment = digits.slice(13, 14); // J
  const court = digits.slice(14, 16); // TR

  if (segment === '4') {
    const region = Number(court);
    return region >= 1 && region <= 6 ? `api_publica_trf${region}` : null;
  }
  if (segment === '8') {
    const state = STATE_BY_CODE[court];
    return state ? `api_publica_${state}` : null;
  }
  return null;
}
