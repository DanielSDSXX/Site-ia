import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/session';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Criar conta' };

export default async function RegisterPage() {
  if (await getAuthContext()) redirect('/dashboard');

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Criar conta</h1>
      <p className="mt-2 text-[14px] text-[var(--text-muted)]">
        Crie seu escritório e comece com o plano gratuito.
      </p>

      <div className="mt-8">
        <RegisterForm />
      </div>

      <p className="mt-6 text-center text-[13.5px] text-[var(--text-muted)]">
        Já tem conta?{' '}
        <Link href="/entrar" className="font-medium text-[var(--accent)] hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
