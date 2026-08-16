import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { IconAlert, IconSpark } from './icons';

/** Kit de componentes base. Sem dependência externa de UI. */

// ---------------------------------------------------------------------------
// Botão
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] shadow-sm disabled:bg-[var(--border-strong)]',
  secondary:
    'bg-[var(--surface)] text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]',
  ghost: 'text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]',
  subtle: 'bg-[var(--accent-soft)] text-[var(--accent)] hover:brightness-95',
  danger: 'bg-[var(--risk-critical)] text-white hover:brightness-110',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9.5 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-60',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="size-3.5" />}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLAnchorElement>, 'children'>) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Superfícies
// ---------------------------------------------------------------------------

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 text-[var(--text-muted)]">{icon}</div>}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-[var(--text)]">{title}</h3>
          {description && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--text-muted)]">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)]">
        {children}
      </h2>
      {hint && <span className="text-[12px] text-[var(--text-subtle)]">{hint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selos
// ---------------------------------------------------------------------------

export type RiskLevelValue = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const RISK_STYLE: Record<RiskLevelValue, { bg: string; fg: string; label: string }> = {
  UNKNOWN: { bg: 'var(--risk-unknown-bg)', fg: 'var(--risk-unknown)', label: 'Não avaliado' },
  LOW: { bg: 'var(--risk-low-bg)', fg: 'var(--risk-low)', label: 'Risco baixo' },
  MEDIUM: { bg: 'var(--risk-medium-bg)', fg: 'var(--risk-medium)', label: 'Risco médio' },
  HIGH: { bg: 'var(--risk-high-bg)', fg: 'var(--risk-high)', label: 'Risco alto' },
  CRITICAL: { bg: 'var(--risk-critical-bg)', fg: 'var(--risk-critical)', label: 'Risco crítico' },
};

export function RiskBadge({
  level,
  score,
  compact,
}: {
  level: RiskLevelValue;
  score?: number | null;
  compact?: boolean;
}) {
  const style = RISK_STYLE[level] ?? RISK_STYLE.UNKNOWN;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
      style={{ background: style.bg, color: style.fg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: style.fg }} />
      {compact ? style.label.replace('Risco ', '') : style.label}
      {typeof score === 'number' && <span className="opacity-70">· {score}</span>}
    </span>
  );
}

const SEVERITY_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  LOW: { bg: 'var(--risk-low-bg)', fg: 'var(--risk-low)', label: 'Baixa' },
  MEDIUM: { bg: 'var(--risk-medium-bg)', fg: 'var(--risk-medium)', label: 'Média' },
  HIGH: { bg: 'var(--risk-critical-bg)', fg: 'var(--risk-critical)', label: 'Alta' },
};

export function SeverityBadge({ severity, prefix }: { severity: string; prefix?: string }) {
  const style = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.MEDIUM;
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: style.bg, color: style.fg }}
    >
      {prefix ? `${prefix} ` : ''}
      {style.label}
    </span>
  );
}

const CONFIDENCE_LABEL: Record<string, string> = {
  LOW: 'Confiança baixa',
  MEDIUM: 'Confiança média',
  HIGH: 'Confiança alta',
};

export function ConfidenceBadge({ confidence }: { confidence: string | null | undefined }) {
  if (!confidence) return null;
  const dots = confidence === 'HIGH' ? 3 : confidence === 'MEDIUM' ? 2 : 1;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
      title="Grau de confiança estimado desta resposta, considerando a quantidade e a qualidade das fontes citadas."
    >
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full"
            style={{ background: i < dots ? 'var(--accent)' : 'var(--border-strong)' }}
          />
        ))}
      </span>
      {CONFIDENCE_LABEL[confidence] ?? confidence}
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-[var(--bg-subtle)] text-[var(--text-muted)]',
    accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
    success: 'text-[var(--risk-low)]',
    warning: 'text-[var(--risk-medium)]',
    danger: 'text-[var(--risk-critical)]',
  } as const;
  const bgs = {
    neutral: '',
    accent: '',
    success: 'bg-[var(--risk-low-bg)]',
    warning: 'bg-[var(--risk-medium-bg)]',
    danger: 'bg-[var(--risk-critical-bg)]',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11.5px] font-medium',
        tones[tone],
        bgs[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--text-subtle)]">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-medium text-[var(--text)]">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-[var(--text-muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNotice({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-[13px] leading-relaxed"
      style={{ background: 'var(--risk-critical-bg)', color: 'var(--risk-critical)' }}
    >
      <IconAlert className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/**
 * Aviso de modo demonstração.
 *
 * Aparece sempre que uma saída foi produzida sem um modelo de linguagem
 * conectado. É requisito de produto: nunca apresentar verificação estrutural
 * como se fosse análise de IA.
 */
export function DemoNotice({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border border-dashed px-3.5 text-[12.5px] leading-relaxed',
        compact ? 'py-2' : 'py-3',
      )}
      style={{ borderColor: 'var(--risk-medium)', color: 'var(--risk-medium)' }}
    >
      <IconSpark className="mt-px size-4 shrink-0" />
      <span>
        <strong className="font-semibold">Modo demonstração.</strong> Nenhum modelo de linguagem está
        conectado. O resultado vem de verificação estrutural determinística dos documentos (datas,
        valores, alegações sem lastro, divergências entre peças) — útil, porém limitado. Configure{' '}
        <code className="font-mono text-[11.5px]">AI_PROVIDER</code> e a chave de API para a análise
        completa.
      </span>
    </div>
  );
}

export function InfoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--bg-subtle)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

// ---------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'whitespace-nowrap border-b border-[var(--border)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={cn('border-b border-[var(--border)] px-4 py-3 align-middle', className)}>
      {children}
    </td>
  );
}

export function Avatar({ name, color, size = 28 }: { name: string; color?: string; size?: number }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const text =
    parts.length === 0
      ? '?'
      : parts.length === 1
        ? parts[0].slice(0, 2).toUpperCase()
        : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: color ?? 'var(--accent)',
        fontSize: size * 0.36,
      }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}
