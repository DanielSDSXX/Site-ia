import { describe, expect, it } from 'vitest';
import { deriveSituation, indexFromCaseNumber, readSecrecy } from '@/lib/integrations/datajud';
import type { DatajudMovement } from '@/lib/integrations/datajud';

/**
 * Situação do processo (ativo / suspenso / arquivado).
 *
 * A API Pública do CNJ não publica um campo de situação — o glossário oficial
 * traz número, classe, assuntos, órgão julgador, grau, sigilo e movimentações,
 * e nada mais. Então a situação é DEDUZIDA da última movimentação decisiva, e
 * estes testes fixam as duas garantias que tornam essa dedução aceitável:
 * ela sempre aponta o andamento que a sustenta, e nunca afirma "ativo" quando
 * não há base nenhuma.
 */

function movement(name: string, iso: string, code = 1): DatajudMovement {
  return { code, name, occurredAt: new Date(iso), complements: [], judgingBody: null };
}

describe('situação deduzida das movimentações', () => {
  it('lê processo em curso quando nada indica paralisação', () => {
    const situation = deriveSituation([
      movement('Distribuição', '2026-02-11T10:00:00Z'),
      movement('Citação', '2026-03-19T08:00:00Z'),
    ]);

    expect(situation.code).toBe('ATIVO');
    expect(situation.basis?.name).toBe('Citação');
  });

  it('reconhece arquivamento', () => {
    const situation = deriveSituation([
      movement('Sentença', '2026-07-29T18:00:00Z'),
      movement('Arquivamento definitivo', '2026-08-30T09:00:00Z'),
    ]);

    expect(situation.code).toBe('ARQUIVADO');
    expect(situation.label).toBe('Arquivado');
    expect(situation.basis?.name).toBe('Arquivamento definitivo');
  });

  it('reconhece suspensão', () => {
    const situation = deriveSituation([
      movement('Citação', '2026-03-19T08:00:00Z'),
      movement('Suspensão do processo', '2026-04-02T08:00:00Z'),
    ]);

    expect(situation.code).toBe('SUSPENSO');
  });

  it('não lê desarquivamento como arquivamento', () => {
    // "desarquivamento" contém "arquivamento": se a ordem das regras estiver
    // errada, um processo retomado aparece como arquivado.
    const situation = deriveSituation([
      movement('Arquivamento', '2026-01-10T09:00:00Z'),
      movement('Desarquivamento', '2026-05-04T09:00:00Z'),
    ]);

    expect(situation.code).toBe('ATIVO');
    expect(situation.basis?.name).toBe('Desarquivamento');
  });

  it('vale a movimentação mais recente, não a primeira encontrada', () => {
    const situation = deriveSituation([
      movement('Suspensão do processo', '2026-02-01T09:00:00Z'),
      movement('Arquivamento', '2026-09-01T09:00:00Z'),
    ]);

    expect(situation.code).toBe('ARQUIVADO');
  });

  it('sem movimentações, não conclui nada', () => {
    const situation = deriveSituation([]);

    expect(situation.code).toBe('INDEFINIDO');
    expect(situation.basis).toBeNull();
  });

  it('declara-se sempre como inferência', () => {
    expect(deriveSituation([movement('Citação', '2026-03-19T08:00:00Z')]).inferred).toBe(true);
    expect(deriveSituation([]).inferred).toBe(true);
  });
});

describe('segredo de justiça', () => {
  it('nível 0 é processo público', () => {
    const secrecy = readSecrecy(0);
    expect(secrecy.isSecret).toBe(false);
    expect(secrecy.label).toBe('Público');
  });

  it('qualquer nível acima de 0 é segredo de justiça', () => {
    const secrecy = readSecrecy(2);
    expect(secrecy.isSecret).toBe(true);
    expect(secrecy.label).toContain('Segredo de justiça');
    expect(secrecy.level).toBe(2);
  });

  it('trata sigilo ausente como público, sem inventar nível', () => {
    expect(readSecrecy(null)).toEqual({ level: 0, isSecret: false, label: 'Público' });
  });
});

describe('tribunal deduzido do número CNJ', () => {
  it('identifica a Justiça Estadual pelo código do estado', () => {
    // NNNNNNN-DD.AAAA.J.TR.OOOO — J=8 (estadual), TR=09 (Goiás)
    expect(indexFromCaseNumber('08012345620268090051')).toBe('api_publica_tjgo');
    // TR=26 (São Paulo)
    expect(indexFromCaseNumber('08012345620268260051')).toBe('api_publica_tjsp');
  });

  it('identifica a Justiça Federal pela região', () => {
    // J=4 (federal), TR=01 (TRF1)
    expect(indexFromCaseNumber('00008323520184013202')).toBe('api_publica_trf1');
  });

  it('devolve null quando não dá para afirmar, em vez de chutar', () => {
    // J=5 (trabalhista) não está coberto: melhor deixar o usuário escolher.
    expect(indexFromCaseNumber('08012345620265090051')).toBeNull();
    expect(indexFromCaseNumber('123')).toBeNull();
  });
});
