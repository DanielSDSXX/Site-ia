'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, ErrorNotice } from '@/components/ui';
import { apiPost } from '@/lib/client/api-client';

/**
 * Cadastro de um entendimento no acervo.
 *
 * `sourceUrl` e `sourceName` são obrigatórios de propósito: é a regra que
 * impede o acervo de virar depósito de ementas não conferíveis. Sem link da
 * fonte, a decisão não entra.
 */
export function ImportJurisprudenceForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaving(true);

    const form = new FormData(event.currentTarget);
    const response = await apiPost('/api/jurisprudence', {
      court: String(form.get('court') ?? ''),
      judgingBody: String(form.get('judgingBody') ?? '') || null,
      caseNumber: String(form.get('caseNumber') ?? ''),
      judgmentDate: String(form.get('judgmentDate') ?? '') || null,
      reporter: String(form.get('reporter') ?? '') || null,
      summary: String(form.get('summary') ?? ''),
      thesis: String(form.get('thesis') ?? '') || null,
      outcome: String(form.get('outcome') ?? '') || null,
      excerpt: String(form.get('excerpt') ?? '') || null,
      sourceUrl: String(form.get('sourceUrl') ?? ''),
      sourceName: String(form.get('sourceName') ?? ''),
    });

    setSaving(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }
    onDone();
    router.refresh();
  };

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold">Cadastrar entendimento</h3>
      <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
        Cole a ementa e informe a URL oficial. A entrada é indexada para busca semântica e passa a
        aparecer nos resultados.
      </p>

      {error && (
        <div className="mt-3">
          <ErrorNotice>{error}</ErrorNotice>
        </div>
      )}

      <form onSubmit={create} className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field name="court" label="Tribunal *" required placeholder="TJGO" />
        <Field name="judgingBody" label="Órgão julgador" placeholder="3ª Câmara Cível" />
        <Field name="caseNumber" label="Número do processo *" required />
        <Field name="reporter" label="Relator" />
        <div>
          <label className="label" htmlFor="judgmentDate">
            Data do julgamento
          </label>
          <input id="judgmentDate" name="judgmentDate" type="date" className="input" />
        </div>
        <Field name="outcome" label="Resultado" placeholder="Provimento parcial" />

        <div className="sm:col-span-3">
          <label className="label" htmlFor="summary">
            Ementa *
          </label>
          <textarea id="summary" name="summary" required rows={4} className="input resize-y" />
        </div>

        <div className="sm:col-span-3">
          <label className="label" htmlFor="thesis">
            Tese firmada
          </label>
          <textarea id="thesis" name="thesis" rows={2} className="input resize-y" />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="sourceUrl">
            URL da fonte oficial *
          </label>
          <input
            id="sourceUrl"
            name="sourceUrl"
            type="url"
            required
            className="input"
            placeholder="https://..."
          />
        </div>
        <Field name="sourceName" label="Nome da fonte *" required placeholder="Portal do TJGO" />

        <div className="flex justify-end gap-2 sm:col-span-3">
          <Button type="button" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Cadastrar e indexar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Field({
  name,
  label,
  placeholder,
  required,
}: {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} className="input" placeholder={placeholder} required={required} />
    </div>
  );
}
