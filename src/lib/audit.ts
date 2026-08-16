import { prisma } from '@/lib/db';
import { logError } from '@/lib/errors';

export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.password_change'
  | 'org.create'
  | 'org.update'
  | 'org.switch'
  | 'member.invite'
  | 'member.role_change'
  | 'member.remove'
  | 'client.create'
  | 'client.update'
  | 'client.delete'
  | 'process.create'
  | 'process.update'
  | 'process.delete'
  | 'document.upload'
  | 'document.download'
  | 'document.delete'
  | 'analysis.run'
  | 'chat.message'
  | 'chat.delete'
  | 'report.generate'
  | 'task.create'
  | 'task.update'
  | 'deadline.create'
  | 'deadline.update'
  | 'memory.create'
  | 'memory.delete'
  | 'jurisprudence.import'
  | 'account.delete_request'
  | 'data.export';

interface AuditInput {
  action: AuditAction;
  organizationId?: string | null;
  userId?: string | null;
  resourceType?: string;
  resourceId?: string;
  ipHash?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Registro de auditoria. Falhas aqui nunca derrubam a operação principal —
 * um log perdido é preferível a uma ação de usuário abortada — mas são
 * reportadas no log de erros do servidor.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        ipHash: input.ipHash ?? null,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
        metadata: (input.metadata ?? {}) as object,
      },
    });
  } catch (err) {
    logError('audit', err, { action: input.action });
  }
}

export const AUDIT_LABELS: Record<string, string> = {
  'auth.register': 'Conta criada',
  'auth.login': 'Login',
  'auth.login_failed': 'Tentativa de login falhou',
  'auth.logout': 'Logout',
  'auth.password_change': 'Senha alterada',
  'org.create': 'Escritório criado',
  'org.update': 'Escritório atualizado',
  'org.switch': 'Troca de escritório',
  'member.invite': 'Convite enviado',
  'member.role_change': 'Perfil alterado',
  'member.remove': 'Membro removido',
  'client.create': 'Cliente criado',
  'client.update': 'Cliente atualizado',
  'client.delete': 'Cliente excluído',
  'process.create': 'Processo criado',
  'process.update': 'Processo atualizado',
  'process.delete': 'Processo excluído',
  'document.upload': 'Documento enviado',
  'document.download': 'Documento baixado',
  'document.delete': 'Documento excluído',
  'analysis.run': 'Análise executada',
  'chat.message': 'Mensagem no chat',
  'chat.delete': 'Conversa excluída',
  'report.generate': 'Relatório gerado',
  'task.create': 'Tarefa criada',
  'task.update': 'Tarefa atualizada',
  'deadline.create': 'Prazo criado',
  'deadline.update': 'Prazo atualizado',
  'memory.create': 'Item de memória criado',
  'memory.delete': 'Item de memória excluído',
  'jurisprudence.import': 'Jurisprudência importada',
  'account.delete_request': 'Exclusão de conta solicitada',
  'data.export': 'Exportação de dados',
};
