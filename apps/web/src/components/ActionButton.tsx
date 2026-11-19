'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** POST naar een API-route en ververs de pagina; toont het serverbericht. */
export default function ActionButton({
  url,
  body,
  label,
  className,
  disabled,
  confirmText,
  testId,
}: {
  url: string;
  body?: unknown;
  label: string;
  className?: string;
  disabled?: boolean;
  confirmText?: string;
  testId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="row">
      <button
        className={className}
        disabled={disabled || busy}
        data-testid={testId}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setBusy(true);
          setMsg(null);
          try {
            const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
            const d = await r.json().catch(() => ({}));
            setMsg(r.ok ? (d.message ?? 'Gelukt') : (d.error ?? `Fout ${r.status}`));
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        {label}
      </button>
      {msg && <span className="small muted" role="status">{msg}</span>}
    </span>
  );
}
