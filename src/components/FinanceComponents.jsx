// ═══════════════════════════════════════════════════════════
// INVERSIONISTA PRO v4 — FINANCE COMPONENTS
// TrendChart · AlertPanel · DonutChart
// ═══════════════════════════════════════════════════════════

const MONO = "'JetBrains Mono', monospace";
const CIRC = 2 * Math.PI * 15.9; // ≈ 99.9

// ── TREND CHART (SVG Sparkline liviano) ──────────────────
export const TrendChart = ({ data, color = '#4fc3f7', w = 80, h = 28 }) => {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const r = mx - mn || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / r) * (h - 6) - 3}`)
    .join(' ');
  const lastY = h - ((data[data.length - 1] - mn) / r) * (h - 6) - 3;
  const trend = data[data.length - 1] >= data[0];
  const strokeColor = color === 'auto' ? (trend ? '#00e676' : '#ff5252') : color;
  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`g${w}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={pts}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={(data.length - 1) / (data.length - 1) * w} cy={lastY} r="2" fill={strokeColor} />
    </svg>
  );
};

// ── ALERT PANEL (Cards con bordes neón según severidad) ──
const SEVERITY_STYLES = {
  high:   { border: '#ff5252', glow: 'rgba(255,82,82,0.15)',   bg: 'rgba(255,82,82,0.04)' },
  medium: { border: '#ffd740', glow: 'rgba(255,215,64,0.12)',  bg: 'rgba(255,215,64,0.03)' },
  low:    { border: '#00e676', glow: 'rgba(0,230,118,0.12)',   bg: 'rgba(0,230,118,0.03)' },
};
const TYPE_BORDER = {
  opportunity: { border: '#00e676', glow: 'rgba(0,230,118,0.15)', bg: 'rgba(0,230,118,0.04)' },
  warning: SEVERITY_STYLES.high,
  info: SEVERITY_STYLES.low,
};

export const AlertPanel = ({ alerts }) => {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 24 }}>
      {alerts.map(a => {
        const style = SEVERITY_STYLES[a.severity] || TYPE_BORDER[a.type] || SEVERITY_STYLES.low;
        return (
          <div
            key={a.id}
            style={{
              padding: '12px 16px',
              background: style.bg,
              border: `1px solid ${style.border}`,
              borderLeft: `3px solid ${style.border}`,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              boxShadow: `0 0 12px ${style.glow}`,
              transition: 'box-shadow 0.3s',
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1.2, flexShrink: 0 }}>{a.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, color: style.border, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {a.title}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 3, lineHeight: 1.4 }}>
                {a.msg}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── DONUT CHART (SVG dinámico para portafolios) ──────────
export const DonutChart = ({ allocations, size = 130, strokeWidth = 5 }) => {
  if (!allocations || allocations.length === 0) return null;
  let cumulative = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 42 42" style={{ display: 'block' }}>
      {/* Track background */}
      <circle
        cx="21" cy="21" r="15.9"
        fill="transparent"
        stroke="#1a202c"
        strokeWidth={strokeWidth}
      />
      {/* Segments */}
      <g transform="rotate(-90, 21, 21)">
        {allocations.map((seg, i) => {
          const arc = (seg.pct / 100) * CIRC;
          const offset = -(cumulative / 100) * CIRC;
          cumulative += seg.pct;
          return (
            <circle
              key={i}
              cx="21" cy="21" r="15.9"
              fill="transparent"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${arc} ${CIRC}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
              style={{ filter: `drop-shadow(0 0 3px ${seg.color}88)` }}
            />
          );
        })}
      </g>
      {/* Center label */}
      <text
        x="21" y="19.5"
        textAnchor="middle"
        style={{ fontFamily: MONO, fontSize: '4px', fill: '#ffffff99', fontWeight: 700 }}
      >
        PORTFOLIO
      </text>
      <text
        x="21" y="24"
        textAnchor="middle"
        style={{ fontFamily: MONO, fontSize: '3px', fill: '#ffffff40' }}
      >
        {allocations.length} clases
      </text>
    </svg>
  );
};

// ── RISK SCORE BAR ────────────────────────────────────────
export const RiskBar = ({ score, max = 10 }) => {
  const pct = (score / max) * 100;
  const color = score <= 3 ? '#00e676' : score <= 6 ? '#ffd740' : '#ff5252';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 4, background: '#1a202c', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, boxShadow: `0 0 6px ${color}88`, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 11, color, minWidth: 20 }}>{score}/{max}</span>
    </div>
  );
};
