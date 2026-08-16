import type { Permission } from '@/lib/auth/permissions';

export interface NavItem {
  href: string;
  label: string;
  icon:
    | 'dashboard'
    | 'process'
    | 'document'
    | 'brain'
    | 'calendar'
    | 'task'
    | 'scale'
    | 'report'
    | 'briefcase'
    | 'users'
    | 'settings';
  permission?: Permission;
  group: 'principal' | 'inteligencia' | 'operacao' | 'escritorio';
}

/**
 * Navegação lateral. A ordem reflete a frequência de uso real: o advogado
 * abre a plataforma para ver o que precisa de atenção, não para configurar.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', group: 'principal' },
  { href: '/processos', label: 'Processos', icon: 'process', permission: 'process:read', group: 'principal' },
  { href: '/documentos', label: 'Documentos', icon: 'document', permission: 'document:read', group: 'principal' },

  { href: '/inteligencia', label: 'Inteligência', icon: 'brain', permission: 'analysis:read', group: 'inteligencia' },
  { href: '/jurisprudencia', label: 'Jurisprudência', icon: 'scale', permission: 'jurisprudence:read', group: 'inteligencia' },
  { href: '/relatorios', label: 'Relatórios', icon: 'report', permission: 'report:generate', group: 'inteligencia' },

  { href: '/prazos', label: 'Prazos', icon: 'calendar', permission: 'deadline:read', group: 'operacao' },
  { href: '/tarefas', label: 'Tarefas', icon: 'task', permission: 'task:read', group: 'operacao' },

  { href: '/clientes', label: 'Clientes', icon: 'briefcase', permission: 'client:read', group: 'escritorio' },
  { href: '/equipe', label: 'Equipe', icon: 'users', permission: 'team:read', group: 'escritorio' },
  { href: '/configuracoes', label: 'Configurações', icon: 'settings', group: 'escritorio' },
];

export const GROUP_LABELS: Record<NavItem['group'], string> = {
  principal: '',
  inteligencia: 'Inteligência',
  operacao: 'Operação',
  escritorio: 'Escritório',
};
