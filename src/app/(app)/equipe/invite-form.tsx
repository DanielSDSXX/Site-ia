'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, ErrorNotice, Button } from '@/components/ui';
import { apiPost } from '@/lib/client/api-client';
import type { Role } from '@prisma/client';
import { ROLE_LABELS } from '@/lib/auth/permissions';

interface InviteFormProps {
  onClose: () => void;
}

export function InviteForm({ onClose }: InviteFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('LAWYER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiPost('/api/team/invite', {
        email: email.toLowerCase().trim(),
        role,
      });

      if (!response.ok) {
        setError(response.message || 'Falha ao enviar convite');
        return;
      }

      setSuccess(true);
      setEmail('');
      
      // Fecha o formulário após 2 segundos
      setTimeout(() => {
        router.refresh();
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-md space-y-4 border-2 border-[var(--border)] p-6">
      <div>
        <h3 className="text-[15px] font-semibold">Convidar Membro</h3>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          Envie um convite por e-mail para adicionar um novo membro à sua equipe.
        </p>
      </div>

      {error && <ErrorNotice>{error}</ErrorNotice>}
      {success && (
        <div className="rounded bg-green-50 p-3 text-[13px] text-green-800">
          ✓ Convite enviado! O novo membro receberá um e-mail com o link para aceitar.
        </div>
      )}

      {!success && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="novo@exemplo.com"
              required
              disabled={loading}
              className="input text-[13px]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
              Perfil
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={loading}
              className="input w-full text-[13px]"
            >
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11.5px] text-[var(--text-muted)]">
              O perfil define quais recursos e ações o membro pode acessar.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              onClick={onClose}
              disabled={loading}
              variant="secondary"
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !email}
              className="flex-1"
            >
              {loading ? 'Enviando...' : 'Enviar Convite'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
