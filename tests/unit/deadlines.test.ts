import { describe, expect, it } from 'vitest';
import {
  computeDeadline,
  easterSunday,
  isBusinessDay,
  nationalHolidays,
} from '@/lib/deadlines/calculator';

const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('feriados', () => {
  it('calcula a Páscoa corretamente', () => {
    expect(iso(easterSunday(2026))).toBe('2026-04-05');
    expect(iso(easterSunday(2024))).toBe('2024-03-31');
  });

  it('inclui feriados nacionais fixos e móveis', () => {
    const holidays = nationalHolidays(2026);
    expect(holidays.has('2026-09-07')).toBe(true); // Independência
    expect(holidays.has('2026-11-20')).toBe(true); // Consciência Negra
    expect(holidays.has('2026-04-03')).toBe(true); // Sexta-feira Santa
    expect(holidays.has('2026-06-04')).toBe(true); // Corpus Christi
  });

  it('trata o recesso forense de 20/12 a 20/01 como não útil', () => {
    const holidays = nationalHolidays(2026);
    expect(holidays.has('2026-12-24')).toBe(true);
    expect(holidays.has('2026-01-15')).toBe(true);
    expect(holidays.has('2026-01-21')).toBe(false);
  });

  it('reconhece fim de semana como dia não útil', () => {
    const holidays = new Set<string>();
    expect(isBusinessDay(new Date(Date.UTC(2026, 1, 7)), holidays)).toBe(false); // sábado
    expect(isBusinessDay(new Date(Date.UTC(2026, 1, 8)), holidays)).toBe(false); // domingo
    expect(isBusinessDay(new Date(Date.UTC(2026, 1, 9)), holidays)).toBe(true); // segunda
  });
});

describe('contagem de prazos', () => {
  it('conta em dias úteis excluindo o dia do começo (arts. 219 e 224 do CPC)', () => {
    // Base: segunda 02/02/2026. 5 dias úteis -> segunda 09/02/2026.
    const result = computeDeadline({ baseDate: new Date(Date.UTC(2026, 1, 2)), days: 5 });
    expect(iso(result.dueDate)).toBe('2026-02-09');
    expect(result.countingMode).toBe('BUSINESS_DAYS');
  });

  it('pula fins de semana ao contar', () => {
    // Base: sexta 06/02/2026. 1 dia útil -> segunda 09/02/2026.
    const result = computeDeadline({ baseDate: new Date(Date.UTC(2026, 1, 6)), days: 1 });
    expect(iso(result.dueDate)).toBe('2026-02-09');
    expect(result.skippedDays).toBe(2);
  });

  it('atravessa o recesso forense sem contar os dias suspensos', () => {
    // Base: 18/12/2026 (sexta). 3 dias úteis caem depois de 20/01/2027.
    const result = computeDeadline({ baseDate: new Date(Date.UTC(2026, 11, 18)), days: 3 });
    expect(result.dueDate.getUTCFullYear()).toBe(2027);
    expect(result.dueDate.getTime()).toBeGreaterThan(Date.UTC(2027, 0, 20));
  });

  it('em dias corridos, prorroga o vencimento para o próximo dia útil', () => {
    // Base: quinta 05/02/2026 + 2 dias corridos = sábado 07/02 -> segunda 09/02.
    const result = computeDeadline({
      baseDate: new Date(Date.UTC(2026, 1, 5)),
      days: 2,
      countingMode: 'CALENDAR_DAYS',
    });
    expect(iso(result.dueDate)).toBe('2026-02-09');
  });

  it('respeita feriados adicionais informados (locais/tribunal)', () => {
    const withoutLocal = computeDeadline({ baseDate: new Date(Date.UTC(2026, 1, 2)), days: 3 });
    const withLocal = computeDeadline({
      baseDate: new Date(Date.UTC(2026, 1, 2)),
      days: 3,
      extraHolidays: ['2026-02-04'],
    });
    expect(withLocal.dueDate.getTime()).toBeGreaterThan(withoutLocal.dueDate.getTime());
  });

  it('devolve nota de cálculo declarando as limitações', () => {
    const result = computeDeadline({ baseDate: new Date(Date.UTC(2026, 1, 2)), days: 15 });
    expect(result.note).toContain('art. 219');
    expect(result.note).toMatch(/não considera suspensões e feriados locais/i);
  });

  it('recusa prazo com zero ou menos dias', () => {
    expect(() => computeDeadline({ baseDate: new Date(), days: 0 })).toThrow();
  });
});
