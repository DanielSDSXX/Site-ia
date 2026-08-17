import { describe, expect, it, beforeAll } from 'vitest';
import { searchLegal } from '@/server/legal-search';
import { createTestOrganization, resetDatabase } from './helpers';

/**
 * Busca jurídica unificada.
 *
 * O contrato que importa aqui é a INDEPENDÊNCIA das duas fontes: o DataJud
 * desligado (o caso padrão em teste, sem chave) não pode esconder um
 * entendimento que está no acervo. Antes da unificação, uma fonte vazia
 * derrubava a tela inteira — era esse o bug do buscador.
 */
describe('busca jurídica unificada', () => {
  let organizationId: string;

  beforeAll(async () => {
    await resetDatabase();
    const org = await createTestOrganization();
    organizationId = org.organizationId;
  });

  it('o acervo responde mesmo quando o CNJ não responde', async () => {
    const result = await searchLegal(organizationId, 'cobrança indevida', { includeDemo: true });

    /*
      Em teste o CNJ nunca é alcançado: ou a integração está desligada, ou a
      rede não sai. Nos dois casos a regra é a mesma — sem processo, mas com
      motivo declarado, nunca uma lista vazia silenciosa.
    */
    expect(result.processes).toEqual([]);
    expect(result.processesError).toBeTruthy();

    // E o acervo respondeu assim mesmo: é exatamente o ponto do allSettled.
    expect(result.entendimentosError).toBeNull();
    expect(Array.isArray(result.entendimentos)).toBe(true);
  });

  it('reconhece busca por número CNJ', async () => {
    const porNumero = await searchLegal(organizationId, '0801234-56.2026.8.09.0051');
    expect(porNumero.byCaseNumber).toBe(true);

    const porTermo = await searchLegal(organizationId, 'dano moral');
    expect(porTermo.byCaseNumber).toBe(false);
  });

  it('não devolve exemplos fictícios sem que sejam pedidos', async () => {
    const semDemo = await searchLegal(organizationId, 'cobrança indevida', { includeDemo: false });
    expect(semDemo.entendimentos.every((e) => !e.isDemo)).toBe(true);
  });
});
