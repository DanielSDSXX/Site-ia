import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { can, permissionsFor, PERMISSIONS } from '@/lib/auth/permissions';

/**
 * O controle de acesso é a fronteira mais sensível do produto multi-tenant.
 * Estes testes fixam o contrato: quem pode o quê, e o que ninguém abaixo de
 * administrador pode.
 */
describe('matriz de permissões', () => {
  it('VIEWER só tem permissões de leitura', () => {
    for (const permission of permissionsFor(Role.VIEWER)) {
      expect(permission.endsWith(':read')).toBe(true);
    }
  });

  it('ASSISTANT envia documentos mas não dispara análises de IA', () => {
    expect(can(Role.ASSISTANT, 'document:upload')).toBe(true);
    expect(can(Role.ASSISTANT, 'task:write')).toBe(true);
    expect(can(Role.ASSISTANT, 'analysis:run')).toBe(false);
    expect(can(Role.ASSISTANT, 'process:write')).toBe(false);
  });

  it('LAWYER opera processos e análises, mas não gerencia a equipe', () => {
    expect(can(Role.LAWYER, 'process:write')).toBe(true);
    expect(can(Role.LAWYER, 'analysis:run')).toBe(true);
    expect(can(Role.LAWYER, 'team:manage')).toBe(false);
    expect(can(Role.LAWYER, 'process:delete')).toBe(false);
  });

  it('ADMIN gerencia a equipe mas não altera a assinatura', () => {
    expect(can(Role.ADMIN, 'team:manage')).toBe(true);
    expect(can(Role.ADMIN, 'billing:read')).toBe(true);
    expect(can(Role.ADMIN, 'billing:manage')).toBe(false);
  });

  it('OWNER tem todas as permissões declaradas', () => {
    for (const permission of PERMISSIONS) {
      expect(can(Role.OWNER, permission)).toBe(true);
    }
  });

  it('permissões crescem monotonicamente do VIEWER ao OWNER', () => {
    const chain = [Role.VIEWER, Role.ASSISTANT, Role.LAWYER, Role.ADMIN, Role.OWNER];
    for (let i = 1; i < chain.length; i++) {
      const lower = new Set(permissionsFor(chain[i - 1]));
      const higher = new Set(permissionsFor(chain[i]));
      for (const permission of lower) {
        expect(higher.has(permission)).toBe(true);
      }
      expect(higher.size).toBeGreaterThan(lower.size);
    }
  });
});
