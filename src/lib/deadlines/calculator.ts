import { DeadlineCountingMode } from '@prisma/client';

/**
 * Cálculo de prazos processuais.
 *
 * AVISO EXPLÍCITO: este cálculo é uma FERRAMENTA DE APOIO. Ele implementa a
 * regra geral do art. 219 do CPC (contagem em dias úteis para prazos
 * processuais) e o art. 224 (exclui o dia do começo, inclui o do vencimento),
 * com prorrogação para o próximo dia útil. Ele NÃO conhece:
 *   - suspensões e feriados locais de cada comarca/tribunal;
 *   - regimes especiais (Juizados, Justiça do Trabalho, prazos em dobro);
 *   - decisões que alterem a contagem no caso concreto.
 *
 * Por isso o resultado é sempre gravado com `computed = true` e uma nota de
 * cálculo, e a interface exibe o aviso. O prazo válido é o que o advogado
 * confirma.
 */

export interface HolidayCalendar {
  /** Datas ISO (YYYY-MM-DD) consideradas não úteis. */
  dates: Set<string>;
  name: string;
}

/**
 * Feriados nacionais de data fixa (Lei 662/1949, Lei 10.607/2002) e o recesso
 * forense do art. 220 do CPC (20/12 a 20/01).
 * Feriados móveis (Carnaval, Sexta-feira Santa, Corpus Christi) são
 * calculados a partir da Páscoa.
 */
export function nationalHolidays(year: number): Set<string> {
  const dates = new Set<string>();
  const add = (month: number, day: number) => {
    dates.add(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  };

  add(1, 1);   // Confraternização Universal
  add(4, 21);  // Tiradentes
  add(5, 1);   // Dia do Trabalho
  add(9, 7);   // Independência
  add(10, 12); // Nossa Senhora Aparecida
  add(11, 2);  // Finados
  add(11, 15); // Proclamação da República
  add(11, 20); // Consciência Negra (Lei 14.759/2023)
  add(12, 25); // Natal

  const easter = easterSunday(year);
  const offsetDay = (days: number) => {
    const d = new Date(easter.getTime() + days * 86_400_000);
    dates.add(d.toISOString().slice(0, 10));
  };
  offsetDay(-48); // Segunda de Carnaval
  offsetDay(-47); // Terça de Carnaval
  offsetDay(-2);  // Sexta-feira Santa
  offsetDay(60);  // Corpus Christi

  // Recesso forense: 20/12 a 31/12 deste ano e 01/01 a 20/01.
  for (let day = 20; day <= 31; day++) add(12, day);
  for (let day = 1; day <= 20; day++) add(1, day);

  return dates;
}

/** Algoritmo de Meeus/Jones/Butcher para o domingo de Páscoa. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

export function isBusinessDay(date: Date, holidays: Set<string>): boolean {
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !holidays.has(date.toISOString().slice(0, 10));
}

export interface DeadlineComputation {
  dueDate: Date;
  note: string;
  skippedDays: number;
  countingMode: DeadlineCountingMode;
}

export interface ComputeOptions {
  /** Data-base: normalmente a data da intimação. */
  baseDate: Date;
  days: number;
  countingMode?: DeadlineCountingMode;
  /** Feriados adicionais (locais/tribunal) em formato ISO YYYY-MM-DD. */
  extraHolidays?: string[];
  /** Ignora o recesso forense (útil para prazos materiais). */
  includeRecess?: boolean;
}

export function computeDeadline(options: ComputeOptions): DeadlineComputation {
  const { baseDate, days } = options;
  const countingMode = options.countingMode ?? DeadlineCountingMode.BUSINESS_DAYS;

  if (days <= 0) throw new Error('O prazo precisa ter ao menos 1 dia.');

  const years = new Set([baseDate.getUTCFullYear(), baseDate.getUTCFullYear() + 1]);
  const holidays = new Set<string>();
  for (const year of years) {
    for (const date of nationalHolidays(year)) holidays.add(date);
  }
  if (options.includeRecess) {
    // Remove o recesso do conjunto, mantendo apenas feriados propriamente ditos.
    for (const date of [...holidays]) {
      const [, month, day] = date.split('-').map(Number);
      const inRecess = (month === 12 && day >= 20) || (month === 1 && day <= 20);
      const isFixedHoliday =
        (month === 12 && day === 25) || (month === 1 && day === 1);
      if (inRecess && !isFixedHoliday) holidays.delete(date);
    }
  }
  for (const extra of options.extraHolidays ?? []) holidays.add(extra);

  // Art. 224 do CPC: exclui-se o dia do começo.
  const cursor = new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate()),
  );

  let skipped = 0;

  if (countingMode === DeadlineCountingMode.CALENDAR_DAYS) {
    cursor.setUTCDate(cursor.getUTCDate() + days);
    // Art. 224, §1º: prorroga-se para o primeiro dia útil seguinte.
    while (!isBusinessDay(cursor, holidays)) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      skipped++;
    }
    return {
      dueDate: cursor,
      countingMode,
      skippedDays: skipped,
      note: `Contagem em dias corridos a partir de ${formatIso(baseDate)}, com prorrogação para o próximo dia útil. Cálculo automático — confira feriados locais do tribunal.`,
    };
  }

  // Art. 219 do CPC: dias úteis.
  // O termo inicial também é postergado se cair em dia não útil (art. 224, §1º).
  let counted = 0;
  while (counted < days) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isBusinessDay(cursor, holidays)) counted++;
    else skipped++;
  }

  return {
    dueDate: cursor,
    countingMode,
    skippedDays: skipped,
    note: `Contagem em dias úteis (art. 219 do CPC) a partir de ${formatIso(
      baseDate,
    )}, excluído o dia do começo (art. 224). ${skipped} dia(s) não útil(eis) pulado(s), incluindo o recesso forense de 20/12 a 20/01. Cálculo automático de apoio — não considera suspensões e feriados locais do tribunal.`,
  };
}

function formatIso(date: Date): string {
  return date.toISOString().slice(0, 10).split('-').reverse().join('/');
}

/** Prazos processuais mais comuns, oferecidos como atalho na interface. */
export const COMMON_DEADLINES: { label: string; days: number; legalBasis: string }[] = [
  { label: 'Contestação', days: 15, legalBasis: 'art. 335 do CPC' },
  { label: 'Réplica / impugnação à contestação', days: 15, legalBasis: 'art. 350 do CPC' },
  { label: 'Embargos de declaração', days: 5, legalBasis: 'art. 1.023 do CPC' },
  { label: 'Apelação', days: 15, legalBasis: 'art. 1.003, §5º do CPC' },
  { label: 'Agravo de instrumento', days: 15, legalBasis: 'art. 1.003, §5º do CPC' },
  { label: 'Contrarrazões de apelação', days: 15, legalBasis: 'art. 1.010, §1º do CPC' },
  { label: 'Manifestação geral', days: 5, legalBasis: 'art. 218, §3º do CPC' },
  { label: 'Cumprimento voluntário de sentença', days: 15, legalBasis: 'art. 523 do CPC' },
  { label: 'Impugnação ao cumprimento de sentença', days: 15, legalBasis: 'art. 525 do CPC' },
];
