import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/session';
import { listDocuments } from '@/server/documents';
import { serialize } from '@/server/serialize';
import { PageBody, PageHeader } from '@/components/page-header';
import { Badge, Card, EmptyState, Table, Td, Th } from '@/components/ui';
import { formatBytes, formatDate } from '@/lib/utils';
import { IconDocument, IconDownload } from '@/components/icons';
import { KIND_LABELS } from '@/lib/documents/classify';
import type { DocumentKind } from '@prisma/client';
import { DocumentSearch } from './search';

export const metadata: Metadata = { title: 'Documentos' };
export const dynamic = 'force-dynamic';

interface DocumentRow {
  id: string;
  title: string;
  kind: string;
  status: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  createdAt: string;
  documentDate: string | null;
  processingError: string | null;
  process: { id: string; number: string } | null;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  INDEXED: 'success',
  FAILED: 'danger',
  PENDING: 'warning',
  EXTRACTING: 'warning',
  NEEDS_OCR: 'warning',
  CHUNKING: 'warning',
  EMBEDDING: 'warning',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Na fila',
  EXTRACTING: 'Extraindo',
  NEEDS_OCR: 'OCR',
  CHUNKING: 'Indexando',
  EMBEDDING: 'Embeddings',
  INDEXED: 'Indexado',
  FAILED: 'Falhou',
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const ctx = await requirePermission('document:read');
  const params = await searchParams;

  const result = await listDocuments(ctx.organization.id, {
    q: params.q,
    page: Number(params.page ?? 1) || 1,
    pageSize: 40,
  });
  const items = serialize<DocumentRow[]>(result.items);

  return (
    <PageBody>
      <PageHeader
        title="Documentos"
        description={`${result.total} documento(s) indexado(s) neste escritório. Todo acesso é autenticado e registrado na auditoria.`}
      />

      <div className="mt-6">
        <DocumentSearch initialQuery={params.q ?? ''} />
      </div>

      <Card className="mt-4 overflow-hidden">
        {items.length === 0 ? (
          <EmptyState
            icon={<IconDocument className="size-5" />}
            title="Nenhum documento encontrado"
            description="Envie documentos a partir da tela de um processo."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Documento</Th>
                <Th>Processo</Th>
                <Th>Tipo</Th>
                <Th>Data</Th>
                <Th>Páginas</Th>
                <Th>Tamanho</Th>
                <Th>Situação</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {items.map((doc) => (
                <tr key={doc.id} className="transition-colors hover:bg-[var(--bg-subtle)]">
                  <Td className="max-w-[300px]">
                    <p className="truncate text-[13.5px] font-medium">{doc.title}</p>
                  </Td>
                  <Td>
                    {doc.process ? (
                      <Link
                        href={`/processos/${doc.process.id}?aba=documentos`}
                        className="font-mono text-[12px] text-[var(--accent)] hover:underline"
                      >
                        {doc.process.number}
                      </Link>
                    ) : (
                      <span className="text-[12.5px] text-[var(--text-subtle)]">Sem processo</span>
                    )}
                  </Td>
                  <Td>
                    <Badge>{KIND_LABELS[doc.kind as DocumentKind] ?? doc.kind}</Badge>
                  </Td>
                  <Td className="text-[12.5px] text-[var(--text-muted)]">
                    {formatDate(doc.documentDate ?? doc.createdAt)}
                  </Td>
                  <Td className="text-[12.5px]">{doc.pageCount || '—'}</Td>
                  <Td className="text-[12.5px] text-[var(--text-muted)]">
                    {formatBytes(doc.sizeBytes)}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[doc.status] ?? 'neutral'}>
                      {STATUS_LABEL[doc.status] ?? doc.status}
                    </Badge>
                  </Td>
                  <Td>
                    <a
                      href={`/api/documents/${doc.id}/content?download=1`}
                      className="inline-flex rounded p-1.5 text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
                      title="Baixar"
                    >
                      <IconDownload className="size-4" />
                    </a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </PageBody>
  );
}
