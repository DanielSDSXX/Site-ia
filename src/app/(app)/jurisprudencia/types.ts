/**
 * Uma ementa do acervo do escritório, como chega ao cliente.
 *
 * Fica num módulo próprio — e não exportado da `page.tsx` — para que os
 * componentes de cliente não precisem importar do módulo da página, que é
 * servidor e puxa Prisma e sessão junto.
 */
export interface JurisprudenceRow {
  id: string;
  court: string;
  judgingBody: string | null;
  caseNumber: string;
  judgmentDate: string | null;
  reporter: string | null;
  summary: string;
  thesis: string | null;
  outcome: string | null;
  sourceUrl: string | null;
  sourceName: string;
  verified: boolean;
  isDemo: boolean;
  organizationId: string | null;
}
