'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNotice } from '@/components/ui';
import { apiPost } from '@/lib/client/api-client';
import { checkPasswordStrength } from '@/lib/auth/password-policy';

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');

  const strength = password ? checkPasswordStrength(password) : null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const result = await apiPost('/api/auth/register', {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      organizationName: String(form.get('organizationName') ?? ''),
      acceptedTerms: form.get('acceptedTerms') === 'on',
    });

    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <ErrorNotice>{error}</ErrorNotice>}

      <div>
        <label className="label" htmlFor="name">
          Seu nome
        </label>
        <input id="name" name="name" required className="input" placeholder="Ana Ribeiro" autoComplete="name" />
      </div>

      <div>
        <label className="label" htmlFor="organizationName">
          Nome do escritório
        </label>
        <input
          id="organizationName"
          name="organizationName"
          required
          className="input"
          placeholder="Ribeiro & Associados"
          autoComplete="organization"
        />
      </div>

      <div>
        <label className="label" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="input"
          placeholder="voce@escritorio.com.br"
          autoComplete="email"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={10}
          className="input"
          placeholder="Mínimo de 10 caracteres"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {strength && !strength.ok && (
          <ul className="mt-2 space-y-1 text-[12px] text-[var(--risk-medium)]">
            {strength.problems.map((problem) => (
              <li key={problem}>· {problem}</li>
            ))}
          </ul>
        )}
        {strength?.ok && (
          <p className="mt-2 text-[12px] text-[var(--risk-low)]">· Senha aceita.</p>
        )}
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
        <input
          type="checkbox"
          name="acceptedTerms"
          required
          className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
        />
        <span>
          Li e aceito os termos de uso e a política de privacidade, e confirmo que tenho autorização
          para tratar os documentos que enviar.
        </span>
      </label>

      <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
        Criar conta
      </Button>
    </form>
  );
}
