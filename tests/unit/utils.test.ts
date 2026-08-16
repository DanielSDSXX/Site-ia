import { describe, expect, it } from 'vitest';
import {
  formatProcessNumber,
  isValidProcessNumber,
  normalizeProcessNumber,
  slugify,
  formatBytes,
  daysUntil,
  formatDate,
  formatDateTime,
} from '@/lib/utils';

describe('número CNJ', () => {
  it('formata 20 dígitos no padrão NNNNNNN-DD.AAAA.J.TR.OOOO', () => {
    expect(formatProcessNumber('08012345620268090051')).toBe('0801234-56.2026.8.09.0051');
  });

  it('devolve a entrada intacta quando não há 20 dígitos', () => {
    expect(formatProcessNumber('123')).toBe('123');
  });

  it('valida o dígito verificador (módulo 97 base 10)', () => {
    // Dígito calculado a partir do próprio algoritmo da Resolução CNJ 65/2008.
    const digits = '0801234' + '__' + '2026' + '8' + '09' + '0051';
    const base = `${'0801234'}${'2026'}${'8'}${'09'}${'0051'}00`;
    let remainder = 0;
    for (const ch of base) remainder = (remainder * 10 + Number(ch)) % 97;
    const dv = String(98 - remainder).padStart(2, '0');

    const valid = digits.replace('__', dv);
    expect(isValidProcessNumber(valid)).toBe(true);
  });

  it('rejeita dígito verificador incorreto', () => {
    expect(isValidProcessNumber('0801234-00.2026.8.09.0051')).toBe(false);
  });

  it('rejeita números com tamanho diferente de 20 dígitos', () => {
    expect(isValidProcessNumber('123456')).toBe(false);
  });

  it('normaliza mantendo números fora do padrão CNJ', () => {
    expect(normalizeProcessNumber('  processo antigo 1234  ')).toBe('processo antigo 1234');
  });
});

describe('slugify', () => {
  it('remove acentos e normaliza separadores', () => {
    expect(slugify('Escritório Demonstração & Associados')).toBe(
      'escritorio-demonstracao-associados',
    );
  });

  it('não deixa hífens nas pontas', () => {
    expect(slugify('  --Teste--  ')).toBe('teste');
  });
});

describe('formatBytes', () => {
  it('formata em unidade legível', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('daysUntil', () => {
  it('conta dias inteiros no futuro e no passado', () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    expect(daysUntil(future)).toBe(3);

    const past = new Date();
    past.setDate(past.getDate() - 2);
    expect(daysUntil(past)).toBe(-2);
  });

  it('não perde um dia em datas de calendário (meia-noite UTC)', () => {
    // O calculador de prazos grava com Date.UTC(ano, mês, dia). Lido com os
    // componentes locais em Brasília, isso virava o dia anterior.
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    expect(daysUntil(new Date(`${today}T00:00:00.000Z`))).toBe(0);
  });
});

describe('formatação de datas', () => {
  /*
    Data de calendário e instante no tempo são coisas diferentes.

    Um prazo é um DIA — e num fuso a oeste de Greenwich, renderizar a
    meia-noite UTC no relógio de Brasília o joga para as 21h do dia anterior.
    Era assim que o prazo de 04/09 aparecia como 03/09.
  */
  it('mostra o prazo no dia certo, sem recuar pelo fuso', () => {
    expect(formatDate('2026-09-04T00:00:00.000Z')).toBe('04/09/2026');
    expect(formatDate('2026-02-11T00:00:00.000Z')).toBe('11/02/2026');
    expect(formatDate('2026-01-01T00:00:00.000Z')).toBe('01/01/2026');
  });

  it('mantém instantes reais no fuso de Brasília', () => {
    // Movimentação às 09:12 UTC ocorreu às 06:12 em Brasília.
    expect(formatDateTime('2026-07-30T09:12:00.000Z')).toBe('30/07/2026, 06:12');
    // E às 00:30 UTC ainda era o dia anterior aqui.
    expect(formatDate('2026-07-30T00:30:00.000Z')).toBe('29/07/2026');
  });

  it('devolve travessão para valor ausente ou inválido', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('não é data')).toBe('—');
  });
});
