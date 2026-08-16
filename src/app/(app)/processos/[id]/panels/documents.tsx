'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorNotice, Table, Td, Th } from '@/components/ui';
import { UploadDropzone, type PendingFile } from '@/components/upload-dropzone';
import { useEvidenceViewer } from '@/components/evidence-viewer';
import { apiDelete, apiPost } from '@/lib/client/api-client';
import { formatBytes, formatDate } from '@/lib/utils';
import { IconDocument, IconDownload, IconEye, IconRefresh, IconUpload } from '@/components/icons';
import { KIND_LABELS } from '@/lib/documents/classify';
import type { DocumentKind } from '@prisma/client';
import type { ProcessDto } from '../types';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Na fila',
  EXTRACTING: 'Extraindo',
  NEEDS_OCR: 'OCR',
  CHUNKING: 'Indexando',
  EMBEDDING: 'Embeddings',
  INDEXED: 'Indexado',
  FAILED: 'Falhou',
};

export function DocumentsPanel({ process, canUpload }: { process: ProcessDto; canUpload: boolean }) {
  const router = useRouter();
  const { open } = useEvidenceViewer();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(process.documents.length === 0);

  const upload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);

    const body = new FormData();
    for (const item of files) body.append('files', item.file);

    const response = await apiPost<{ errors?: { filename: string; message: string }[] }>(
      `/api/processes/${process.id}/documents`,
      body,
    );

    setUploading(false);

    if (!response.ok) {
      setError(response.message);
      return;
    }

    if (response.data.errors && response.data.errors.length > 0) {
      setError(
        response.data.errors.map((item) => `${item.filename}: ${item.message}`).join(' · '),
      );
    }

    setFiles([]);
    router.refresh();
  };

  const reprocess = async (documentId: string) => {
    await apiPost(`/api/documents/${documentId}/reprocess`);
    router.refresh();
  };

  const remove = async (documentId: string, title: string) => {
    if (!confirm(`Excluir "${title}"? O arquivo será removido do armazenamento e os trechos indexados serão apagados.`)) {
      return;
    }
    await apiDelete(`/api/documents/${documentId}`);
    router.refresh();
  };

  return (
    <div className="space-y-5">
      {canUpload && (
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setShowUpload((value) => !value)}
            className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[var(--bg-subtle)]"
          >
            <span className="flex items-center gap-2.5">
              <IconUpload className="size-4.5 text-[var(--text-muted)]" />
              <span className="text-[15px] font-semibold">Enviar documentos</span>
            </span>
            <span className="text-[12.5px] text-[var(--text-subtle)]">
              {showUpload ? 'Ocultar' : 'Mostrar'}
            </span>
          </button>

          {showUpload && (
            <div className="border-t border-[var(--border)] p-5">
              {error && (
                <div className="mb-4">
                  <ErrorNotice>{error}</ErrorNotice>
                </div>
              )}
              <UploadDropzone files={files} onChange={setFiles} compact />
              {files.length > 0 && (
                <div className="mt-4 flex justify-end">
                  <Button variant="primary" onClick={upload} loading={uploading}>
                    Enviar {files.length} arquivo(s)
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        {process.documents.length === 0 ? (
          <EmptyState
            icon={<IconDocument className="size-5" />}
            title="Nenhum documento enviado"
            description="A inteligência da plataforma depende inteiramente do texto dos autos."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Documento</Th>
                <Th>Tipo</Th>
                <Th>Data</Th>
                <Th>Páginas</Th>
                <Th>Tamanho</Th>
                <Th>Situação</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {process.documents.map((doc) => {
                const meta = doc.metadata as { pagesWithoutText?: number; ocrPages?: number };
                const withoutText = meta?.pagesWithoutText ?? 0;

                return (
                  <tr key={doc.id} className="transition-colors hover:bg-[var(--bg-subtle)]">
                    <Td className="max-w-[280px]">
                      <p className="truncate text-[13.5px] font-medium">{doc.title}</p>
                      {withoutText > 0 && (
                        <p className="mt-0.5 text-[11.5px] text-[var(--risk-medium)]">
                          {withoutText} página(s) sem texto — não analisadas
                        </p>
                      )}
                      {doc.processingError && (
                        <p className="mt-0.5 text-[11.5px] text-[var(--risk-critical)]">
                          Falha no processamento
                        </p>
                      )}
                    </Td>
                    <Td>
                      <Badge>{KIND_LABELS[doc.kind as DocumentKind] ?? doc.kind}</Badge>
                    </Td>
                    <Td className="text-[12.5px] text-[var(--text-muted)]">
                      {doc.documentDate ? formatDate(doc.documentDate) : formatDate(doc.createdAt)}
                    </Td>
                    <Td className="text-[12.5px]">{doc.pageCount || '—'}</Td>
                    <Td className="text-[12.5px] text-[var(--text-muted)]">
                      {formatBytes(doc.sizeBytes)}
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          doc.status === 'INDEXED'
                            ? 'success'
                            : doc.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {STATUS_LABELS[doc.status] ?? doc.status}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        {doc.mimeType === 'application/pdf' && (
                          <button
                            type="button"
                            onClick={() =>
                              open({ documentId: doc.id, documentTitle: doc.title, pageNumber: 1 })
                            }
                            className="rounded p-1.5 text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--accent)]"
                            title="Abrir no visualizador"
                          >
                            <IconEye className="size-4" />
                          </button>
                        )}
                        <a
                          href={`/api/documents/${doc.id}/content?download=1`}
                          className="rounded p-1.5 text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
                          title="Baixar"
                        >
                          <IconDownload className="size-4" />
                        </a>
                        {canUpload && (
                          <>
                            <button
                              type="button"
                              onClick={() => reprocess(doc.id)}
                              className="rounded p-1.5 text-[var(--text-subtle)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
                              title="Reprocessar"
                            >
                              <IconRefresh className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(doc.id, doc.title)}
                              className="rounded px-2 py-1.5 text-[11.5px] text-[var(--text-subtle)] transition-colors hover:text-[var(--risk-critical)]"
                              title="Excluir"
                            >
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
