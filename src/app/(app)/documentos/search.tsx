'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { IconSearch } from '@/components/icons';

export function DocumentSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = query.trim();
        router.push(trimmed ? `/documentos?q=${encodeURIComponent(trimmed)}` : '/documentos');
      }}
      className="relative max-w-md"
    >
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por nome do documento ou arquivo"
        className="input pl-9"
      />
    </form>
  );
}
