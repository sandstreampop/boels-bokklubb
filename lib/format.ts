const sv = (() => {
  try {
    return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
})();

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (sv) return sv.format(d).replace('.', '');
  return `${d.getDate()}/${d.getMonth() + 1} ${d.getFullYear()}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
