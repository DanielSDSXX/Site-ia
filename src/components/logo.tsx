/**
 * Marca do LegalMind AI.
 *
 * Conceito: uma página de processo cujas linhas viram um sinal ascendente —
 * o documento que se transforma em leitura. Sem balança, sem martelo, sem
 * clichê de escritório de advocacia.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="LegalMind AI">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M9 9.5h9M9 14h6.5"
        stroke="var(--accent-fg)"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M9 22.5l4.5-5 3.5 3L23 13"
        stroke="var(--accent-fg)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="13" r="2" fill="var(--accent-fg)" />
    </svg>
  );
}
