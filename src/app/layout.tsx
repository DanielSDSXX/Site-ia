import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'LegalMind AI — Inteligência estratégica para seus processos',
    template: '%s · LegalMind AI',
  },
  description:
    'Plataforma de inteligência jurídica que transforma processos complexos em riscos, evidências, estratégias e próximas ações.',
  applicationName: 'LegalMind AI',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfd' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0d' },
  ],
  width: 'device-width',
  initialScale: 1,
};

/**
 * Script de tema aplicado antes da primeira pintura para não piscar branco
 * ao carregar em modo escuro.
 */
const THEME_SCRIPT = `
(function(){
  try {
    var stored = localStorage.getItem('lm-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (!stored && prefersDark)) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
