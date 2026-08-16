import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlanTier, Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { changePassword, deleteAccount, exportUserData, registerAccount } from '@/server/accounts';
import { verifyPassword } from '@/lib/auth/password';
import { creditBalance } from '@/lib/ai/usage';
import { assertProcessQuota, assertUserQuota, quotaSnapshot } from '@/server/quota';
import { changeMemberRole, removeMember } from '@/server/workspace';
import { QuotaExceededError, ValidationError } from '@/lib/errors';
import { createTestOrganization, resetDatabase } from './helpers';

/** Cadastro, senha, limites de plano e ciclo de vida da conta. */

beforeAll(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('cadastro', () => {
  it('cria usuário, escritório, associação e assinatura Free em uma transação', async () => {
    const { user, organization } = await registerAccount({
      name: 'Ana Ribeiro',
      email: 'ana@escritorio.local',
      password: 'Marlim-Azul-8271',
      organizationName: 'Ribeiro & Associados',
      acceptedTerms: true,
    });

    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: user.id, organizationId: organization.id },
    });
    expect(membership.role).toBe(Role.OWNER);

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId: organization.id },
      include: { plan: true },
    });
    expect(subscription.plan.tier).toBe(PlanTier.FREE);

    // Créditos iniciais do plano são concedidos no cadastro.
    expect(await creditBalance(organization.id)).toBe(subscription.plan.monthlyCredits);
  });

  it('armazena a senha apenas como hash', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ana@escritorio.local' } });
    expect(user.passwordHash).not.toContain('Marlim-Azul-8271');
    expect(user.passwordHash.startsWith('$2')).toBe(true);
    expect(await verifyPassword('Marlim-Azul-8271', user.passwordHash)).toBe(true);
    expect(await verifyPassword('Marlim-Azul-0000', user.passwordHash)).toBe(false);
  });

  it('recusa e-mail já cadastrado', async () => {
    await expect(
      registerAccount({
        name: 'Outro',
        email: 'ana@escritorio.local',
        password: 'Bussola-Verde-6612',
        organizationName: 'Outro Escritório',
        acceptedTerms: true,
      }),
    ).rejects.toThrow(/já existe uma conta/i);
  });

  it('recusa senha fraca', async () => {
    await expect(
      registerAccount({
        name: 'Fraco',
        email: 'fraco@escritorio.local',
        password: 'senha123',
        organizationName: 'Escritório Fraco',
        acceptedTerms: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('gera slug único quando dois escritórios têm o mesmo nome', async () => {
    const first = await registerAccount({
      name: 'Um',
      email: 'um@escritorio.local',
      password: 'Marlim-Azul-8271',
      organizationName: 'Escritório Igual',
      acceptedTerms: true,
    });
    const second = await registerAccount({
      name: 'Dois',
      email: 'dois@escritorio.local',
      password: 'Marlim-Azul-8271',
      organizationName: 'Escritório Igual',
      acceptedTerms: true,
    });

    expect(first.organization.slug).not.toBe(second.organization.slug);
  });
});

describe('troca de senha', () => {
  it('exige a senha atual correta', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'um@escritorio.local' } });
    await expect(changePassword(user.id, 'errada', 'nova-senha-2026')).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('troca a senha e revoga as demais sessões', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'um@escritorio.local' } });

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: 'hash-de-sessao-antiga',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await changePassword(user.id, 'Marlim-Azul-8271', 'Corvo-Prata-4419');

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword('Corvo-Prata-4419', updated.passwordHash)).toBe(true);

    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
  });
});

describe('limites de plano', () => {
  it('bloqueia a criação de processo acima do limite do plano Free', async () => {
    const { organization } = await registerAccount({
      name: 'Limite',
      email: 'limite@escritorio.local',
      password: 'Marlim-Azul-8271',
      organizationName: 'Escritório Limitado',
      acceptedTerms: true,
    });

    // Plano Free permite 2 processos.
    for (let i = 0; i < 2; i++) {
      await assertProcessQuota(organization.id);
      await prisma.process.create({
        data: { organizationId: organization.id, number: `000000${i}-00.2026.8.09.0051` },
      });
    }

    await expect(assertProcessQuota(organization.id)).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('bloqueia adicionar usuário acima do limite', async () => {
    const organization = await prisma.organization.findFirstOrThrow({
      where: { slug: 'escritorio-limitado' },
    });
    await expect(assertUserQuota(organization.id)).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('reporta uso corrente frente ao plano', async () => {
    const organization = await prisma.organization.findFirstOrThrow({
      where: { slug: 'escritorio-limitado' },
    });
    const snapshot = await quotaSnapshot(organization.id);

    expect(snapshot.usage.processes).toBe(2);
    expect(snapshot.usage.users).toBe(1);
    expect(snapshot.plan.maxProcesses).toBe(2);
  });
});

describe('governança da equipe', () => {
  it('impede rebaixar o último proprietário do escritório', async () => {
    const org = await createTestOrganization('Governança');
    const membership = await prisma.membership.findFirstOrThrow({
      where: { organizationId: org.organizationId, role: Role.OWNER },
    });

    await expect(
      changeMemberRole(org.organizationId, membership.id, 'LAWYER'),
    ).rejects.toThrow(/ao menos um proprietário/i);
  });

  it('impede remover o último proprietário', async () => {
    const org = await createTestOrganization('Governança 2');
    const membership = await prisma.membership.findFirstOrThrow({
      where: { organizationId: org.organizationId, role: Role.OWNER },
    });

    await expect(removeMember(org.organizationId, membership.id)).rejects.toThrow(
      /ao menos um proprietário/i,
    );
  });

  it('permite rebaixar um proprietário quando há outro', async () => {
    const org = await createTestOrganization('Governança 3');
    const second = await prisma.user.create({
      data: { email: 'segundo-dono@teste.local', name: 'Segundo', passwordHash: 'x' },
    });
    const membership = await prisma.membership.create({
      data: { userId: second.id, organizationId: org.organizationId, role: Role.OWNER },
    });

    const updated = await changeMemberRole(org.organizationId, membership.id, 'ADMIN');
    expect(updated.role).toBe(Role.ADMIN);
  });
});

describe('direitos do titular (LGPD)', () => {
  it('exporta os dados do usuário em formato legível', async () => {
    const org = await createTestOrganization('Exportação');
    const data = await exportUserData(org.userId, org.organizationId);

    expect(data.user?.id).toBe(org.userId);
    expect(Array.isArray(data.processes)).toBe(true);
    expect(data.exportedAt).toBeTruthy();
  });

  it('anonimiza a conta na exclusão e encerra o escritório sem outro dono', async () => {
    const org = await createTestOrganization('Exclusão');
    await deleteAccount(org.userId);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: org.userId } });
    expect(user.deletedAt).not.toBeNull();
    expect(user.name).toBe('Usuário removido');
    expect(user.email).not.toContain('@teste.local');

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: org.organizationId },
    });
    expect(organization.deletedAt).not.toBeNull();
  });
});
