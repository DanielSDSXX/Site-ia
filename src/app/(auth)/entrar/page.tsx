import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage() {
  if (await getAuthContext()) redirect('/dashboard');

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
      <p className="mt-2 text-[14px] text-[var(--text-muted)]">
        Acesse o painel do seu escritório.
      </p>

      <div className="mt-8">
        <LoginForm />
      </div>

      <p className="mt-6 text-center text-[13.5px] text-[var(--text-muted)]">
        Não tem conta?{' '}
        <Link href="/criar-conta" className="font-medium text-[var(--accent)] hover:underline">
          Criar conta gratuita
        </Link>
      </p>
    </div>
  );
}
