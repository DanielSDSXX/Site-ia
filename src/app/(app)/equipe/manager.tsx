'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar, Card, ErrorNotice, Table, Td, Th, Button } from '@/components/ui';
import { apiDelete, apiPatch } from '@/lib/client/api-client';
import { relativeTime } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import type { Role } from '@prisma/client';
import type { MemberRow } from './page';
import { InviteForm } from './invite-form';

export function TeamManager({
  members,
  canManage,
  currentUserId,
}: {
  members: MemberRow[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const changeRole = async (membershipId: string, role: string) => {
    setError(null);
    const response = await apiPatch('/api/team', { membershipId, role });
    if (!response.ok) {
      setError(response.message);
      return;
    }
    router.refresh();
  };

  const remove = async (member: MemberRow) => {
    if (!confirm(`Remover ${member.user.name} do escritório?`)) return;
    setError(null);
    const response = await apiDelete(`/api/team?membershipId=${member.id}`);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {error && <ErrorNotice>{error}</ErrorNotice>}

      {canManage && (
        <div className="flex justify-end">
          {showInviteForm ? (
            <InviteForm onClose={() => setShowInviteForm(false)} />
          ) : (
            <Button onClick={() => setShowInviteForm(true)}>
              + Convidar Membro
            </Button>
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        <Table>
          <thead>
            <tr>
              <Th>Pessoa</Th>
              <Th>Perfil</Th>
              <Th>Último acesso</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="transition-colors hover:bg-[var(--bg-subtle)]">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={member.user.name} color={member.user.avatarColor} size={30} />
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium">
                        {member.user.name}
                        {member.user.id === currentUserId && (
                          <span className="ml-1.5 text-[11.5px] text-[var(--text-subtle)]">(você)</span>
                        )}
                      </p>
                      <p className="truncate text-[12px] text-[var(--text-subtle)]">
                        {member.user.email}
                      </p>
                    </div>
                  </div>
                </Td>
                <Td>
                  {canManage ? (
                    <select
                      value={member.role}
                      onChange={(event) => changeRole(member.id, event.target.value)}
                      className="input w-auto min-w-[150px] text-[12.5px]"
                      aria-label={`Perfil de ${member.user.name}`}
                    >
                      {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[13px]">{ROLE_LABELS[member.role as Role]}</span>
                  )}
                </Td>
                <Td className="text-[12.5px] text-[var(--text-muted)]">
                  {member.user.lastLoginAt
                    ? isHydrated
                      ? relativeTime(member.user.lastLoginAt)
                      : 'Recentemente'
                    : 'Nunca acessou'}
                </Td>
                <Td>
                  {canManage && member.user.id !== currentUserId && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => remove(member)}
                        className="rounded px-2 py-1 text-[12px] text-[var(--text-subtle)] transition-colors hover:text-[var(--risk-critical)]"
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
