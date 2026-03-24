// ── Simulador: Plazo Fijo vs Money Market vs Inflación ───────────────
// Componentes visuales puros. Toda la lógica vive en useSimuladorData.

// ── Helper local (evita importar desde App) ───────────────────────────
const fmt = (v) =>
  v == null || isNaN(v)
    ? "—"
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: 2,
      }).format(v);

// ── Estilos compartidos del simulador ────────────────────────────────
const SS = {
  card:     { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "16px 18px" },
  lbl:      { fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 },
  secT:     { fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 },
  input:    { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 18, fontFamily: "var(--mono)", fontWeight: 700, outline: "none", width: "100%", marginTop: 4 },
  chip:     { fontSize: 12, padding: "5px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, color: "rgba(255,255,255,0.6)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" },
  chipOn:   { background: "rgba(79,195,247,0.1)", borderColor: "rgba(79,195,247,0.3)", color: "#4fc3f7" },
  mono:     { fontFamily: "var(--mono)", fontWeight: 600 },
  divider:  { marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" },
};

// ════════════════════════════════════════════════════════════════════
// SimChart — Gráfico SVG de curvas de evolución del capital
// ════════════════════════════════════════════════════════════════════
function SimChart({ data }) {
  if (!data || data.length < 2) return null;

  const W = 600, H = 180;
  const PAD = { t: 12, r: 12, b: 28, l: 68 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const allVals = data.flatMap(d => [d.pf, d.mm, d.infl]);
  const minV = Math.min(...allVals) * 0.998;
  const maxV = Math.max(...allVals) * 1.002;
  const rng   = maxV - minV || 1;

  const xS = i => PAD.l + (i / (data.length - 1)) * cW;
  const yS = v => PAD.t + cH - ((v - minV) / rng) * cH;
  const buildPath = key =>
    data.map((d, i) => `${i === 0 ? "M" : "L"}${xS(i).toFixed(1)},${yS(d[key]).toFixed(1)}`).join(" ");

  const fmtAx = v =>
    v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B`
    : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M`
    : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K`
    : `$${v.toFixed(0)}`;

  const yTicks = [0, 0.33, 0.67, 1].map(f => ({ v: minV + f * rng, y: PAD.t + cH - f * cH }));
  const lastDay = data[data.length - 1]?.day || 1;
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    day: Math.round(f * lastDay),
    x: PAD.l + f * cW,
  }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {/* Grid + eje Y */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.l} y1={t.y} x2={W - PAD.r} y2={t.y}
            stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <text x={PAD.l - 5} y={t.y + 4} textAnchor="end"
            fontSize="9" fill="rgba(255,255,255,0.4)">{fmtAx(t.v)}</text>
        </g>
      ))}
      {/* Eje X */}
      {xTicks.map((t, i) => (
        <text key={i} x={t.x} y={H - 4} textAnchor="middle"
          fontSize="9" fill="rgba(255,255,255,0.35)">{t.day}d</text>
      ))}
      {/* Curvas: inflación primero (queda detrás) */}
      <path d={buildPath("infl")} fill="none" stroke="#ff5252"
        strokeWidth="1.5" strokeDasharray="5,3" strokeOpacity="0.65" />
      <path d={buildPath("pf")}   fill="none" stroke="#ffd740" strokeWidth="2" />
      <path d={buildPath("mm")}   fill="none" stroke="#4fc3f7" strokeWidth="2" />
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════
// SimInputs — 5 cards de parámetros editables
// ════════════════════════════════════════════════════════════════════
function SimInputs({ sim, setSim, inflacionData, benchmarkTNA }) {
  const lastIPC = inflacionData?.[inflacionData.length - 1];

  const set = (key) => (e) => {
    const val = key === "plazo"
      ? Math.max(1, parseInt(e.target.value) || 1)
      : parseFloat(e.target.value) || 0;
    setSim(s => ({ ...s, [key]: val }));
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginBottom: 24 }}>

      {/* Capital */}
      <div style={SS.card}>
        <div style={SS.lbl}>Capital inicial (ARS)</div>
        <input type="number" value={sim.capital} onChange={set("capital")} style={SS.input} />
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {[100_000, 500_000, 1_000_000, 5_000_000, 10_000_000].map(v => (
            <button key={v}
              onClick={() => setSim(s => ({ ...s, capital: v }))}
              style={{ ...SS.chip, ...(sim.capital === v ? SS.chipOn : {}) }}>
              {v >= 1e6 ? `$${v / 1e6}M` : `$${v / 1000}K`}
            </button>
          ))}
        </div>
      </div>

      {/* Plazo */}
      <div style={SS.card}>
        <div style={SS.lbl}>Plazo (días)</div>
        <input type="number" min="1" max="1825" value={sim.plazo} onChange={set("plazo")} style={SS.input} />
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {[30, 60, 90, 180, 365].map(v => (
            <button key={v}
              onClick={() => setSim(s => ({ ...s, plazo: v }))}
              style={{ ...SS.chip, ...(sim.plazo === v ? SS.chipOn : {}) }}>
              {v === 365 ? "1 año" : `${v}d`}
            </button>
          ))}
        </div>
      </div>

      {/* TNA Plazo Fijo */}
      <div style={SS.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={SS.lbl}>TNA Plazo Fijo (%)</div>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "rgba(255,215,64,0.08)", color: "#ffd740", fontWeight: 700 }}>SIMPLE</span>
        </div>
        <input type="number" step="0.1" min="0" value={sim.tna_pf} onChange={set("tna_pf")} style={SS.input} />
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
          {benchmarkTNA != null
            ? `📊 Benchmark actual: TNA ${benchmarkTNA.toFixed(1)}%`
            : "Promedio mercado — ajustá manualmente"}
        </div>
      </div>

      {/* TEA Money Market */}
      <div style={SS.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={SS.lbl}>TEA Money Market (%)</div>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "rgba(79,195,247,0.08)", color: "#4fc3f7", fontWeight: 700 }}>COMPUESTO</span>
        </div>
        <input type="number" step="0.1" min="0" value={sim.tea_mm} onChange={set("tea_mm")} style={SS.input} />
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
          Capitalización diaria · disponibilidad inmediata
        </div>
      </div>

      {/* Inflación */}
      <div style={SS.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={SS.lbl}>Inflación mensual estimada (%)</div>
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "rgba(255,82,82,0.08)", color: "#ff5252", fontWeight: 700 }}>IPC</span>
        </div>
        <input type="number" step="0.1" min="0" value={sim.inflacion} onChange={set("inflacion")} style={SS.input} />
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
          {lastIPC
            ? `📡 Último IPC INDEC: ${parseFloat(lastIPC.valor).toFixed(1)}% (${lastIPC.fecha})`
            : "Ajustá según expectativa del período"}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SimResultCard — Card individual de resultado (PF / MM / Inflación)
// ════════════════════════════════════════════════════════════════════
function SimResultCard({ title, tagText, tagColor, rate, rateLabel, final, ganancia, rendimiento, realReturn, bottomLabel, bottomValue, bottomColor }) {
  const accent = tagColor;
  return (
    <div style={{ ...SS.card, borderColor: `${accent}40`, background: `${accent}08` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: accent }}>{title}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", ...SS.mono }}>{rateLabel} {rate}%</span>
      </div>

      <div style={SS.lbl}>Capital final</div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--mono)", color: "#fff", marginBottom: 10 }}>
        {fmt(final)}
      </div>

      <div style={{ display: "flex", gap: 22 }}>
        <div>
          <div style={SS.lbl}>{ganancia >= 0 ? "Ganancia bruta" : "Pérdida"}</div>
          <div style={{ color: accent, ...SS.mono }}>{ganancia >= 0 ? "+" : ""}{fmt(ganancia)}</div>
        </div>
        <div>
          <div style={SS.lbl}>Rendimiento</div>
          <div style={{ color: accent, ...SS.mono }}>{rendimiento >= 0 ? "+" : ""}{rendimiento.toFixed(2)}%</div>
        </div>
      </div>

      <div style={SS.divider}>
        <div style={SS.lbl}>{bottomLabel}</div>
        <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 16, color: bottomColor }}>
          {bottomValue}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SimBars — Comparación visual con barras de progreso
// ════════════════════════════════════════════════════════════════════
function SimBars({ simResults, sim }) {
  const maxV = Math.max(simResults.mm_final, simResults.pf_final, simResults.infl_adjusted);
  const rows = [
    { label: "Money Market",         value: simResults.mm_final,      gain: simResults.mm_rendimiento, real: simResults.mm_real,  color: "#4fc3f7" },
    { label: "Plazo Fijo",           value: simResults.pf_final,      gain: simResults.pf_rendimiento, real: simResults.pf_real,  color: "#ffd740" },
    { label: "Inflación (umbral)",   value: simResults.infl_adjusted, gain: simResults.infl_rendimiento, real: null,              color: "#ff5252" },
  ];

  return (
    <div style={{ ...SS.card, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 18 }}>
        Comparación — {sim.plazo} días · capital inicial: {fmt(sim.capital)}
      </div>

      {rows.map(({ label, value, gain, real, color }) => (
        <div key={label} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>{label}</span>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              {real !== null && (
                <span style={{ fontSize: 12, color: real >= 0 ? "#00e676" : "#ff5252", fontFamily: "var(--mono)" }}>
                  real: {real >= 0 ? "+" : ""}{real.toFixed(2)}%
                </span>
              )}
              <span style={{ fontSize: 13, color, fontFamily: "var(--mono)", fontWeight: 700 }}>
                {fmt(value)} (+{gain.toFixed(2)}%)
              </span>
            </div>
          </div>
          <div style={{ height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${(value / maxV) * 100}%`,
              background: color,
              borderRadius: 5,
              opacity: label === "Inflación (umbral)" ? 0.45 : 1,
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      ))}

      {/* Insight: MM gana al PF */}
      {simResults.mm_rendimiento > simResults.pf_rendimiento && (
        <div style={{ marginTop: 4, padding: "10px 14px", background: "rgba(79,195,247,0.06)", borderRadius: 8, border: "1px solid rgba(79,195,247,0.15)", fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
          💡 Money Market supera al Plazo Fijo en{" "}
          <span style={{ color: "#4fc3f7", fontWeight: 700, fontFamily: "var(--mono)" }}>
            {fmt(simResults.mm_final - simResults.pf_final)}
          </span>
          {" "}({(simResults.mm_rendimiento - simResults.pf_rendimiento).toFixed(2)}% más) — con liquidez inmediata.
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Simulador — Componente principal (composición)
// ════════════════════════════════════════════════════════════════════
export function Simulador({ sim, setSim, simResults, inflacionData, benchmarkTNA }) {
  return (
    <section>
      <h2 style={SS.secT}>🧮 Simulador: Plazo Fijo vs Money Market vs Inflación</h2>

      <SimInputs
        sim={sim}
        setSim={setSim}
        inflacionData={inflacionData}
        benchmarkTNA={benchmarkTNA}
      />

      {simResults && (
        <>
          {/* Cards de resultado */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginBottom: 20 }}>
            <SimResultCard
              title="🏦 Plazo Fijo"
              tagColor="#ffd740"
              rateLabel="TNA"
              rate={sim.tna_pf}
              final={simResults.pf_final}
              ganancia={simResults.pf_ganancia}
              rendimiento={simResults.pf_rendimiento}
              bottomLabel="Retorno real (vs inflación proyectada)"
              bottomValue={`${simResults.pf_real >= 0 ? "+" : ""}${simResults.pf_real.toFixed(2)}%`}
              bottomColor={simResults.pf_real >= 0 ? "#00e676" : "#ff5252"}
            />
            <SimResultCard
              title="💵 Money Market"
              tagColor="#4fc3f7"
              rateLabel="TEA"
              rate={sim.tea_mm}
              final={simResults.mm_final}
              ganancia={simResults.mm_ganancia}
              rendimiento={simResults.mm_rendimiento}
              bottomLabel="Retorno real (vs inflación proyectada)"
              bottomValue={`${simResults.mm_real >= 0 ? "+" : ""}${simResults.mm_real.toFixed(2)}%`}
              bottomColor={simResults.mm_real >= 0 ? "#00e676" : "#ff5252"}
            />
            <SimResultCard
              title="📈 Inflación proyectada"
              tagColor="#ff5252"
              rateLabel="IPC"
              rate={sim.inflacion}
              final={simResults.infl_adjusted}
              ganancia={simResults.infl_adjusted - sim.capital}
              rendimiento={simResults.infl_rendimiento}
              bottomLabel="Mínimo a rendir para no perder poder adquisitivo"
              bottomValue={`+${simResults.infl_rendimiento.toFixed(2)}%`}
              bottomColor="#ffd740"
            />
          </div>

          {/* Barras de comparación */}
          <SimBars simResults={simResults} sim={sim} />

          {/* Gráfico de evolución */}
          <div style={{ ...SS.card, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginBottom: 2 }}>
              Evolución del capital proyectada
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>
              Curva día a día · {sim.plazo} días · basado en tasas ingresadas
            </div>
            <SimChart data={simResults.chartData} />
            <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
              <span style={{ fontSize: 12, color: "#4fc3f7" }}>— Money Market</span>
              <span style={{ fontSize: 12, color: "#ffd740" }}>— Plazo Fijo</span>
              <span style={{ fontSize: 12, color: "#ff5252", opacity: 0.7 }}>--- Inflación</span>
            </div>
          </div>
        </>
      )}

      {/* Disclaimer */}
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.8, padding: "14px 18px", background: "rgba(255,255,255,0.015)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)" }}>
        ⚠️{" "}
        <strong style={{ color: "rgba(255,255,255,0.6)" }}>Disclaimer educativo:</strong>{" "}
        Plazo Fijo usa interés simple (convención argentina estándar). Money Market usa capitalización diaria compuesta (el VCP acumula diariamente).
        Inflación proyecta el capital necesario para mantener poder adquisitivo.
        No se incluyen impuestos (Ganancias 35% sobre intereses PF; MM aplica exención por ser FCI).
        Rendimientos pasados no garantizan rendimientos futuros.
      </div>
    </section>
  );
}
