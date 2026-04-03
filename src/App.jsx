import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from "react";
import { getSettlement, getFinancialAlerts, calculateRates, calcArbitrage } from "./services/financeService";
import { PORTFOLIO_MODELS, calcPortfolioReturn } from "./services/portfolioModels";
import { TrendChart, AlertPanel, DonutChart, RiskBar } from "./components/FinanceComponents";

// ═══════════════════════════════════════════════════════════════════
// INVERSIONISTA PRO v4 — TERMINAL FINANCIERA INTEGRAL
// ═══════════════════════════════════════════════════════════════════

const SYS_PROMPT = `Sos un Portfolio Manager de élite.
REGLAS: Respondé en español rioplatense profesional. Sé directo y accionable.
CONTEXTO: Terminal financiera Argentina. Datos en tiempo real de FCI, MEP, Blue y Merval.
Al analizar un activo: indicá Liquidez (T+n), TEA vs Inflación estimada, Riesgo y tu recomendación.`;

// ── HELPERS ──────────────────────────────────────────────────────
const fmt = (v, c = "ARS") =>
  v == null || isNaN(v)
    ? "—"
    : new Intl.NumberFormat("es-AR", { style: "currency", currency: c, minimumFractionDigits: 2 }).format(v);

const fmtPct = v =>
  v == null || isNaN(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

const fmtNum = v =>
  v == null || isNaN(v)
    ? "—"
    : new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v);

const TYPES = {
  money_market:   { label: "Money Market", color: "#4fc3f7", short: "MM" },
  renta_fija:     { label: "Renta Fija",   color: "#ffd740", short: "RF" },
  renta_variable: { label: "R. Variable",  color: "#ff5252", short: "RV" },
  renta_mixta:    { label: "Mixta",        color: "#b388ff", short: "MX" },
  otros:          { label: "Otros",        color: "#78909c", short: "OT" },
};

// Simulación de historial determinista (sin flicker entre renders)
const buildHistory = (seed, base, len = 12) =>
  Array.from({ length: len }, (_, i) => base * (0.95 + Math.abs(Math.sin(seed * 0.3 + i * 0.8)) * 0.10));

// ── COMPONENTES INLINE ────────────────────────────────────────────
const Pill = ({ v, sm }) => {
  if (v == null || isNaN(v))
    return <span style={{ fontSize: sm ? 12 : 14, color: "rgba(255,255,255,0.2)" }}>—</span>;
  const pos = v >= 0;
  return (
    <span style={{ fontSize: sm ? 11 : 13, fontWeight: 700, fontFamily: "var(--mono)", padding: "2px 7px", borderRadius: 4, background: pos ? "rgba(0,230,118,0.1)" : "rgba(255,82,82,0.1)", color: pos ? "#00e676" : "#ff5252" }}>
      {fmtPct(v)}
    </span>
  );
};

const SortTh = ({ label, field, current, dir, onSort, align = "left" }) => (
  <th
    onClick={() => onSort(field)}
    style={{ ...S.th, textAlign: align, cursor: "pointer", userSelect: "none", color: current === field ? "#4fc3f7" : "#64748b", whiteSpace: "nowrap" }}
  >
    {label}{current === field ? (dir === "desc" ? " ↓" : " ↑") : ""}
  </th>
);

const LoadingRows = ({ cols = 6 }) => (
  <>
    {Array.from({ length: 8 }).map((_, i) => (
      <tr key={i}>
        {Array.from({ length: cols }).map((_, j) => (
          <td key={j} style={S.td}>
            <div style={{ height: 14, borderRadius: 4, background: "#ffffff06", width: j === 0 ? "70%" : "50%", animation: "pulse 1.5s ease-in-out infinite" }} />
          </td>
        ))}
      </tr>
    ))}
  </>
);

// ── APP PRINCIPAL ─────────────────────────────────────────────────
export default function App() {
  // — UI State —
  const [tab, setTab] = useState("dashboard");
  const [chatOpen, setChatOpen] = useState(false);

  // — Chat State —
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hola Luciano. Terminal activa. ¿En qué activos buscás posicionarte hoy?" },
  ]);
  const [inputMsg, setInputMsg] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  // — Data State —
  const [dollar, setDollar] = useState(null);
  const [crypto, setCrypto] = useState(null);
  const [fci, setFci] = useState(null);
  const [fciLoading, setFciLoading] = useState(true);
  const [fciError, setFciError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  // — FCI Filters —
  const [fciFilter, setFciFilter] = useState("todos");
  const [fciSearch, setFciSearch] = useState("");
  const [fciSort, setFciSort] = useState("mensual");
  const [fciSortDir, setFciSortDir] = useState("desc");

  // — Portfolio —
  const [profile, setProfile] = useState("moderate");

  // — Arbitraje —
  const [arbAmount, setArbAmount] = useState(1000000);
  const [arbCommission, setArbCommission] = useState(0.5);

  // React 18: búsqueda diferida para evitar lag al tipear
  const deferredSearch = useDeferredValue(fciSearch);
  const isSearchPending = fciSearch !== deferredSearch;

  // ── FETCH DATA ─────────────────────────────────────────────────
  useEffect(() => {
    const ctrl = new AbortController();
    const { signal } = ctrl;

    const fetchData = async () => {
      try {
        // Dólares y Crypto en paralelo
        const [dRes, cRes] = await Promise.allSettled([
          fetch("https://dolarapi.com/v1/dolares", { signal }),
          fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true", { signal }),
        ]);
        if (dRes.status === "fulfilled" && dRes.value.ok) setDollar(await dRes.value.json());
        if (cRes.status === "fulfilled" && cRes.value.ok) setCrypto(await cRes.value.json());

        // FCI: 5 categorías con histórico real (VCP penultimo + 30d + YTD + 1Y)
        setFciLoading(true);
        setFciError(null);

        const BASE = "https://api.argentinadatos.com/v1/finanzas/fci";
        const fciCategories = [
          { path: "mercadoDinero",  type: "money_market"   },
          { path: "rentaFija",      type: "renta_fija"     },
          { path: "rentaVariable",  type: "renta_variable" },
          { path: "rentaMixta",     type: "renta_mixta"    },
          { path: "otros",          type: "otros"          },
        ];

        // Fechas de referencia
        const todayD = new Date();
        const fmtDate = d => d.toISOString().split("T")[0];
        const d30  = new Date(todayD); d30.setDate(todayD.getDate() - 30);
        const dYtd = new Date(todayD.getFullYear() - 1, 11, 31); // 31-dic año anterior
        const d365 = new Date(todayD); d365.setDate(todayD.getDate() - 365);

        // Fetch último + penúltimo para todas las categorías
        const [ultimoResults, penultimoResults] = await Promise.all([
          Promise.all(fciCategories.map(c =>
            fetch(`${BASE}/${c.path}/ultimo`, { signal }).then(r => r.ok ? r.json() : []).catch(() => [])
          )),
          Promise.all(fciCategories.map(c =>
            fetch(`/api/fci-penultimo?tipo=${c.path}`, { signal }).then(r => r.ok ? r.json() : []).catch(() => [])
          )),
        ]);

        // Fetch histórico via proxy (30d, YTD, 1Y) para las 5 categorías en paralelo
        const histResults = await Promise.all(
          fciCategories.flatMap(c => [
            fetch(`/api/fci-history?tipo=${c.path}&fecha=${fmtDate(d30)}`,  { signal }).then(r => r.ok ? r.json() : []).catch(() => []),
            fetch(`/api/fci-history?tipo=${c.path}&fecha=${fmtDate(dYtd)}`, { signal }).then(r => r.ok ? r.json() : []).catch(() => []),
            fetch(`/api/fci-history?tipo=${c.path}&fecha=${fmtDate(d365)}`, { signal }).then(r => r.ok ? r.json() : []).catch(() => []),
          ])
        );

        let allFunds = [];
        let fciDate = "";

        for (let i = 0; i < fciCategories.length; i++) {
          const ultimoRaw   = Array.isArray(ultimoResults[i])   ? ultimoResults[i]   : [];
          const penultRaw   = Array.isArray(penultimoResults[i]) ? penultimoResults[i] : [];
          const hist30d     = Array.isArray(histResults[i * 3])     ? histResults[i * 3]     : [];
          const histYtd     = Array.isArray(histResults[i * 3 + 1]) ? histResults[i * 3 + 1] : [];
          const hist365d    = Array.isArray(histResults[i * 3 + 2]) ? histResults[i * 3 + 2] : [];

          // Mapas para lookup rápido por nombre de fondo
          const prevMap  = {}, map30d = {}, mapYtd = {}, map365d = {};
          penultRaw.forEach(f => { if (f.fondo && f.vcp) prevMap[f.fondo]  = parseFloat(f.vcp); });
          hist30d.forEach(f  => { if (f.fondo && f.vcp) map30d[f.fondo]   = parseFloat(f.vcp); });
          histYtd.forEach(f  => { if (f.fondo && f.vcp) mapYtd[f.fondo]   = parseFloat(f.vcp); });
          hist365d.forEach(f => { if (f.fondo && f.vcp) map365d[f.fondo]  = parseFloat(f.vcp); });

          const funds = ultimoRaw
            .filter(f => f.fondo && f.vcp)
            .map(f => {
              const vcpNow  = parseFloat(f.vcp);
              const vcpPrev = prevMap[f.fondo];
              const vcp30d  = map30d[f.fondo];
              const vcpYtd  = mapYtd[f.fondo];
              const vcp365d = map365d[f.fondo];

              // Rendimiento diario real: (VCP_hoy / VCP_ayer) - 1
              const rDaily = (vcpPrev && vcpNow > 0) ? (vcpNow / vcpPrev) - 1 : null;
              const tea    = rDaily != null ? (Math.pow(1 + rDaily, 365) - 1) * 100 : null;
              const rend_diario  = rDaily != null ? rDaily * 100 : null;
              const rend_mensual = (vcp30d  && vcpNow > 0) ? ((vcpNow / vcp30d)  - 1) * 100 : null;
              const rend_ytd     = (vcpYtd  && vcpNow > 0) ? ((vcpNow / vcpYtd)  - 1) * 100 : null;
              const rend_anual   = (vcp365d && vcpNow > 0) ? ((vcpNow / vcp365d) - 1) * 100 : null;

              // Sparkline con VCP reales (5 puntos), fallback a simulación
              const realHistory = [vcp365d, vcpYtd, vcp30d, vcpPrev, vcpNow].filter(Boolean);
              const seed = f.fondo.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
              const history = realHistory.length >= 3 ? realHistory : buildHistory(seed, tea ?? 68);

              return {
                fondo: f.fondo,
                fecha: f.fecha || "",
                vcp: String(f.vcp),
                patrimonio: f.patrimonio ? parseFloat(f.patrimonio) : null,
                horizonte: f.horizonte || "",
                gerente: f.gerente || "",
                type: fciCategories[i].type,
                rend_diario, tea, rend_mensual, rend_ytd, rend_anual,
                history,
                histReal: realHistory.length >= 3,
              };
            });

          allFunds = [...allFunds, ...funds];
          if (!fciDate && funds.length > 0) fciDate = funds[0].fecha;
        }

        if (allFunds.length === 0) {
          setFciError("No se pudieron cargar los fondos. Reintentá más tarde.");
        } else {
          const mmTeas = allFunds.filter(f => f.type === "money_market" && f.tea != null).map(f => f.tea);
          const benchmarkTEA = mmTeas.length ? mmTeas.reduce((a, b) => a + b, 0) / mmTeas.length : 70;
          setFci({
            funds: allFunds,
            benchmarkTEA: +benchmarkTEA.toFixed(2),
            date: fciDate || new Date().toLocaleDateString("es-AR"),
          });
        }

        setLastUpdate(new Date());
      } catch (e) {
        if (e.name !== "AbortError") {
          console.error("Error en Terminal:", e);
          setFciError("Error de conexión con los mercados.");
        }
      } finally {
        setFciLoading(false);
      }
    };

    fetchData();
    return () => ctrl.abort();
  }, []);

  // Auto-scroll al último mensaje
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // ── LÓGICA FILTRADO Y ORDENAMIENTO ────────────────────────────
  const filteredFci = useMemo(() => {
    if (!fci?.funds) return [];
    let result = fci.funds;

    if (fciFilter !== "todos") {
      result = result.filter(x => x.type === fciFilter);
    }

    if (deferredSearch) {
      const q = deferredSearch.toLowerCase();
      result = result.filter(x =>
        (x.fondo || "").toLowerCase().includes(q) ||
        (x.gerente || "").toLowerCase().includes(q)
      );
    }

    result = [...result].sort((a, b) => {
      const dir = fciSortDir === "desc" ? -1 : 1;
      const valA = a[fciSort] ?? -Infinity;
      const valB = b[fciSort] ?? -Infinity;
      if (typeof valA === "string") return dir * valA.localeCompare(valB);
      return dir * (valA - valB);
    });

    return result;
  }, [fci, fciFilter, deferredSearch, fciSort, fciSortDir]);

  // ── ALERTAS ────────────────────────────────────────────────────
  const activeAlerts = useMemo(() => getFinancialAlerts(dollar, fci), [dollar, fci]);

  // ── ARBITRAJE ─────────────────────────────────────────────────
  const mepRate = useMemo(() => dollar?.find(d => d.nombre === "Bolsa")?.venta, [dollar]);
  const blueRate = useMemo(() => dollar?.find(d => d.nombre === "Blue")?.venta, [dollar]);
  const arbResult = useMemo(
    () => calcArbitrage(arbAmount, mepRate, blueRate, arbCommission),
    [arbAmount, mepRate, blueRate, arbCommission]
  );

  // ── PORTFOLIO ─────────────────────────────────────────────────
  const currentModel = PORTFOLIO_MODELS[profile];
  const estimatedReturn = useMemo(() => {
    if (!fci?.funds) return null;
    const mmAvg = fci.funds.filter(f => f.type === "money_market" && f.tea).reduce((a, f, _, arr) => a + f.tea / arr.length, 0);
    const rfAvg = fci.funds.filter(f => f.type === "renta_fija" && f.tea).reduce((a, f, _, arr) => a + f.tea / arr.length, 0);
    return calcPortfolioReturn(profile, { mmTea: mmAvg || 70, rfTea: rfAvg || 80, rvReturn: 120 });
  }, [fci, profile]);

  // ── CHAT IA ──────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const msg = (text || inputMsg).trim();
    if (!msg || isTyping) return;
    setMessages(p => [...p, { role: "user", content: msg }]);
    if (!text) setInputMsg("");
    setIsTyping(true);
    // TODO: Reemplazar con tu endpoint real (OpenAI / Claude / etc.)
    setTimeout(() => {
      const responses = [
        "Para esa posición en pesos, sugiero mantener T+0 por liquidez inmediata ante volatilidad cambiaria. El spread actual justifica la posición.",
        "La TEA de los MM está comprimida vs inflación. Si tu horizonte es >6 meses, rotá al menos 30% a CER para preservar poder adquisitivo.",
        "Ese fondo tiene buena track record. El gerente es conservador — ideal para capital que no querés comprometer con salto cambiario.",
        "El puré sigue siendo viable hoy, pero vigilá la liquidez del bono AL30. La operatoria MEP tiene demora de 24hs en algunos brokers.",
      ];
      const reply = responses[Math.floor(Math.random() * responses.length)];
      setMessages(p => [...p, { role: "assistant", content: reply }]);
      setIsTyping(false);
    }, 800 + Math.random() * 600);
  }, [inputMsg, isTyping]);

  const askAboutAsset = useCallback((asset) => {
    const settlement = getSettlement(asset.fondo, asset.type);
    const typeLabel = TYPES[asset.type]?.label || asset.type;
    const rends = [
      asset.tea     != null ? `TEA: ${asset.tea.toFixed(1)}%`           : null,
      asset.rend_mensual != null ? `30D: ${fmtPct(asset.rend_mensual)}` : null,
      asset.rend_ytd     != null ? `YTD: ${fmtPct(asset.rend_ytd)}`     : null,
      asset.rend_anual   != null ? `1Y: ${fmtPct(asset.rend_anual)}`    : null,
    ].filter(Boolean).join(" · ");
    const prompt = `Analizame el fondo "${asset.fondo}" (${typeLabel}). Liquidación: ${settlement}. Rendimientos: ${rends || "sin datos"}. ¿Conviene posicionarse hoy comparado con alternativas del mercado?`;
    setChatOpen(true);
    setTimeout(() => sendMessage(prompt), 50);
  }, [sendMessage]);

  const handleSort = useCallback((field) => {
    setFciSortDir(d => (fciSort === field ? (d === "desc" ? "asc" : "desc") : "desc"));
    setFciSort(field);
  }, [fciSort]);

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* HEADER */}
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22, color: "#4fc3f7" }}>◈</span>
          <span style={{ fontWeight: 800, letterSpacing: "1px", fontSize: 15 }}>
            INVERSIONISTA <span style={{ color: "#4fc3f7" }}>PRO</span>
            <span style={{ fontSize: 10, color: "#64748b", marginLeft: 8, fontWeight: 400, letterSpacing: "2px" }}>v4</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastUpdate && (
            <span style={{ fontSize: 11, color: "#64748b", fontFamily: "var(--mono)" }}>
              ACT {lastUpdate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button onClick={() => setChatOpen(c => !c)} style={{ ...S.iaBtn, ...(chatOpen ? S.iaBtnActive : {}) }}>
            🧠 {chatOpen ? "CERRAR IA" : "ASESOR IA"}
          </button>
        </div>
      </header>

      {/* TABS */}
      <nav style={S.tabBar}>
        {[
          { id: "dashboard", label: "📊 Dashboard" },
          { id: "fci",       label: "🏦 Fondos" },
          { id: "arbitraje", label: "⚖️ Arbitraje" },
          { id: "portfolio", label: "🎯 Portfolio" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ ...S.tabBtn, ...(tab === t.id ? S.tabOn : {}) }}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* MAIN */}
      <main style={{ ...S.main, marginRight: chatOpen ? 400 : 0 }}>

        {/* ALERT PANEL */}
        <AlertPanel alerts={activeAlerts} />

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && (
          <div style={S.dashGrid}>
            {/* Dólar */}
            <section style={S.card}>
              <h3 style={S.secT}>💵 Dólar Hoy</h3>
              {!dollar ? (
                <div style={S.loadingMsg}>Cargando cotizaciones...</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {dollar.slice(0, 5).map(d => (
                    <div key={d.nombre} style={S.row}>
                      <span style={{ fontSize: 13, opacity: 0.75 }}>{d.nombre}</span>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ ...S.monoNum, fontSize: 11, color: "#64748b" }}>{fmt(d.compra)}</span>
                        <span style={{ ...S.monoNum, color: "#fff" }}>{fmt(d.venta)}</span>
                      </div>
                    </div>
                  ))}
                  {mepRate && blueRate && (
                    <div style={{ marginTop: 8, padding: "8px 12px", background: "#ffffff05", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#64748b" }}>Brecha MEP / Blue</span>
                      <Pill v={((blueRate - mepRate) / mepRate) * 100} />
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Crypto */}
            <section style={S.card}>
              <h3 style={S.secT}>₿ Crypto</h3>
              {!crypto ? (
                <div style={S.loadingMsg}>Cargando precios...</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {Object.entries(crypto).map(([k, v]) => (
                    <div key={k} style={S.row}>
                      <span style={{ fontSize: 13, textTransform: "capitalize" }}>{k}</span>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <Pill v={v.usd_24h_change} sm />
                        <span style={{ ...S.monoNum, fontSize: 13 }}>u$s {v.usd.toLocaleString("es-AR")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Top MM */}
            <section style={S.card}>
              <h3 style={S.secT}>🏆 Top Money Market</h3>
              {fciLoading ? (
                <div style={S.loadingMsg}>Calculando TEAs...</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {(fci?.funds || [])
                    .filter(f => f.type === "money_market")
                    .sort((a, b) => (b.tea || 0) - (a.tea || 0))
                    .slice(0, 4)
                    .map(f => (
                      <div key={f.fondo} style={{ ...S.row, gap: 10 }}>
                        <span style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.8 }}>
                          {f.fondo}
                        </span>
                        <TrendChart data={f.history} color="auto" w={50} h={20} />
                        <span style={{ ...S.monoNum, color: "#00e676", fontSize: 12, minWidth: 55, textAlign: "right" }}>
                          {f.tea?.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  {fci?.benchmarkTEA && (
                    <div style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid #1a202c", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: "#64748b" }}>Benchmark TEA promedio</span>
                      <span style={{ ...S.monoNum, fontSize: 12, color: "#4fc3f7" }}>{fci.benchmarkTEA.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── FCI ── */}
        {tab === "fci" && (
          <section style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
              <input
                style={{ ...S.searchIn, opacity: isSearchPending ? 0.6 : 1, transition: "opacity 0.2s" }}
                placeholder="🔍 Buscar fondo o administradora..."
                value={fciSearch}
                onChange={e => setFciSearch(e.target.value)}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { key: "todos",          label: "Todos" },
                  { key: "money_market",   label: "💵 MM" },
                  { key: "renta_fija",     label: "📈 RF" },
                  { key: "renta_variable", label: "🔥 RV" },
                  { key: "renta_mixta",    label: "⚖️ Mix" },
                ].map(t => (
                  <button key={t.key} onClick={() => setFciFilter(t.key)} style={{ ...S.filterBtn, ...(fciFilter === t.key ? S.filterOn : {}) }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {fciError ? (
              <div style={{ padding: 30, textAlign: "center", color: "#ff5252", fontSize: 13 }}>
                ⚠️ {fciError}
              </div>
            ) : (
              <div style={S.tw}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, minWidth: 200 }}>Fondo</th>
                      <th style={S.th}>Tipo</th>
                      <th style={S.th}>Liq.</th>
                      <SortTh label="Diario" field="rend_diario" current={fciSort} dir={fciSortDir} onSort={handleSort} align="right" />
                      <SortTh label="TEA"    field="tea"         current={fciSort} dir={fciSortDir} onSort={handleSort} align="right" />
                      <SortTh label="30D"    field="rend_mensual" current={fciSort} dir={fciSortDir} onSort={handleSort} align="right" />
                      <SortTh label="YTD"    field="rend_ytd"    current={fciSort} dir={fciSortDir} onSort={handleSort} align="right" />
                      <SortTh label="1 AÑO"  field="rend_anual"  current={fciSort} dir={fciSortDir} onSort={handleSort} align="right" />
                      <th style={{ ...S.th, textAlign: "center" }}>Tendencia</th>
                      <th style={{ ...S.th, textAlign: "right" }}>IA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fciLoading ? (
                      <LoadingRows cols={10} />
                    ) : filteredFci.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ ...S.td, textAlign: "center", color: "#64748b", padding: 30 }}>
                          No se encontraron fondos para los filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      filteredFci.map(f => {
                        const typeInfo = TYPES[f.type] || TYPES.otros;
                        const settlement = getSettlement(f.fondo, f.type);
                        return (
                          <tr key={f.fondo} className="fci-row">
                            <td style={S.td}>
                              <div style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 13 }}>{f.fondo}</div>
                              {f.gerente && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{f.gerente}</div>}
                            </td>
                            <td style={S.td}>
                              <span style={{ ...S.typeBadge, background: typeInfo.color + "18", color: typeInfo.color, border: `1px solid ${typeInfo.color}40` }}>
                                {typeInfo.short}
                              </span>
                            </td>
                            <td style={S.td}>
                              <span style={{ ...S.settBadge, color: settlement === "T+0" ? "#00e676" : settlement === "T+1" ? "#ffd740" : "#4fc3f7" }}>
                                {settlement}
                              </span>
                            </td>
                            <td style={{ ...S.td, textAlign: "right" }}>
                              <Pill v={f.rend_diario} sm />
                            </td>
                            <td style={{ ...S.td, textAlign: "right" }}>
                              <span style={{ ...S.monoNum, color: f.tea > (fci?.benchmarkTEA || 70) ? "#00e676" : "#ffd740", fontSize: 13 }}>
                                {f.tea != null ? `${f.tea.toFixed(2)}%` : "—"}
                              </span>
                            </td>
                            <td style={{ ...S.td, textAlign: "right" }}>
                              <Pill v={f.rend_mensual} sm />
                            </td>
                            <td style={{ ...S.td, textAlign: "right" }}>
                              <Pill v={f.rend_ytd} sm />
                            </td>
                            <td style={{ ...S.td, textAlign: "right" }}>
                              <Pill v={f.rend_anual} sm />
                            </td>
                            <td style={{ ...S.td, textAlign: "center" }}>
                              <TrendChart data={f.history} color={f.histReal ? "auto" : typeInfo.color} w={72} h={26} />
                            </td>
                            <td style={{ ...S.td, textAlign: "right" }}>
                              <button style={S.miniBtn} onClick={() => askAboutAsset(f)} title="Consultar al Asesor IA">
                                🧠
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {!fciLoading && filteredFci.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: "#64748b", textAlign: "right", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  {fci?.funds?.filter(f => f.histReal).length || 0} fondos con histórico real ·{" "}
                  {fci?.funds?.filter(f => !f.histReal).length || 0} sin historial suficiente
                </span>
                <span>{filteredFci.length} fondos · datos al {fci?.date}</span>
              </div>
            )}
          </section>
        )}

        {/* ── ARBITRAJE ── */}
        {tab === "arbitraje" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
            <section style={S.card}>
              <h3 style={S.secT}>⚡ Calculadora de Puré</h3>

              <div style={{ display: "grid", gap: 18 }}>
                <div style={S.inputGroup}>
                  <label style={S.lbl}>Monto a Invertir (ARS)</label>
                  <input
                    style={S.bigInput}
                    type="number"
                    value={arbAmount}
                    onChange={e => setArbAmount(+e.target.value)}
                    min={0}
                  />
                </div>

                <div style={S.inputGroup}>
                  <label style={S.lbl}>Comisión por operación (%)</label>
                  <input
                    style={{ ...S.bigInput, fontSize: 16 }}
                    type="number"
                    value={arbCommission}
                    step={0.1}
                    min={0}
                    max={5}
                    onChange={e => setArbCommission(+e.target.value)}
                  />
                </div>

                <div style={{ display: "grid", gap: 10, padding: "16px 0", borderTop: "1px solid #1a202c", borderBottom: "1px solid #1a202c" }}>
                  <div style={S.row}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>Dólar MEP (Bolsa)</span>
                    <span style={S.monoNum}>{mepRate ? fmt(mepRate) : "—"}</span>
                  </div>
                  <div style={S.row}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>Dólar Blue</span>
                    <span style={S.monoNum}>{blueRate ? fmt(blueRate) : "—"}</span>
                  </div>
                  <div style={S.row}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>Brecha</span>
                    <Pill v={mepRate && blueRate ? ((blueRate - mepRate) / mepRate) * 100 : null} />
                  </div>
                </div>

                {!mepRate || !blueRate ? (
                  <div style={{ color: "#ffd740", fontSize: 12, textAlign: "center", padding: 10 }}>
                    ⏳ Esperando cotizaciones del mercado...
                  </div>
                ) : arbResult ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={S.row}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>USD comprados (MEP)</span>
                      <span style={{ ...S.monoNum, fontSize: 13 }}>u$s {arbResult.usdBought.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div style={S.row}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>ARS recibidos (Blue)</span>
                      <span style={S.monoNum}>{fmt(arbResult.arsReceived)}</span>
                    </div>
                    <div style={{ ...S.row, padding: "12px 16px", background: arbResult.viable ? "rgba(0,230,118,0.06)" : "rgba(255,82,82,0.06)", borderRadius: 8, border: `1px solid ${arbResult.viable ? "#00e67630" : "#ff525230"}` }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>Ganancia Neta</span>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ ...S.monoNum, color: arbResult.viable ? "#00e676" : "#ff5252", fontSize: 20, fontWeight: 800 }}>
                          {fmt(arbResult.profit)}
                        </div>
                        <div style={{ ...S.monoNum, fontSize: 12, color: arbResult.viable ? "#00e676" : "#ff5252" }}>
                          {arbResult.profitPct >= 0 ? "+" : ""}{arbResult.profitPct.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <button
                  style={S.iaBtn}
                  onClick={() => sendMessage(`¿Sigue siendo rentable hacer puré hoy con MEP a ${fmt(mepRate)} y Blue a ${fmt(blueRate)}? ¿Qué riesgos operativos debo considerar?`)}
                >
                  🧠 Consultá riesgos con IA
                </button>
              </div>
            </section>

            <section style={S.card}>
              <h3 style={S.secT}>📋 Guía Operativa</h3>
              <div style={{ display: "grid", gap: 14 }}>
                {[
                  { step: "1", title: "Comprá USD MEP", desc: "Comprá el bono AL30 en pesos (ARS). Esperá 24hs de parking." },
                  { step: "2", title: "Transferí a cuenta comitente USD", desc: "Vendé el bono AL30 en dólares (USD) vía cable. T+2." },
                  { step: "3", title: "Vendé USD Blue", desc: "Vendé los dólares cable en el mercado informal. Comisión ~0.5%." },
                  { step: "⚠️", title: "Consideraciones", desc: "La operatoria tiene riesgo regulatorio. Verificá siempre el spread real en tu broker." },
                ].map(item => (
                  <div key={item.step} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid #1a202c" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#4fc3f715", border: "1px solid #4fc3f740", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#4fc3f7" }}>
                      {item.step}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12, color: "#e2e8f0", marginBottom: 3 }}>{item.title}</div>
                      <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ── PORTFOLIO ── */}
        {tab === "portfolio" && (
          <div style={{ display: "grid", gap: 20 }}>
            {/* Selector de perfiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {Object.entries(PORTFOLIO_MODELS).map(([key, model]) => (
                <button
                  key={key}
                  onClick={() => setProfile(key)}
                  style={{
                    ...S.profileCard,
                    ...(profile === key ? S.profileCardOn : {}),
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{model.emoji}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: profile === key ? "#4fc3f7" : "#fff" }}>{model.label}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{model.horizon}</div>
                </button>
              ))}
            </div>

            {/* Detalle del portfolio */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
              <section style={S.card}>
                <h3 style={S.secT}>{currentModel.emoji} Composición — {currentModel.label}</h3>
                <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                  <DonutChart allocations={currentModel.allocations} size={140} />
                  <div style={{ flex: 1, display: "grid", gap: 12 }}>
                    {currentModel.allocations.map(a => (
                      <div key={a.label} style={{ display: "grid", gap: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: a.color, boxShadow: `0 0 6px ${a.color}66`, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: "#e2e8f0" }}>{a.label}</span>
                          </div>
                          <span style={{ ...S.monoNum, fontSize: 13, color: a.color, fontWeight: 800 }}>{a.pct}%</span>
                        </div>
                        <div style={{ height: 3, background: "#1a202c", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${a.pct}%`, height: "100%", background: a.color, borderRadius: 3, boxShadow: `0 0 6px ${a.color}66`, transition: "width 0.5s ease" }} />
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b" }}>{a.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section style={S.card}>
                <h3 style={S.secT}>📊 Métricas del Perfil</h3>
                <div style={{ display: "grid", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Score de Riesgo</div>
                    <RiskBar score={currentModel.riskScore} />
                  </div>
                  <div style={S.row}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>Horizonte</span>
                    <span style={{ fontSize: 12, color: "#e2e8f0" }}>{currentModel.horizon}</span>
                  </div>
                  <div style={S.row}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>Retorno estimado (TEA pond.)</span>
                    <span style={{ ...S.monoNum, color: "#00e676", fontSize: 14, fontWeight: 800 }}>
                      {estimatedReturn ? `${estimatedReturn}%` : "—"}
                    </span>
                  </div>
                  <div style={{ padding: "10px 14px", background: "#ffffff05", borderRadius: 8, border: "1px solid #1a202c", fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                    {currentModel.description}
                  </div>
                  <button style={S.actionBtn} onClick={() => { setChatOpen(true); sendMessage(`Analizá la tesis de inversión del portafolio ${currentModel.label}. Composición: ${currentModel.allocations.map(a => `${a.pct}% ${a.label}`).join(", ")}. ¿Es la estrategia correcta para el contexto macro actual?`); }}>
                    🧠 Analizar tesis con IA
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {/* CHAT IA DRAWER */}
      <aside style={{ ...S.chat, transform: chatOpen ? "translateX(0)" : "translateX(100%)" }}>
        <div style={S.chatHd}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>🧠 ASESOR PORTFOLIO MANAGER</div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>AI — contexto del mercado activo</div>
          </div>
          <button onClick={() => setChatOpen(false)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={S.chatMsgs}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                ...S.msg,
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? "#4fc3f718" : "#ffffff08",
                borderLeft: m.role === "assistant" ? "2px solid #4fc3f730" : "none",
              }}
            >
              {m.content}
            </div>
          ))}
          {isTyping && (
            <div style={{ ...S.msg, alignSelf: "flex-start", background: "#ffffff08" }}>
              <span className="typing-dots">
                <span>·</span><span>·</span><span>·</span>
              </span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div style={S.chatInput}>
          <input
            style={S.inField}
            value={inputMsg}
            onChange={e => setInputMsg(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Preguntá sobre un activo o estrategia..."
          />
        </div>
      </aside>
    </div>
  );
}

// ── ESTILOS ───────────────────────────────────────────────────────
const S = {
  root:         { fontFamily: "'DM Sans', sans-serif", background: "#080c14", color: "#d8dee8", minHeight: "100vh", position: "relative" },
  header:       { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 28px", borderBottom: "1px solid #1a1f2b", background: "#080c14", position: "sticky", top: 0, zIndex: 100 },
  iaBtn:        { background: "linear-gradient(135deg, #4fc3f7, #00e676)", border: "none", color: "#080c14", padding: "8px 16px", borderRadius: 6, fontWeight: 800, cursor: "pointer", fontSize: 11, letterSpacing: "0.5px" },
  iaBtnActive:  { background: "linear-gradient(135deg, #00e676, #4fc3f7)", boxShadow: "0 0 14px rgba(79,195,247,0.4)" },
  tabBar:       { display: "flex", gap: 4, padding: "8px 28px", background: "#0b1018", borderBottom: "1px solid #1a1f2b", overflowX: "auto" },
  tabBtn:       { padding: "9px 18px", background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 12, fontWeight: 600, borderRadius: 6, whiteSpace: "nowrap", transition: "all 0.2s" },
  tabOn:        { color: "#4fc3f7", background: "#4fc3f712" },
  main:         { padding: "22px 28px", maxWidth: 1280, margin: "0 auto", transition: "margin-right 0.3s ease" },
  dashGrid:     { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 },
  card:         { background: "#0f1521", border: "1px solid #1a1f2b", borderRadius: 12, padding: 22 },
  secT:         { fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "1.5px" },
  row:          { display: "flex", justifyContent: "space-between", alignItems: "center" },
  monoNum:      { fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  tw:           { overflowX: "auto", overflowY: "auto", maxHeight: "62vh", background: "#080c14", borderRadius: 8, border: "1px solid #1a202c", contain: "content" },
  table:        { width: "100%", borderCollapse: "collapse" },
  th:           { textAlign: "left", padding: "11px 14px", color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.8px", borderBottom: "1px solid #1a202c", position: "sticky", top: 0, background: "#080c14", whiteSpace: "nowrap" },
  td:           { padding: "11px 14px", borderBottom: "1px solid #ffffff04", fontSize: 13, verticalAlign: "middle" },
  searchIn:     { background: "#080c14", border: "1px solid #1a202c", color: "#fff", padding: "9px 14px", borderRadius: 6, width: 300, fontSize: 13, outline: "none" },
  settBadge:    { fontSize: 10, fontWeight: 800, padding: "2px 7px", background: "#ffffff0a", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" },
  typeBadge:    { fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.5px" },
  miniBtn:      { background: "#4fc3f718", border: "1px solid #4fc3f730", color: "#4fc3f7", padding: "4px 9px", borderRadius: 4, cursor: "pointer", fontSize: 13, transition: "background 0.2s" },
  actionBtn:    { background: "#ffffff08", border: "1px solid #ffffff12", color: "#fff", padding: 12, borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 12, width: "100%", transition: "background 0.2s" },
  profileCard:  { background: "#0f1521", border: "1px solid #1a1f2b", borderRadius: 10, padding: "18px 14px", cursor: "pointer", textAlign: "center", transition: "all 0.2s", outline: "none" },
  profileCardOn:{ background: "#4fc3f710", border: "1px solid #4fc3f740", boxShadow: "0 0 16px rgba(79,195,247,0.12)" },
  filterBtn:    { fontSize: 11, padding: "6px 12px", background: "none", border: "1px solid #1a202c", color: "#64748b", borderRadius: 5, cursor: "pointer", transition: "all 0.15s" },
  filterOn:     { borderColor: "#4fc3f7", color: "#4fc3f7", background: "#4fc3f710" },
  chat:         { position: "fixed", top: 0, right: 0, width: 395, height: "100vh", background: "#0b111d", borderLeft: "1px solid #1a202c", zIndex: 200, transition: "transform 0.3s ease", display: "flex", flexDirection: "column" },
  chatHd:       { padding: "16px 20px", borderBottom: "1px solid #1a202c", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#4fc3f705" },
  chatMsgs:     { flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 12 },
  msg:          { padding: "10px 14px", borderRadius: 10, fontSize: 12, maxWidth: "88%", lineHeight: 1.6 },
  chatInput:    { padding: "14px 18px", borderTop: "1px solid #1a202c" },
  inField:      { width: "100%", background: "#080c14", border: "1px solid #1a202c", padding: "11px 14px", color: "#fff", borderRadius: 8, outline: "none", fontSize: 13 },
  inputGroup:   { display: "flex", flexDirection: "column", gap: 7 },
  lbl:          { fontSize: 11, color: "#64748b", letterSpacing: "0.5px" },
  bigInput:     { background: "#080c14", border: "1px solid #1a202c", color: "#fff", padding: 14, borderRadius: 8, fontSize: 20, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, outline: "none", width: "100%" },
  loadingMsg:   { padding: "20px 0", textAlign: "center", color: "#64748b", fontSize: 12 },
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap');
  :root { --mono: 'JetBrains Mono', monospace; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #080c14; overflow-x: hidden; }
  .fci-row:hover td { background: #ffffff04 !important; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1a202c; border-radius: 10px; }
  ::-webkit-scrollbar-thumb:hover { background: #2d3748; }
  @keyframes pulse { 0%,100% { opacity:0.4; } 50% { opacity:0.8; } }
  .typing-dots span { animation: blink 1.2s infinite; font-size: 18px; color: #4fc3f7; }
  .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink { 0%,80%,100% { opacity:0.2; } 40% { opacity:1; } }
  input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
`;
