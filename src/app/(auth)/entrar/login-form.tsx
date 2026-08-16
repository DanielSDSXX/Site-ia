'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNotice } from '@/components/ui';
import { apiPost } from '@/lib/client/api-client';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const result = await apiPost('/api/auth/login', {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
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
        <label className="label" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          placeholder="voce@escritorio.com.br"
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
          autoComplete="current-password"
          required
          className="input"
          placeholder="••••••••••"
        />
      </div>

      <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
        Entrar
      </Button>
    </form>
  );
}
