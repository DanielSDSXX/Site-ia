import { describe, expect, it } from 'vitest';
import {
  filterOfficialJurisprudenceRecords,
  isOfficialJurisprudenceRecord,
} from '@/server/jurisprudence';

describe('jurisprudence safety rules', () => {
  it('aceita apenas decisões verificadas, não fictícias e com fonte oficial', () => {
    expect(
      isOfficialJurisprudenceRecord({
        verified: true,
        isDemo: false,
        sourceUrl: 'https://www.tjgo.jus.br/portal/decisao/123',
      }),
    ).toBe(true);

    expect(
      isOfficialJurisprudenceRecord({
        verified: false,
        isDemo: false,
        sourceUrl: 'https://www.tjgo.jus.br/portal/decisao/123',
      }),
    ).toBe(false);

    expect(
      isOfficialJurisprudenceRecord({
        verified: true,
        isDemo: true,
        sourceUrl: 'https://example.com/demo',
      }),
    ).toBe(false);

    expect(
      isOfficialJurisprudenceRecord({
        verified: true,
        isDemo: false,
        sourceUrl: null,
      }),
    ).toBe(false);
  });

  it('filtra registros de demonstração e origem não verificável antes do ranking', () => {
    const rows = [
      {
        id: 'real-1',
        caseNumber: '123',
        verified: true,
        isDemo: false,
        sourceUrl: 'https://www.tjgo.jus.br/portal/decisao/123',
      },
      {
        id: 'demo-1',
        caseNumber: '456',
        verified: true,
        isDemo: true,
        sourceUrl: 'https://example.com/demo',
      },
      {
        id: 'unverified-1',
        caseNumber: '789',
        verified: false,
        isDemo: false,
        sourceUrl: 'https://www.tjgo.jus.br/portal/decisao/789',
      },
    ];

    expect(filterOfficialJurisprudenceRecords(rows).map((item) => item.id)).toEqual(['real-1']);
  });
});
