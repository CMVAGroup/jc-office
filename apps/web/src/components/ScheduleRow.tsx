'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ScheduleRow({ s, canEdit }: { s: { key: string; label: string; timeOfDay: string; enabled: boolean; timezone: string; weekdays: number[] }; canEdit: boolean }) {
  const router = useRouter();
  const [time, setTime] = useState(s.timeOfDay);
  const [enabled, setEnabled] = useState(s.enabled);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <tr>
      <td>{s.label}</td>
      <td>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!canEdit} aria-label={`Tijd ${s.label}`} />
      </td>
      <td>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!canEdit} aria-label={`${s.label} actief`} />
      </td>
      <td className="small">{s.timezone} · dagen {s.weekdays.join(',')}</td>
      <td>
        <button
          disabled={!canEdit}
          onClick={async () => {
            const r = await fetch('/api/settings/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: s.key, timeOfDay: time, enabled }) });
            const d = await r.json().catch(() => ({}));
            setMsg(r.ok ? 'Opgeslagen' : d.error);
            router.refresh();
          }}
        >
          Opslaan
        </button>
        {msg && <span className="small muted"> {msg}</span>}
      </td>
    </tr>
  );
}
