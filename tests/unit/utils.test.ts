import { describe, expect, it } from 'vitest';
import {
  formatProcessNumber,
  isValidProcessNumber,
  normalizeProcessNumber,
  slugify,
  formatBytes,
  daysUntil,
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
});
