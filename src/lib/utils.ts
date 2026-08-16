import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

const TZ = 'America/Sao_Paulo';

/**
 * Distingue data de calendário de instante no tempo.
 *
 * O domínio inteiro trata prazo, data de julgamento e data de ajuizamento como
 * DATA, não como momento: o calculador de prazos monta tudo com
 * `Date.UTC(ano, mês, dia)`, um `<input type="date">` é lido como meia-noite
 * UTC e o DataJud devolve `dataAjuizamento` como `...T00:00:00.000Z`.
 *
 * Renderizar esses valores em America/Sao_Paulo (UTC−3) joga o relógio para as
 * 21h do dia ANTERIOR — e o prazo de 04/09 aparecia como 03/09. Num produto de
 * prazos processuais, errar um dia é errar o produto.
 *
 * Por isso: meia-noite UTC cravada é data de calendário e sai em UTC; qualquer
 * outro horário é um instante real (uma movimentação às 14h32, por exemplo) e
 * sai no fuso de Brasília.
 */
function isCalendarDate(d: Date): boolean {
  return d.getTime() % 86_400_000 === 0;
}

function zoneFor(d: Date): string {
  return isCalendarDate(d) ? 'UTC' : TZ;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: zoneFor(d) }).format(d);
}

export function formatDateLong(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: zoneFor(d) }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: TZ,
  }).format(d);
}

/** Número do dia no calendário de um fuso, para subtrair dias sem erro de horário. */
function calendarDayNumber(date: Date, timeZone: string): number {
  // en-CA formata como YYYY-MM-DD, que é o que precisamos aqui.
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')
    .map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/**
 * Diferença em dias inteiros entre hoje e uma data (positivo = futuro).
 *
 * Usava os componentes LOCAIS da data, o que dava duas respostas diferentes
 * para o mesmo prazo: o servidor roda em UTC e o navegador do advogado, em
 * Brasília. Agora "hoje" é sempre o dia em Brasília e a data-alvo é lida no
 * fuso que corresponde à sua natureza (ver `zoneFor`).
 */
export function daysUntil(value: Date | string): number {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return 0;
  return calendarDayNumber(d, zoneFor(d)) - calendarDayNumber(new Date(), TZ);
}

export function relativeTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return 'agora';
}

export function greeting(date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: TZ }).format(date),
  );
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

// ---------------------------------------------------------------------------
// Números e texto
// ---------------------------------------------------------------------------

export function formatCurrencyCents(cents: bigint | number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  const value = Number(cents) / 100;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

export function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ---------------------------------------------------------------------------
// Número CNJ
// ---------------------------------------------------------------------------

/** Formata dígitos no padrão CNJ NNNNNNN-DD.AAAA.J.TR.OOOO. */
export function formatProcessNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 20) return raw;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(
    13,
    14,
  )}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
}

/**
 * Valida o dígito verificador do número CNJ (Resolução CNJ 65/2008),
 * usando módulo 97 base 10 (ISO 7064).
 */
export function isValidProcessNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 20) return false;
  const nnnnnnn = digits.slice(0, 7);
  const dd = digits.slice(7, 9);
  const rest = digits.slice(9);
  const base = `${nnnnnnn}${rest}00`;
  let remainder = 0;
  for (const ch of base) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  const expected = 98 - remainder;
  return expected === Number(dd);
}

export function normalizeProcessNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 20 ? formatProcessNumber(digits) : raw.trim();
}
