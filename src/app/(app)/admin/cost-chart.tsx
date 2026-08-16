'use client';

import { useState } from 'react';
import { formatUsd } from '@/lib/utils';

/**
 * Gráfico de barras em SVG puro.
 *
 * Uma biblioteca de charts custaria ~100 KB no bundle para desenhar 30 barras.
 * Este componente faz o mesmo trabalho em SVG e respeita os tokens de tema.
 */
export function CostChart({ data }: { data: { day: string; cost: number; calls: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-[var(--text-subtle)]">
        Nenhum consumo de IA registrado no período.
      </p>
    );
  }

  const max = Math.max(...data.map((point) => point.cost), 0.0001);
  const width = 100;
  const height = 30;
  const gap = 0.6;
  const barWidth = width / data.length - gap;

  const active = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] text-[var(--text-muted)]">
          {active ? (
            <>
              <span className="font-medium text-[var(--text)]">
                {new Date(`${active.day}T12:00:00Z`).toLocaleDateString('pt-BR')}
              </span>{' '}
              · {formatUsd(active.cost)} · {active.calls} chamada(s)
            </>
          ) : (
            <>Passe o cursor sobre uma barra para ver o dia</>
          )}
        </p>
        <p className="text-[12px] text-[var(--text-subtle)]">Pico: {formatUsd(max)}</p>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="mt-3 h-36 w-full"
        role="img"
        aria-label="Custo diário de IA nos últimos 30 dias"
      >
        {data.map((point, index) => {
          const barHeight = Math.max((point.cost / max) * height, point.cost > 0 ? 0.6 : 0.2);
          return (
            <rect
              key={point.day}
              x={index * (barWidth + gap)}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              rx={0.4}
              fill={hover === index ? 'var(--accent-hover)' : 'var(--accent)'}
              opacity={hover === null || hover === index ? 1 : 0.45}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>

      <div className="mt-1.5 flex justify-between text-[10.5px] text-[var(--text-subtle)]">
        <span>{new Date(`${data[0].day}T12:00:00Z`).toLocaleDateString('pt-BR')}</span>
        <span>
          {new Date(`${data[data.length - 1].day}T12:00:00Z`).toLocaleDateString('pt-BR')}
        </span>
      </div>
    </div>
  );
}
