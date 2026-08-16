/**
 * Seed da base.
 *
 *   npm run db:seed
 *
 * Cria os planos, um escritório de demonstração e um processo fictício com
 * PDFs gerados na hora. Os documentos passam pelo MESMO pipeline de produção
 * (extração → chunking → embeddings → análise), então a demonstração é
 * genuína: nada é pré-fabricado no banco para parecer que houve análise.
 *
 * Todos os dados são inventados. Nenhuma informação de processo real é usada.
 */
import { config } from 'dotenv';
config();

import { CreditReason, PlanTier, Role, SubscriptionStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { ensurePlans } from '@/server/accounts';
import { grantCredits } from '@/lib/ai/usage';
import { buildStorageKey, storage } from '@/lib/storage';
import { sha256 } from '@/lib/security/crypto';
import { processDocument } from '@/lib/documents/pipeline';
import { runInitialAnalyses, runAnalysis } from '@/lib/intelligence/analysis';
import { embedJurisprudence } from '@/server/jurisprudence';
import { embedMemoryItem } from '@/server/memory';
import { slugify } from '@/lib/utils';
import { DEMO_DOCUMENTS, DEMO_JURISPRUDENCE, DEMO_MEMORY, DEMO_PROCESS_NUMBER } from './demo-case';

const DEMO_ORG = 'Escritório Demonstração';
const OWNER_EMAIL = 'demo@legalmind.local';
const OWNER_PASSWORD = 'legalmind-demo-2026';
const ASSISTANT_EMAIL = 'assistente@legalmind.local';

async function main() {
  console.log('→ Criando planos…');
  await ensurePlans();

  console.log('→ Criando escritório de demonstração…');
  const passwordHash = await hashPassword(OWNER_PASSWORD);

  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: {
      email: OWNER_EMAIL,
      name: 'Helena Marques',
      passwordHash,
      avatarColor: '#5B67F1',
      // O primeiro usuário do seed também administra a plataforma, para que
      // o painel /admin seja acessível numa instalação nova.
      isPlatformAdmin: true,
      emailVerifiedAt: new Date(),
    },
  });

  const assistant = await prisma.user.upsert({
    where: { email: ASSISTANT_EMAIL },
    update: {},
    create: {
      email: ASSISTANT_EMAIL,
      name: 'Rafael Duarte',
      passwordHash,
      avatarColor: '#0EA5A5',
      emailVerifiedAt: new Date(),
    },
  });

  const slug = slugify(DEMO_ORG);
  let organization = await prisma.organization.findUnique({ where: { slug } });
  if (!organization) {
    organization = await prisma.organization.create({ data: { name: DEMO_ORG, slug } });
  }

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: owner.id, organizationId: organization.id } },
    update: { role: Role.OWNER },
    create: { userId: owner.id, organizationId: organization.id, role: Role.OWNER },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: assistant.id, organizationId: organization.id } },
    update: { role: Role.ASSISTANT },
    create: { userId: assistant.id, organizationId: organization.id, role: Role.ASSISTANT },
  });

  const proPlan = await prisma.plan.findUnique({ where: { tier: PlanTier.PRO } });
  if (proPlan) {
    await prisma.subscription.upsert({
      where: { organizationId: organization.id },
      update: { planId: proPlan.id, status: SubscriptionStatus.ACTIVE },
      create: {
        organizationId: organization.id,
        planId: proPlan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });

    const existingCredits = await prisma.creditLedgerEntry.count({
      where: { organizationId: organization.id },
    });
    if (existingCredits === 0) {
      await grantCredits(
        organization.id,
        proPlan.monthlyCredits,
        CreditReason.SUBSCRIPTION_GRANT,
        'seed',
      );
    }
  }

  console.log('→ Criando cliente e processo fictícios…');
  const client = await upsertClient(organization.id);
  const process = await upsertProcess(organization.id, owner.id, client.id);

  console.log('→ Gerando PDFs de demonstração…');
  const documentIds = await createDemoDocuments(organization.id, owner.id, process.id);

  console.log('→ Processando documentos pelo pipeline real…');
  for (const documentId of documentIds) {
    await processDocument(documentId, (percent, label) => {
      if (percent % 25 === 0 || percent > 95) console.log(`   ${percent}% — ${label}`);
    });
  }

  console.log('→ Executando análises iniciais…');
  await runInitialAnalyses(organization.id, process.id, owner.id, (label) =>
    console.log(`   ${label}`),
  );

  console.log('→ Executando análises de inteligência…');
  for (const type of ['VULNERABILITIES', 'CONTRADICTIONS', 'EVIDENCE_MAP', 'NEXT_ACTIONS'] as const) {
    try {
      await runAnalysis({ organizationId: organization.id, processId: process.id, type, userId: owner.id });
      console.log(`   ${type} ✓`);
    } catch (err) {
      console.warn(`   ${type} falhou:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('→ Criando prazos e tarefas…');
  await createDeadlinesAndTasks(organization.id, process.id, owner.id);

  console.log('→ Importando jurisprudência e memória de demonstração…');
  await createJurisprudence(organization.id);
  await createMemory(organization.id);

  console.log('\n✔ Seed concluído.\n');
  console.log('  Acesse http://localhost:3000/entrar');
  console.log(`  E-mail: ${OWNER_EMAIL}`);
  console.log(`  Senha:  ${OWNER_PASSWORD}`);
  console.log(`\n  Assistente (permissões reduzidas): ${ASSISTANT_EMAIL} / ${OWNER_PASSWORD}`);
  console.log('\n  Todos os dados do processo são FICTÍCIOS e estão marcados como demonstração.\n');
}

async function upsertClient(organizationId: string) {
  const existing = await prisma.client.findFirst({
    where: { organizationId, name: 'Mariana Costa Pereira' },
  });
  if (existing) return existing;

  return prisma.client.create({
    data: {
      organizationId,
      name: 'Mariana Costa Pereira',
      type: 'INDIVIDUAL',
      email: 'mariana@exemplo.invalid',
      phone: '(62) 90000-0000',
      notes: 'Cliente fictícia criada pelo seed de demonstração.',
    },
  });
}

async function upsertProcess(organizationId: string, userId: string, clientId: string) {
  const existing = await prisma.process.findFirst({
    where: { organizationId, number: DEMO_PROCESS_NUMBER },
  });
  if (existing) {
    // Reexecutar o seed refaz documentos e análises do zero.
    await prisma.document.deleteMany({ where: { processId: existing.id } });
    await prisma.finding.deleteMany({ where: { processId: existing.id } });
    await prisma.aIAnalysis.deleteMany({ where: { processId: existing.id } });
    await prisma.timelineEvent.deleteMany({ where: { processId: existing.id } });
    return existing;
  }

  return prisma.process.create({
    data: {
      organizationId,
      clientId,
      createdById: userId,
      responsibleId: userId,
      number: DEMO_PROCESS_NUMBER,
      court: 'TJGO',
      district: 'Goiânia',
      courtUnit: '3ª Vara Cível',
      procedureClass: 'Procedimento Comum Cível',
      subject: 'Cobrança indevida em cartão de crédito e dano moral',
      caseValueCents: BigInt(1_556_970),
      isDemo: true,
      sourceType: 'DEMO',
      notes: 'Processo fictício criado pelo seed para demonstrar a plataforma.',
      parties: {
        create: [
          {
            organizationId,
            name: 'Mariana Costa Pereira',
            role: 'PLAINTIFF',
            side: 'OURS',
            lawyerName: 'Helena Marques de Araújo',
            oabNumber: 'OAB/GO 00.000',
          },
          {
            organizationId,
            name: 'Banco Exemplo Fictício S.A.',
            role: 'DEFENDANT',
            side: 'OPPOSING',
          },
        ],
      },
    },
  });
}

/** Gera os PDFs do caso fictício e os grava no storage configurado. */
async function createDemoDocuments(organizationId: string, userId: string, processId: string) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const ids: string[] = [];

  for (const demo of DEMO_DOCUMENTS) {
    const pdf = await PDFDocument.create();
    pdf.setTitle(demo.title);
    pdf.setCreator('LegalMind AI — seed de demonstração');
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    for (const pageText of demo.pages) {
      const page = pdf.addPage([595.28, 841.89]);
      let y = 790;

      for (const rawLine of pageText.split('\n')) {
        const lines = wrap(rawLine, font, 10.5, 480);
        for (const line of lines) {
          if (y < 60) break;
          page.drawText(line, { x: 56, y, size: 10.5, font, color: rgb(0.1, 0.1, 0.14) });
          y -= 15;
        }
        y -= 4;
      }
    }

    const buffer = Buffer.from(await pdf.save());

    const document = await prisma.document.create({
      data: {
        organizationId,
        processId,
        uploadedById: userId,
        title: demo.title,
        originalFilename: `${slugify(demo.title)}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: buffer.byteLength,
        sha256: sha256(buffer),
        storageKey: 'pending',
        kind: demo.kind,
        sourceType: 'DEMO',
        isDemo: true,
      },
    });

    const storageKey = buildStorageKey(organizationId, document.id, document.originalFilename);
    await storage().put(storageKey, buffer, 'application/pdf');
    await prisma.document.update({ where: { id: document.id }, data: { storageKey } });

    ids.push(document.id);
  }

  return ids;
}

function wrap(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const sanitized = text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/§/g, 'par.');

  const words = sanitized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function createDeadlinesAndTasks(organizationId: string, processId: string, userId: string) {
  const existing = await prisma.deadline.count({ where: { processId } });
  if (existing > 0) return;

  const { computeDeadline } = await import('@/lib/deadlines/calculator');
  const baseDate = new Date();
  const replica = computeDeadline({ baseDate, days: 15 });

  await prisma.deadline.create({
    data: {
      organizationId,
      processId,
      responsibleId: userId,
      title: 'Réplica à contestação',
      description: 'Impugnar a preliminar de ilegitimidade passiva e a alegação de contratação por aplicativo.',
      dueDate: replica.dueDate,
      baseDate,
      days: 15,
      countingMode: 'BUSINESS_DAYS',
      legalBasis: 'art. 350 do CPC',
      priority: 'HIGH',
      computed: true,
      computationNote: replica.note,
    },
  });

  const urgent = new Date(Date.now() + 2 * 86_400_000);
  await prisma.deadline.create({
    data: {
      organizationId,
      processId,
      responsibleId: userId,
      title: 'Comprovar cumprimento da tutela de urgência',
      dueDate: urgent,
      priority: 'URGENT',
      legalBasis: 'decisão de 28/02/2026',
    },
  });

  await prisma.task.createMany({
    data: [
      {
        organizationId,
        processId,
        createdById: userId,
        assigneeId: userId,
        title: 'Obter documento da instituição de ensino sobre o financiamento negado',
        description:
          'A contestação apontou que não há prova da proposta pré-aprovada. Sem esse documento, o pedido de dano moral fica frágil.',
        priority: 'HIGH',
        status: 'TODO',
      },
      {
        organizationId,
        processId,
        createdById: userId,
        title: 'Conferir a divergência de valores (R$ 569,70 × R$ 549,00)',
        description: 'A inicial e a contestação indicam valores diferentes para a mesma cobrança.',
        priority: 'MEDIUM',
        status: 'IN_PROGRESS',
      },
    ],
  });
}

async function createJurisprudence(organizationId: string) {
  const existing = await prisma.jurisprudence.count({ where: { organizationId } });
  if (existing > 0) return;

  for (const item of DEMO_JURISPRUDENCE) {
    const created = await prisma.jurisprudence.create({
      data: {
        organizationId,
        court: item.court,
        judgingBody: item.judgingBody,
        caseNumber: item.caseNumber,
        summary: item.summary,
        thesis: item.thesis,
        outcome: item.outcome,
        sourceName: item.sourceName,
        sourceUrl: null,
        // Explicitamente NÃO verificada: é conteúdo fictício de demonstração.
        verified: false,
        isDemo: true,
      },
    });
    await embedJurisprudence(created.id);
  }
}

async function createMemory(organizationId: string) {
  const existing = await prisma.orgMemoryItem.count({ where: { organizationId } });
  if (existing > 0) return;

  for (const item of DEMO_MEMORY) {
    const created = await prisma.orgMemoryItem.create({
      data: {
        organizationId,
        kind: item.kind,
        title: item.title,
        content: item.content,
        tags: item.tags,
      },
    });
    await embedMemoryItem(created.id);
  }
}

main()
  .catch((err) => {
    console.error('\n✖ Seed falhou:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
