export interface DonutSlice {
  label: string;
  value: number;
  tone?: number;
  prev?: number;
}

interface DonutChartProps {
  title: string;
  slices: DonutSlice[];
  size?: number;
}

const SEG_MAX = 3;
const GLYPH_W = 1.0;
const EDGE = 3;

export default function DonutChart({ title, slices, size = 76 }: DonutChartProps) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  const ordered = [...slices].sort((a, b) => b.value - a.value);

  const stroke = Math.max(12, Math.round(size * 0.265));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const labelFs = Math.max(9, Math.round(size * 0.125));
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 2 : 0;

  const hasPrev = slices.some((s) => typeof s.prev === "number");
  const prevTotal = slices.reduce((n, s) => n + (s.prev ?? 0), 0);

  const segs: { key: string; tone: number; dash: number; offset: number }[] = [];
  const onBand: { key: string; x: number; y: number; text: string; delta: string | null }[] = [];
  let acc = 0;
  ordered.slice(0, SEG_MAX).forEach((s, i) => {
    if (total <= 0 || s.value <= 0) return;
    const f = s.value / total;
    const len = f * c;
    segs.push({ key: s.label, tone: s.tone ?? i + 1, dash: Math.max(0, len - gap), offset: -acc });
    const th = 2 * Math.PI * (acc / c + f / 2) - Math.PI / 2;
    const w = s.label.length * labelFs * GLYPH_W;
    const h = labelFs;
    const px = cx - r * Math.cos(th);
    const py = cx + r * Math.sin(th);
    const dPt = hasPrev && prevTotal > 0
      ? Math.round(f * 100) - Math.round(((s.prev ?? 0) / prevTotal) * 100)
      : 0;
    const below = dPt === 0 ? 0 : labelFs * 1.36;
    const fx = Math.min(Math.max(px, w / 2 + EDGE), size - w / 2 - EDGE);
    const fy = Math.min(Math.max(py, h / 2 + EDGE), size - h / 2 - EDGE - below);
    onBand.push({
      key: s.label, x: fx, y: fy, text: s.label,
      delta: dPt === 0 ? null : `${dPt > 0 ? "+" : ""}${dPt}`,
    });
    acc += len;
  });

  return (
    <div
      className="scr-donut"
      title={`${title} — ${ordered
        .map((s) => `${s.label} ${s.value}` + (total > 0 ? ` (${Math.round((s.value / total) * 100)}%)` : ""))
        .join(" / ")}`}
    >
      <svg className="scr-donut-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="scr-donut-track" cx={cx} cy={cx} r={r} strokeWidth={stroke} fill="none" />
        {segs.map((s) => (
          <circle
            key={s.key}
            className={`scr-donut-seg scr-donut-seg-${s.tone}`}
            cx={cx} cy={cx} r={r} strokeWidth={stroke} fill="none"
            strokeDasharray={`${s.dash} ${c - s.dash}`}
            strokeDashoffset={s.offset}
            transform={`translate(${size} 0) scale(-1 1) rotate(-90 ${cx} ${cx})`}
          />
        ))}
        {onBand.map((l) => (
          <text
            key={l.key} className="scr-donut-band-label"
            x={l.x} y={l.y} fontSize={labelFs}
            textAnchor="middle" dominantBaseline="central"
          >
            {l.text}
          </text>
        ))}
        {onBand.map((l) => (l.delta ? (
          <text
            key={`d-${l.key}`} className="scr-donut-band-delta"
            x={l.x} y={l.y + labelFs * 0.95} fontSize={labelFs * 0.82}
            textAnchor="middle" dominantBaseline="central"
          >
            {l.delta}
          </text>
        ) : null))}
      </svg>
    </div>
  );
}
