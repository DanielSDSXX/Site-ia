import { PlanTier, Role, SubscriptionStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { ensurePlans } from '@/server/accounts';
import { grantCredits } from '@/lib/ai/usage';
import { buildStorageKey, storage } from '@/lib/storage';
import { sha256 } from '@/lib/security/crypto';

/** Utilidades compartilhadas pelos testes de integração. */

/**
 * Limpa o banco entre suítes.
 * TRUNCATE ... CASCADE é bem mais rápido que apagar tabela a tabela e evita
 * ter de acertar a ordem das chaves estrangeiras.
 */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;

  const list = tables.map((row) => `"public"."${row.tablename}"`).join(', ');
  if (list) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
}

export interface TestOrg {
  organizationId: string;
  userId: string;
  email: string;
}

let counter = 0;

/** Cria um escritório completo com dono, plano e créditos. */
export async function createTestOrganization(name = 'Escritório de Teste'): Promise<TestOrg> {
  counter += 1;
  await ensurePlans();

  const email = `owner${counter}@teste.local`;
  const user = await prisma.user.create({
    data: { email, name: `Dono ${counter}`, passwordHash: await hashPassword('Vento-Norte-5530') },
  });

  const organization = await prisma.organization.create({
    data: { name: `${name} ${counter}`, slug: `escritorio-teste-${counter}` },
  });

  await prisma.membership.create({
    data: { userId: user.id, organizationId: organization.id, role: Role.OWNER },
  });

  const plan = await prisma.plan.findUnique({ where: { tier: PlanTier.BUSINESS } });
  if (plan) {
    await prisma.subscription.create({
      data: {
        organizationId: organization.id,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    await grantCredits(organization.id, plan.monthlyCredits, 'SUBSCRIPTION_GRANT');
  }

  return { organizationId: organization.id, userId: user.id, email };
}

export async function createTestProcess(org: TestOrg, number = '0801234-56.2026.8.09.0051') {
  return prisma.process.create({
    data: {
      organizationId: org.organizationId,
      createdById: org.userId,
      responsibleId: org.userId,
      number,
      court: 'TJTESTE',
      subject: 'Cobrança indevida',
      parties: {
        create: [
          { organizationId: org.organizationId, name: 'Autora Teste', role: 'PLAINTIFF', side: 'OURS' },
          { organizationId: org.organizationId, name: 'Ré Teste', role: 'DEFENDANT', side: 'OPPOSING' },
        ],
      },
    },
  });
}

/** Gera um PDF de verdade com o texto informado, uma página por item. */
export async function makePdf(pages: string[]): Promise<Buffer> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const text of pages) {
    const page = pdf.addPage([595.28, 841.89]);
    let y = 780;
    for (const line of text.split('\n')) {
      for (const wrapped of wrap(line, 95)) {
        if (y < 60) break;
        page.drawText(wrapped, { x: 56, y, size: 11, font });
        y -= 16;
      }
      y -= 4;
    }
  }

  return Buffer.from(await pdf.save());
}

function wrap(text: string, size: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current ? `${current} ${word}` : word).length > size) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Cria um documento já gravado no storage, pronto para o pipeline. */
export async function attachDocument(
  org: TestOrg,
  processId: string,
  title: string,
  pages: string[],
  kind: 'INITIAL_PETITION' | 'ANSWER' | 'DECISION' | 'EVIDENCE' | 'UNKNOWN' = 'UNKNOWN',
) {
  const buffer = await makePdf(pages);

  const document = await prisma.document.create({
    data: {
      organizationId: org.organizationId,
      processId,
      uploadedById: org.userId,
      title,
      originalFilename: `${title.replace(/\s+/g, '-').toLowerCase()}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: buffer.byteLength,
      sha256: sha256(buffer),
      storageKey: 'pending',
      kind,
    },
  });

  const storageKey = buildStorageKey(org.organizationId, document.id, document.originalFilename);
  await storage().put(storageKey, buffer, 'application/pdf');
  await prisma.document.update({ where: { id: document.id }, data: { storageKey } });

  return { ...document, storageKey };
}
