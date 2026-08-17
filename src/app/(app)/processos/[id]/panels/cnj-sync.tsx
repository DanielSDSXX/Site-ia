'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button } from '@/components/ui';
import { apiPost } from '@/lib/client/api-client';
import { IconAlert, IconTimeline } from '@/components/icons';

/**
 * Sincronização da linha do tempo com a API Pública do CNJ.
 *
 * Traz as movimentações oficiais do processo e as grava como eventos com
 * `isInferred = false` — registro do tribunal, não dedução da análise. Só o
 * que ainda não existe entra: reimportar não duplica.
 *
 * Fica aqui, na ficha do processo, porque é onde a pergunta nasce ("o que
 * aconteceu desde a última vez que olhei?"). Antes só existia na tela de
 * busca, o que obrigava a sair do processo para atualizá-lo.
 */

interface SyncResult {
  imported: number;
  skipped: number;
  statusChanged: string | null;
  caseNumber: string;
  index: string;
  situation: string;
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'ativo',
  SUSPENDED: 'suspenso',
  ARCHIVED: 'arquivado',
  CLOSED: 'encerrado',
};

export function CnjSyncButton({
  processId,
  caseNumber,
}: {
  processId: string;
  caseNumber: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sync = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    const response = await apiPost<SyncResult>('/api/datajud', {
      processId,
      caseNumber,
    });

    setLoading(false);
    if (!response.ok) {
      setError(response.message);
      return;
    }

    setResult(response.data);
    if (response.data.imported > 0) router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button type="button" size="sm" onClick={sync} loading={loading}>
        <IconTimeline className="size-3.5" />
        Sincronizar com o CNJ
      </Button>

      {result && (
        <span className="flex flex-wrap items-center gap-2 text-[12.5px]">
          {result.imported > 0 ? (
            <span style={{ color: 'var(--risk-low)' }}>
              {result.imported} movimentação(ões) nova(s).
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">Nenhuma movimentação nova.</span>
          )}

          <Badge>Situação no CNJ: {result.situation}</Badge>

          {result.statusChanged && (
            <Badge tone="warning">
              Processo marcado como {STATUS_LABEL[result.statusChanged] ?? result.statusChanged}
            </Badge>
          )}
        </span>
      )}

      {error && (
        <span
          className="flex items-start gap-1.5 text-[12.5px] leading-relaxed"
          style={{ color: 'var(--risk-medium)' }}
        >
          <IconAlert className="mt-px size-3.5 shrink-0" />
          {error}
        </span>
      )}
    </div>
  );
}
