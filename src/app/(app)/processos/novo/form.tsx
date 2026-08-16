'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, CardHeader, ErrorNotice, InfoNotice } from '@/components/ui';
import { apiPost } from '@/lib/client/api-client';
import { UploadDropzone, type PendingFile } from '@/components/upload-dropzone';
import { formatProcessNumber, isValidProcessNumber } from '@/lib/utils';
import { IconPlus, IconClose } from '@/components/icons';

interface Party {
  name: string;
  role: string;
  side: string;
}

const ROLE_OPTIONS = [
  { value: 'PLAINTIFF', label: 'Autor / requerente' },
  { value: 'DEFENDANT', label: 'Réu / requerido' },
  { value: 'THIRD_PARTY', label: 'Terceiro interessado' },
  { value: 'PROSECUTOR', label: 'Ministério Público' },
  { value: 'EXPERT', label: 'Perito' },
  { value: 'WITNESS', label: 'Testemunha' },
  { value: 'OTHER', label: 'Outro' },
];

const SIDE_OPTIONS = [
  { value: 'OURS', label: 'Nosso cliente' },
  { value: 'OPPOSING', label: 'Parte contrária' },
  { value: 'NEUTRAL', label: 'Neutro' },
];

export function NewProcessForm({
  clients,
  members,
  currentUserId,
}: {
  clients: { id: string; name: string }[];
  members: { id: string; name: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [number, setNumber] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [parties, setParties] = useState<Party[]>([
    { name: '', role: 'PLAINTIFF', side: 'OURS' },
    { name: '', role: 'DEFENDANT', side: 'OPPOSING' },
  ]);

  const digits = number.replace(/\D/g, '');
  const numberWarning =
    digits.length === 20 && !isValidProcessNumber(number)
      ? 'O dígito verificador do padrão CNJ não confere. Revise o número antes de salvar.'
      : null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const caseValue = String(form.get('caseValue') ?? '').replace(/[^\d,.-]/g, '').replace(',', '.');

    const payload = {
      number: number.trim(),
      court: str(form.get('court')),
      district: str(form.get('district')),
      courtUnit: str(form.get('courtUnit')),
      procedureClass: str(form.get('procedureClass')),
      subject: str(form.get('subject')),
      clientId: str(form.get('clientId')),
      responsibleId: str(form.get('responsibleId')) ?? currentUserId,
      caseValueCents: caseValue ? Math.round(Number(caseValue) * 100) : null,
      notes: str(form.get('notes')),
      parties: parties
        .filter((party) => party.name.trim().length > 1)
        .map((party) => ({ name: party.name.trim(), role: party.role, side: party.side })),
    };

    const created = await apiPost<{ id: string }>('/api/processes', payload);
    if (!created.ok) {
      setError(created.message);
      setLoading(false);
      return;
    }

    // Upload dos documentos logo após a criação, na mesma ação do usuário.
    if (files.length > 0) {
      const body = new FormData();
      for (const item of files) body.append('files', item.file);

      const uploaded = await apiPost<{ documents: unknown[]; errors?: { filename: string; message: string }[] }>(
        `/api/processes/${created.data.id}/documents`,
        body,
      );

      if (!uploaded.ok) {
        // O processo já existe: levamos o usuário para lá com o aviso.
        router.push(`/processos/${created.data.id}?aviso=upload`);
        return;
      }
    }

    router.push(`/processos/${created.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && <ErrorNotice>{error}</ErrorNotice>}

      <Card>
        <CardHeader title="Identificação" description="O número é o único campo obrigatório." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="number">
              Número do processo *
            </label>
            <input
              id="number"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              onBlur={() => setNumber((value) => formatProcessNumber(value))}
              required
              className="input font-mono"
              placeholder="0000000-00.0000.0.00.0000"
            />
            {numberWarning && (
              <p className="mt-1.5 text-[12px] text-[var(--risk-medium)]">{numberWarning}</p>
            )}
          </div>

          <Field name="court" label="Tribunal" placeholder="TJGO" />
          <Field name="district" label="Comarca" placeholder="Goiânia" />
          <Field name="courtUnit" label="Vara" placeholder="3ª Vara Cível" />
          <Field name="procedureClass" label="Classe" placeholder="Procedimento Comum Cível" />
          <Field name="subject" label="Assunto" placeholder="Cobrança indevida / dano moral" />
          <Field name="caseValue" label="Valor da causa (R$)" placeholder="15000,00" />

          <div>
            <label className="label" htmlFor="clientId">
              Cliente
            </label>
            <select id="clientId" name="clientId" className="input">
              <option value="">Não vincular agora</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="responsibleId">
              Advogado responsável
            </label>
            <select id="responsibleId" name="responsibleId" className="input" defaultValue={currentUserId}>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">
              Observações internas
            </label>
            <textarea id="notes" name="notes" rows={3} className="input resize-y" />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Partes"
          description="Identificar de que lado está o seu cliente permite que a análise saiba o que defender."
          action={
            <Button
              type="button"
              size="sm"
              onClick={() => setParties((list) => [...list, { name: '', role: 'OTHER', side: 'NEUTRAL' }])}
            >
              <IconPlus className="size-3.5" />
              Adicionar
            </Button>
          }
        />
        <div className="space-y-3 p-5">
          {parties.map((party, index) => (
            <div key={index} className="flex gap-2">
              <input
                value={party.name}
                onChange={(event) =>
                  setParties((list) =>
                    list.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)),
                  )
                }
                placeholder="Nome da parte"
                className="input flex-1"
              />
              <select
                value={party.role}
                onChange={(event) =>
                  setParties((list) =>
                    list.map((item, i) => (i === index ? { ...item, role: event.target.value } : item)),
                  )
                }
                className="input w-auto min-w-[170px]"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={party.side}
                onChange={(event) =>
                  setParties((list) =>
                    list.map((item, i) => (i === index ? { ...item, side: event.target.value } : item)),
                  )
                }
                className="input w-auto min-w-[150px]"
              >
                {SIDE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setParties((list) => list.filter((_, i) => i !== index))}
                className="shrink-0 rounded-lg px-2 text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--risk-critical)]"
                aria-label="Remover parte"
              >
                <IconClose className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Documentos do processo"
          description="PDF, DOCX, TXT ou imagem. Você também pode enviar depois."
        />
        <div className="p-5">
          <UploadDropzone files={files} onChange={setFiles} />
          <div className="mt-4">
            <InfoNotice>
              Depois do envio a plataforma extrai o texto página a página, classifica as peças, cria o
              índice de busca e executa a análise inicial. Páginas digitalizadas sem camada de texto
              são identificadas — com OCR desativado, elas ficam marcadas como não lidas em vez de
              serem ignoradas em silêncio.
            </InfoNotice>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={loading}>
          {files.length > 0 ? `Criar e enviar ${files.length} arquivo(s)` : 'Criar processo'}
        </Button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  placeholder,
}: {
  name: string;
  label: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} className="input" placeholder={placeholder} />
    </div>
  );
}

function str(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}
