'use client';

import { useRef, useState } from 'react';
import { cn, formatBytes } from '@/lib/utils';
import { IconClose, IconDocument, IconUpload } from './icons';

export interface PendingFile {
  id: string;
  file: File;
}

const ACCEPTED = '.pdf,.docx,.txt,.png,.jpg,.jpeg';
const MAX_MB = 50;

export function UploadDropzone({
  files,
  onChange,
  compact,
}: {
  files: PendingFile[];
  onChange: (files: PendingFile[]) => void;
  compact?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const accepted: PendingFile[] = [];
    const problems: string[] = [];

    for (const file of Array.from(list)) {
      if (file.size > MAX_MB * 1024 * 1024) {
        problems.push(`${file.name} — maior que ${MAX_MB} MB`);
        continue;
      }
      if (file.size === 0) {
        problems.push(`${file.name} — arquivo vazio`);
        continue;
      }
      accepted.push({ id: `${file.name}-${file.size}-${file.lastModified}`, file });
    }

    setRejected(problems);
    const existing = new Set(files.map((item) => item.id));
    onChange([...files, ...accepted.filter((item) => !existing.has(item.id))]);
  };

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          add(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors',
          compact ? 'px-4 py-6' : 'px-6 py-10',
          dragging
            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
            : 'border-[var(--border-strong)] hover:border-[var(--accent)] hover:bg-[var(--bg-subtle)]',
        )}
      >
        <IconUpload className="size-5 text-[var(--text-subtle)]" />
        <p className="mt-3 text-[14px] font-medium">
          Arraste os arquivos ou clique para selecionar
        </p>
        <p className="mt-1 text-[12.5px] text-[var(--text-subtle)]">
          PDF, DOCX, TXT, PNG ou JPEG · até {MAX_MB} MB por arquivo
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(event) => {
            add(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {rejected.length > 0 && (
        <ul className="mt-3 space-y-1 text-[12px] text-[var(--risk-critical)]">
          {rejected.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {files.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2"
            >
              <IconDocument className="size-4 shrink-0 text-[var(--text-subtle)]" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{item.file.name}</span>
              <span className="shrink-0 text-[11.5px] text-[var(--text-subtle)]">
                {formatBytes(item.file.size)}
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(files.filter((f) => f.id !== item.id));
                }}
                className="shrink-0 rounded p-1 text-[var(--text-subtle)] transition-colors hover:text-[var(--risk-critical)]"
                aria-label={`Remover ${item.file.name}`}
              >
                <IconClose className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
