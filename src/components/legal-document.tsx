import type { ReactNode } from 'react';

export function LegalDocument({
  title,
  updatedAt,
  intro,
  children,
}: {
  title: string;
  updatedAt: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-subtle)]">
        {updatedAt}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-5 text-[15px] leading-relaxed text-[var(--text-muted)]">{intro}</p>
      <div className="mt-10 space-y-9">{children}</div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[14.5px] leading-relaxed text-[var(--text-muted)] [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-[var(--text)] [&_ul]:space-y-2">
        {children}
      </div>
    </section>
  );
}
