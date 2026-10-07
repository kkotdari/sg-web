export default function Delta({ now, prev, digits = 0, unit = "" }: {
  now: number | null | undefined;
  prev: number | null | undefined;
  digits?: number;
  unit?: string;
}) {
  if (prev === undefined) return null;
  const d = typeof now === "number" && typeof prev === "number" ? now - prev : null;
  const text = d === null ? null : d.toFixed(digits);
  if (text === null || Number(text) === 0) {
    return <span className="scr-stat-delta scr-stat-delta-none">-</span>;
  }
  return (
    <span className="scr-stat-delta">{d! > 0 ? `+${text}` : text}{unit}</span>
  );
}
