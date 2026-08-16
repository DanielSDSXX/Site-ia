'use client';

import { Badge, Card, EmptyState, Table, Td, Th } from '@/components/ui';
import { IconUsers } from '@/components/icons';
import type { ProcessDto } from '../types';

const ROLE_LABEL: Record<string, string> = {
  PLAINTIFF: 'Autor / requerente',
  DEFENDANT: 'Réu / requerido',
  THIRD_PARTY: 'Terceiro interessado',
  PROSECUTOR: 'Ministério Público',
  JUDGE: 'Juízo',
  LAWYER: 'Advogado',
  EXPERT: 'Perito',
  WITNESS: 'Testemunha',
  OTHER: 'Outro',
};

export function PartiesPanel({ process }: { process: ProcessDto }) {
  if (process.parties.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<IconUsers className="size-5" />}
          title="Nenhuma parte cadastrada"
          description="As partes podem ser cadastradas manualmente ou identificadas pela análise inicial dos documentos."
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <thead>
          <tr>
            <Th>Nome</Th>
            <Th>Qualificação</Th>
            <Th>Posição</Th>
            <Th>Advogado</Th>
            <Th>OAB</Th>
          </tr>
        </thead>
        <tbody>
          {process.parties.map((party) => (
            <tr key={party.id}>
              <Td className="text-[13.5px] font-medium">{party.name}</Td>
              <Td className="text-[13px] text-[var(--text-muted)]">
                {ROLE_LABEL[party.role] ?? party.role}
              </Td>
              <Td>
                <Badge tone={party.side === 'OURS' ? 'accent' : party.side === 'OPPOSING' ? 'danger' : 'neutral'}>
                  {party.side === 'OURS'
                    ? 'Nosso cliente'
                    : party.side === 'OPPOSING'
                      ? 'Parte contrária'
                      : 'Neutro'}
                </Badge>
              </Td>
              <Td className="text-[13px] text-[var(--text-muted)]">{party.lawyerName ?? '—'}</Td>
              <Td className="text-[13px] text-[var(--text-muted)]">{party.oabNumber ?? '—'}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <p className="border-t border-[var(--border)] px-5 py-3 text-[11.5px] leading-relaxed text-[var(--text-subtle)]">
        Identificar corretamente qual parte é o seu cliente é o que permite às análises saber o que
        defender e o que atacar. Documentos de identificação (CPF/CNPJ) só são armazenados quando
        você os informa explicitamente.
      </p>
    </Card>
  );
}
