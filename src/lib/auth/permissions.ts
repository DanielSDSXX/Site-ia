import { Role } from '@prisma/client';

/**
 * Controle de acesso por papel dentro da organização.
 *
 * OWNER/ADMIN  -> acesso total ao escritório
 * LAWYER       -> opera processos, documentos e análises
 * ASSISTANT    -> tarefas, documentos e prazos; não dispara análises de IA
 * VIEWER       -> somente leitura
 */

export const PERMISSIONS = [
  'process:read',
  'process:write',
  'process:delete',
  'document:read',
  'document:upload',
  'document:delete',
  'analysis:read',
  'analysis:run',
  'chat:use',
  'task:read',
  'task:write',
  'deadline:read',
  'deadline:write',
  'client:read',
  'client:write',
  'report:generate',
  'jurisprudence:read',
  'jurisprudence:write',
  'memory:read',
  'memory:write',
  'team:read',
  'team:manage',
  'billing:read',
  'billing:manage',
  'org:settings',
  'audit:read',
  'usage:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY: Permission[] = [
  'process:read',
  'document:read',
  'analysis:read',
  'task:read',
  'deadline:read',
  'client:read',
  'jurisprudence:read',
  'memory:read',
  'team:read',
];

const ASSISTANT: Permission[] = [
  ...READ_ONLY,
  'document:upload',
  'task:write',
  'deadline:write',
  'chat:use',
  'report:generate',
];

const LAWYER: Permission[] = [
  ...ASSISTANT,
  'process:write',
  'document:delete',
  'analysis:run',
  'client:write',
  'jurisprudence:write',
  'memory:write',
  'usage:read',
];

const ADMIN: Permission[] = [
  ...LAWYER,
  'process:delete',
  'team:manage',
  'billing:read',
  'org:settings',
  'audit:read',
];

const OWNER: Permission[] = [...ADMIN, 'billing:manage'];

const MATRIX: Record<Role, Permission[]> = {
  VIEWER: READ_ONLY,
  ASSISTANT,
  LAWYER,
  ADMIN,
  OWNER,
};

export function permissionsFor(role: Role): Permission[] {
  return MATRIX[role] ?? [];
}

export function can(role: Role, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  LAWYER: 'Advogado',
  ASSISTANT: 'Assistente',
  VIEWER: 'Visualizador',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: 'Acesso total, incluindo assinatura e exclusão do escritório.',
  ADMIN: 'Acesso total à operação, equipe e configurações.',
  LAWYER: 'Cria e opera processos, documentos e análises de IA.',
  ASSISTANT: 'Envia documentos e gerencia tarefas e prazos.',
  VIEWER: 'Somente leitura.',
};
