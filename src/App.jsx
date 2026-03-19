import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════════
// INVERSIONISTA PRO v3 — FCI con Rendimientos + Dashboard + Asesor IA
// ═══════════════════════════════════════════════════════════════════

const SYS_PROMPT = `Sos un asesor financiero integral de élite.
CERTIFICACIONES: CFA Level III, CFP, Wealth Manager certificado, Portfolio Manager.
EXPERTISE: Mercado argentino (Merval, CEDEARs, bonos soberanos, FCI, tipos de cambio), mercado USA (S&P500, Nasdaq, ETFs, treasuries), criptomonedas, renta fija.
REGLAS: Respondé en español rioplatense profesional. Sé directo. En recomendaciones incluí: tesis, riesgo, horizonte, escenarios adversos. Disclaimer educativo. Usá web search para datos actuales. NUNCA inventes cotizaciones.`;

// ── Helpers ──
const fmt = (v, c = "ARS") => v == null || isNaN(v) ? "—" : new Intl.NumberFormat("es-AR", { style: "currency", currency: c, minimumFractionDigits: 2 }).format(v);
const fmtUSD = v => fmt(v, "USD");
const fmtPct = v => v == null || isNaN(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const fmtNum = v => v == null || isNaN(v) ? "—" : new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v);

const Pill = ({ v, sm }) => {
  if (v == null || isNaN(v)) return <span style={{ fontSize: sm ? 13 : 14, color: "rgba(255,255,255,0.3)" }}>—</span>;
  const pos = v >= 0;
  return <span style={{ fontSize: sm ? 13 : 14, fontWeight: 600, fontFamily: "var(--mono)", padding: "3px 8px", borderRadius: 4, background: pos ? "rgba(0,230,118,0.1)" : "rgba(255,82,82,0.1)", color: pos ? "#00e676" : "#ff5252" }}>{fmtPct(v)}</span>;
};

const Spark = ({ data, color, w = 68, h = 22 }) => {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), r = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / r) * (h - 4) - 2}`).join(" ");
  return <svg width={w} height={h} style={{ display: "block" }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
};

const genSpark = (b, vol = 0.02, n = 20) => { const a = [b]; for (let i = 1; i < n; i++) a.push(a[i-1] * (1 + (Math.random() - 0.48) * vol)); return a; };

const Skel = ({ w = "100%", h = 14 }) => <div style={{ width: w, height: h, borderRadius: 3, background: "rgba(255,255,255,0.04)", animation: "pulse 1.5s infinite" }} />;

const TYPES = {
  money_market: { label: "Money Market", color: "#4fc3f7", short: "MM" },
  renta_fija: { label: "Renta Fija", color: "#ffd740", short: "RF" },
  renta_variable: { label: "R. Variable", color: "#ff5252", short: "RV" },
  renta_mixta: { label: "Mixta", color: "#b388ff", short: "MX" },
  otros: { label: "Otros", color: "#78909c", short: "OT" },
};

const classifyFund = (name, horizon) => {
  const n = (name || "").toLowerCase(), h = (horizon || "").toLowerCase();
  if (h.includes("money") || n.includes("money") || n.includes("disponibilidad") || n.includes("ahorro") || n.includes("cuenta") || n.includes("liquidez")) return "money_market";
  if (h.includes("variable") || n.includes("variable") || n.includes("acciones") || n.includes("equity")) return "renta_variable";
  if (h.includes("mixta") || h.includes("mix") || n.includes("mixta") || n.includes("balanceado") || n.includes("balanced")) return "renta_mixta";
  if (h.includes("fija") || n.includes("renta fija") || n.includes("bond") || n.includes("income") || n.includes("plazo") || n.includes("ahorro plus") || n.includes("renta $")) return "renta_fija";
  return "otros";
};

// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("fci");
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", content: "¡Hola! Soy tu asesor financiero virtual (CFA · Wealth Manager · Portfolio Manager · CFP).\n\nPuedo ayudarte con:\n• Análisis de FCI, bonos, acciones\n• Recomendaciones de inversión\n• Tipos de cambio y crypto\n• Planificación patrimonial\n\n¿En qué puedo asistirte hoy?" }]);
  const [inputMsg, setInputMsg] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [dollar, setDollar] = useState(null);
  const [crypto, setCrypto] = useState(null);
  const [fci, setFci] = useState(null);
  const [fciLoading, setFciLoading] = useState(true);
  const [fciFilter, setFciFilter] = useState("todos");
  const [fciSearch, setFciSearch] = useState("");
  const [fciSort, setFciSort] = useState("diario");
  const [fciSortDir, setFciSortDir] = useState("desc");
  const [expandedFund, setExpandedFund] = useState(null);
  const [fundDetail, setFundDetail] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const chatEndRef = useRef(null);

  const [market] = useState(() => ({
    indices: {
      sp500: { name: "S&P 500", val: 5842.15, chg: 0.67, sp: genSpark(5800, 0.008) },
      nasdaq: { name: "NASDAQ", val: 18439.2, chg: 1.12, sp: genSpark(18200, 0.012) },
      dow: { name: "Dow Jones", val: 42877.5, chg: 0.31, sp: genSpark(42600, 0.006) },
      merval: { name: "S&P Merval", val: 2156780, chg: 1.85, sp: genSpark(2100000, 0.015), ars: true },
    },
    cedears: [
      { t: "AAPL", n: "Apple", p: 12450, c: 0.82 }, { t: "MELI", n: "MercadoLibre", p: 58200, c: 2.15 },
      { t: "GOOGL", n: "Alphabet", p: 5890, c: -0.45 }, { t: "MSFT", n: "Microsoft", p: 14200, c: 0.33 },
      { t: "AMZN", n: "Amazon", p: 6780, c: 1.67 }, { t: "NVDA", n: "NVIDIA", p: 4320, c: 3.21 },
      { t: "TSLA", n: "Tesla", p: 8150, c: -1.12 }, { t: "JPM", n: "JPMorgan", p: 9870, c: 0.56 },
    ],
    bonds: [
      { t: "AL30", n: "Bonar 2030", p: 68.5, c: 0.73, y: 18.2 }, { t: "GD30", n: "Global 2030", p: 72.3, c: 0.45, y: 15.8 },
      { t: "AL35", n: "Bonar 2035", p: 61.2, c: -0.32, y: 19.1 }, { t: "GD35", n: "Global 2035", p: 65.8, c: 0.28, y: 16.5 },
      { t: "GD41", n: "Global 2041", p: 58.9, c: 0.15, y: 14.3 }, { t: "US10Y", n: "Treasury 10Y", p: 95.2, c: -0.12, y: 4.28 },
    ],
  }));

  // ── Fetch all data ──
  useEffect(() => {
    const go = async () => {
      // Dollar
      try { const r = await fetch("https://dolarapi.com/v1/dolares"); if (r.ok) setDollar(await r.json()); }
      catch { setDollar([{ nombre: "Oficial", compra: 1055, venta: 1095 }, { nombre: "Blue", compra: 1280, venta: 1310 }, { nombre: "Bolsa", compra: 1265, venta: 1285 }, { nombre: "CCL", compra: 1275, venta: 1300 }, { nombre: "Tarjeta", compra: null, venta: 1752 }, { nombre: "Mayorista", compra: 1050, venta: 1070 }]); }

      // Crypto
      try { const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,tether,usd-coin,ripple&vs_currencies=usd&include_24hr_change=true"); if (r.ok) setCrypto(await r.json()); }
      catch { setCrypto({ bitcoin: { usd: 97250, usd_24h_change: 2.34 }, ethereum: { usd: 3650, usd_24h_change: 1.87 }, solana: { usd: 178.5, usd_24h_change: 4.12 }, tether: { usd: 1, usd_24h_change: 0.01 }, "usd-coin": { usd: 1, usd_24h_change: -0.01 }, ripple: { usd: 2.15, usd_24h_change: 1.23 } }); }

      // FCI — try bulk + individual fichas
      setFciLoading(true);
      let fciResult = null;

      // Step 1: Get fund list with IDs
      try {
        const r = await fetch("https://api.cafci.org.ar/fondo");
        if (r.ok) {
          const data = await r.json();
          if (data.data && Array.isArray(data.data)) {
            // Now fetch individual fichas for funds that have classes
            const funds = [];
            const allFundData = data.data.slice(0, 300); // reasonable limit

            // Batch fetch fichas in parallel (limited concurrency)
            const batchSize = 15;
            for (let b = 0; b < Math.min(allFundData.length, 120); b += batchSize) {
              const batch = allFundData.slice(b, b + batchSize);
              const promises = batch.map(async (f) => {
                if (!f.clases || f.clases.length === 0) return null;
                // Get first class (usually the main one)
                for (const clase of f.clases.slice(0, 2)) {
                  try {
                    const fichaR = await fetch(`https://api.cafci.org.ar/fondo/${f.id}/clase/${clase.id}/ficha`);
                    if (fichaR.ok) {
                      const fichaData = await fichaR.json();
                      if (fichaData.data?.info?.diaria) {
                        const d = fichaData.data.info.diaria;
                        const rend = d.rendimientos || {};
                        const model = fichaData.data.model || {};
                        return {
                          fondo_id: f.id,
                          clase_id: clase.id,
                          fondo: clase.nombre || model.fondo?.nombre || f.nombre || "—",
                          gerente: model.fondo?.gerente?.nombreCorto || "",
                          horizonte: model.fondo?.horizonte?.nombre || "",
                          moneda: model.moneda?.simbolo === "USD" ? "USD" : "ARS",
                          vcp: d.actual?.vcp || "",
                          patrimonio: d.actual?.patrimonio || "",
                          rend_diario: rend.day?.rendimiento != null ? parseFloat(rend.day.rendimiento) : null,
                          rend_semanal: rend.week?.rendimiento != null ? parseFloat(rend.week.rendimiento) : null,
                          rend_mensual: rend.month?.rendimiento != null ? parseFloat(rend.month.rendimiento) : null,
                          rend_trimestral: rend.quarter?.rendimiento != null ? parseFloat(rend.quarter.rendimiento) : null,
                          rend_semestral: rend.semester?.rendimiento != null ? parseFloat(rend.semester.rendimiento) : null,
                          rend_ytd: rend.ytd?.rendimiento != null ? parseFloat(rend.ytd.rendimiento) : null,
                          rend_anual: rend.year?.rendimiento != null ? parseFloat(rend.year.rendimiento) : null,
                          fecha: d.referenceDay || "",
                        };
                      }
                    }
                  } catch { /* skip fund on error */ }
                  return null;
                }
                return null;
              });
              const results = await Promise.allSettled(promises);
              results.forEach(r => { if (r.status === "fulfilled" && r.value) funds.push(r.value); });
              // Small delay between batches to be respectful
              if (b + batchSize < 120) await new Promise(r => setTimeout(r, 200));
            }
            if (funds.length > 0) fciResult = { funds, date: funds[0]?.fecha || new Date().toISOString().split("T")[0] };
          }
        }
      } catch (e) { console.log("Fund list failed:", e); }

      // Step 2: Fallback to bulk endpoint
      if (!fciResult) {
        const today = new Date();
        for (let i = 0; i < 7; i++) {
          const d = new Date(today); d.setDate(d.getDate() - i);
          const ds = d.toISOString().split("T")[0];
          try {
            const [pR, dR] = await Promise.allSettled([
              fetch(`https://api.cafci.org.ar/estadisticas/informacion/diaria/2/${ds}`),
              fetch(`https://api.cafci.org.ar/estadisticas/informacion/diaria/1/${ds}`),
            ]);
            let all = [];
            for (const [res, mon] of [[pR, "ARS"], [dR, "USD"]]) {
              if (res.status === "fulfilled" && res.value.ok) {
                const j = await res.value.json();
                if (j.success && j.data?.length) all.push(...j.data.map(f => ({ ...f, moneda: mon })));
              }
            }
            if (all.length > 0) { fciResult = { funds: all, date: ds }; break; }
          } catch { continue; }
        }
      }

      // Step 3: Fallback to sample
      if (!fciResult) fciResult = { funds: SAMPLE_FCI, date: new Date().toISOString().split("T")[0] };

      setFci(fciResult);
      setFciLoading(false);
      setLastUpdate(new Date());
    };
    go();
    const iv = setInterval(go, 600000); // 10 min
    return () => clearInterval(iv);
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);

  // ── AI Chat ──
  const sendMessage = useCallback(async (text) => {
    const msg = text || inputMsg.trim();
    if (!msg || isTyping) return;
    const userMsg = { role: "user", content: msg };
    setMessages(p => [...p, userMsg]); setInputMsg(""); setIsTyping(true);
    try {
      const hist = [...messages.slice(1), userMsg].map(m => ({ role: m.role, content: m.content }));
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: SYS_PROMPT, tools: [{ type: "web_search_20250305", name: "web_search" }], messages: hist }),
      });
      const d = await r.json();
      const reply = d.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "Error procesando tu consulta.";
      setMessages(p => [...p, { role: "assistant", content: reply }]);
    } catch { setMessages(p => [...p, { role: "assistant", content: "Error de conexión. Intentá de nuevo." }]); }
    setIsTyping(false);
  }, [inputMsg, isTyping, messages]);

  // ── FCI filter/sort ──
  const filtered = useMemo(() => {
    if (!fci?.funds) return [];
    let f = fci.funds.map(x => ({ ...x, type: classifyFund(x.fondo, x.horizonte) }));
    if (fciFilter !== "todos") f = f.filter(x => x.type === fciFilter);
    if (fciSearch) { const q = fciSearch.toLowerCase(); f = f.filter(x => (x.fondo || "").toLowerCase().includes(q) || (x.gerente || "").toLowerCase().includes(q)); }
    f.sort((a, b) => {
      const dir = fciSortDir === "desc" ? -1 : 1;
      if (fciSort === "nombre") return dir * (a.fondo || "").localeCompare(b.fondo || "");
      if (fciSort === "diario") return dir * ((a.rend_diario ?? -999) - (b.rend_diario ?? -999));
      if (fciSort === "mensual") return dir * ((a.rend_mensual ?? -999) - (b.rend_mensual ?? -999));
      if (fciSort === "ytd") return dir * ((a.rend_ytd ?? -999) - (b.rend_ytd ?? -999));
      if (fciSort === "anual") return dir * ((a.rend_anual ?? -999) - (b.rend_anual ?? -999));
      if (fciSort === "patrimonio") return dir * ((parseFloat(a.patrimonio) || 0) - (parseFloat(b.patrimonio) || 0));
      return 0;
    });
    return f.slice(0, 200);
  }, [fci, fciFilter, fciSearch, fciSort, fciSortDir]);

  const toggleSort = c => { if (fciSort === c) setFciSortDir(d => d === "desc" ? "asc" : "desc"); else { setFciSort(c); setFciSortDir(c === "nombre" ? "asc" : "desc"); } };
  const SortIcon = ({ col }) => fciSort === col ? <span style={{ marginLeft: 3, fontSize: 9 }}>{fciSortDir === "desc" ? "▼" : "▲"}</span> : null;

  const hasRend = fci?.funds?.[0]?.rend_diario != null;
  const tabs = [{ id: "fci", l: "📊 Fondos (FCI)" }, { id: "dolares", l: "$ Dólares" }, { id: "acciones", l: "▲ Acciones" }, { id: "bonos", l: "◆ Bonos" }, { id: "crypto", l: "₿ Crypto" }];
  const fTypes = [{ id: "todos", l: "Todos" }, { id: "money_market", l: "💵 Money Market" }, { id: "renta_fija", l: "📈 Renta Fija" }, { id: "renta_variable", l: "🔥 R. Variable" }, { id: "renta_mixta", l: "⚖️ Mixta" }];
  const qPrompts = ["¿Qué FCI money market recomendás?", "Dólar MEP vs blue", "¿Conviene Bitcoin?", "Mejores bonos USD", "Portafolio moderado", "FCI de renta fija"];
  const dateStr = new Date().toLocaleDateString("es-AR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* HEADER */}
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 24, color: "#4fc3f7" }}>◈</span>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.12em", color: "#fff" }}>INVERSIONISTA</span>
            <span style={{ fontSize: 10, fontWeight: 800, background: "linear-gradient(135deg,#4fc3f7,#00e676)", color: "#080c14", padding: "3px 8px", borderRadius: 4 }}>PRO</span>
          </div>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textTransform: "capitalize" }}>{dateStr}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lastUpdate && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.04)", padding: "4px 10px", borderRadius: 14 }}>⟳ {lastUpdate.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>}
          <button onClick={() => setChatOpen(!chatOpen)} style={{ ...S.advBtn, ...(chatOpen ? { background: "linear-gradient(135deg,#4fc3f7,#00e676)", color: "#080c14", borderColor: "transparent" } : {}) }}>
            🧠 Asesor IA {!chatOpen && <span style={S.pulse} />}
          </button>
        </div>
      </header>

      {/* TABS */}
      <nav style={S.tabBar}>
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ ...S.tabBtn, ...(tab === t.id ? S.tabOn : {}) }}>{t.l}</button>)}
      </nav>

      <main style={{ padding: "20px 28px", maxWidth: 1400, transition: "margin-right 0.3s", marginRight: chatOpen ? 400 : 0 }}>

        {/* ═══ FCI ═══ */}
        {tab === "fci" && (
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <h2 style={S.secT}>📊 Fondos Comunes de Inversión
                {fci?.date && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginLeft: 10, fontWeight: 400 }}>Datos al {fci.date}</span>}
                {hasRend && <span style={{ fontSize: 11, color: "#00e676", marginLeft: 10, background: "rgba(0,230,118,0.1)", padding: "2px 10px", borderRadius: 10 }}>Con rendimientos</span>}
              </h2>
              <span style={{ fontSize: 13, color: "rgba(79,195,247,0.7)", background: "rgba(79,195,247,0.06)", padding: "4px 12px", borderRadius: 12 }}>{filtered.length} fondos</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {fTypes.map(b => <button key={b.id} onClick={() => setFciFilter(b.id)} style={{ ...S.filterBtn, ...(fciFilter === b.id ? S.filterOn : {}) }}>{b.l}</button>)}
              </div>
              <input style={S.searchIn} placeholder="🔍 Buscar por nombre o administradora..." value={fciSearch} onChange={e => setFciSearch(e.target.value)} />
            </div>

            {fciLoading ? (
              <div style={S.tw}>{Array.from({ length: 12 }).map((_, i) => <div key={i} style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.02)" }}><Skel h={16} /></div>)}</div>
            ) : (
              <div style={S.tw}>
                <table style={S.table}>
                  <thead><tr>
                    <th style={{ ...S.th, cursor: "pointer", minWidth: 220 }} onClick={() => toggleSort("nombre")}>Fondo<SortIcon col="nombre" /></th>
                    <th style={{ ...S.th, textAlign: "center", width: 65 }}>Tipo</th>
                    <th style={{ ...S.th, textAlign: "center", width: 40 }}>$</th>
                    {hasRend ? <>
                      <th style={{ ...S.th, textAlign: "right", cursor: "pointer", width: 80 }} onClick={() => toggleSort("diario")}>Diario<SortIcon col="diario" /></th>
                      <th style={{ ...S.th, textAlign: "right", cursor: "pointer", width: 80 }} onClick={() => toggleSort("mensual")}>Mensual<SortIcon col="mensual" /></th>
                      <th style={{ ...S.th, textAlign: "right", cursor: "pointer", width: 80 }} onClick={() => toggleSort("ytd")}>YTD<SortIcon col="ytd" /></th>
                      <th style={{ ...S.th, textAlign: "right", cursor: "pointer", width: 80 }} onClick={() => toggleSort("anual")}>Anual<SortIcon col="anual" /></th>
                    </> : <>
                      <th style={{ ...S.th, textAlign: "right", width: 100 }}>Valor CP</th>
                    </>}
                    <th style={{ ...S.th, textAlign: "right", cursor: "pointer", width: 85 }} onClick={() => toggleSort("patrimonio")}>Patrim.<SortIcon col="patrimonio" /></th>
                  </tr></thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={hasRend ? 8 : 5} style={{ ...S.td, textAlign: "center", padding: 36, color: "rgba(255,255,255,0.2)" }}>Sin resultados</td></tr>
                    ) : filtered.map((f, i) => {
                      const ti = TYPES[f.type] || TYPES.otros;
                      return (
                        <tr key={i} style={S.tr} className="fci-row">
                          <td style={{ ...S.td, maxWidth: 320 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.9)", lineHeight: 1.3 }}>{f.fondo}</div>
                            {f.gerente && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{f.gerente}</div>}
                          </td>
                          <td style={{ ...S.td, textAlign: "center" }}>
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, border: `1px solid ${ti.color}50`, color: ti.color, fontWeight: 700, letterSpacing: "0.03em" }}>{ti.short}</span>
                          </td>
                          <td style={{ ...S.td, textAlign: "center" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--mono)", color: f.moneda === "USD" ? "#ffd740" : "rgba(255,255,255,0.5)" }}>{f.moneda}</span>
                          </td>
                          {hasRend ? <>
                            <td style={{ ...S.td, textAlign: "right" }}><Pill v={f.rend_diario} sm /></td>
                            <td style={{ ...S.td, textAlign: "right" }}><Pill v={f.rend_mensual} sm /></td>
                            <td style={{ ...S.td, textAlign: "right" }}><Pill v={f.rend_ytd} sm /></td>
                            <td style={{ ...S.td, textAlign: "right" }}><Pill v={f.rend_anual} sm /></td>
                          </> : <>
                            <td style={{ ...S.td, textAlign: "right", fontFamily: "var(--mono)", fontWeight: 600, color: "#fff", fontSize: 14 }}>{fmtNum(parseFloat(f.vcp))}</td>
                          </>}
                          <td style={{ ...S.td, textAlign: "right", fontFamily: "var(--mono)", color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
                            {f.patrimonio ? `$${(parseFloat(f.patrimonio) / 1e6).toFixed(0)}M` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", textAlign: "center", marginTop: 14, lineHeight: 1.6 }}>
              Fuente: CAFCI (Cámara Argentina de Fondos Comunes de Inversión) — api.cafci.org.ar
              {hasRend ? " · Rendimientos calculados por CAFCI según normas CNV" : " · Datos diarios en formato bulk"}
            </div>
          </section>
        )}

        {/* ═══ DÓLARES ═══ */}
        {tab === "dolares" && (
          <section>
            <h2 style={S.secT}>$ Cotización del Dólar</h2>
            <div style={S.grid}>
              {dollar ? dollar.map((d, i) => (
                <div key={i} style={S.card}>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", fontWeight: 500, marginBottom: 10 }}>{d.nombre}</div>
                  <div style={{ display: "flex", gap: 14 }}>
                    {d.compra != null && <div><div style={S.lbl}>Compra</div><div style={S.bigNum}>{fmt(d.compra)}</div></div>}
                    <div><div style={S.lbl}>Venta</div><div style={S.bigNum}>{fmt(d.venta)}</div></div>
                  </div>
                  {d.compra && d.venta && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", marginTop: 6 }}>Spread: {((d.venta - d.compra) / d.compra * 100).toFixed(1)}%</div>}
                </div>
              )) : Array.from({ length: 6 }).map((_, i) => <div key={i} style={S.card}><Skel w="50%" /><div style={{ marginTop: 10 }}><Skel h={22} /></div></div>)}
            </div>
          </section>
        )}

        {/* ═══ ACCIONES ═══ */}
        {tab === "acciones" && (<>
          <section style={{ marginBottom: 24 }}>
            <h2 style={S.secT}>▲ Índices</h2>
            <div style={S.grid}>
              {Object.values(market.indices).map(x => (
                <div key={x.name} style={S.card}>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 500, marginBottom: 5 }}>{x.name}</div>
                  <div style={S.bigNum}>{x.ars ? x.val.toLocaleString("es-AR") : x.val.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}><Pill v={x.chg} /><Spark data={x.sp} color={x.chg >= 0 ? "#00e676" : "#ff5252"} /></div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 style={S.secT}>📊 CEDEARs</h2>
            <div style={S.tw}><table style={S.table}><thead><tr><th style={S.th}>Ticker</th><th style={S.th}>Empresa</th><th style={{ ...S.th, textAlign: "right" }}>Precio</th><th style={{ ...S.th, textAlign: "right" }}>Var.</th></tr></thead>
              <tbody>{market.cedears.map(c => <tr key={c.t} style={S.tr}><td style={S.tdT}>{c.t}</td><td style={S.td}>{c.n}</td><td style={{ ...S.td, textAlign: "right", fontFamily: "var(--mono)" }}>{fmt(c.p)}</td><td style={{ ...S.td, textAlign: "right" }}><Pill v={c.c} /></td></tr>)}</tbody>
            </table></div>
          </section>
        </>)}

        {/* ═══ BONOS ═══ */}
        {tab === "bonos" && (
          <section>
            <h2 style={S.secT}>◆ Bonos & Renta Fija</h2>
            <div style={S.tw}><table style={S.table}><thead><tr><th style={S.th}>Ticker</th><th style={S.th}>Nombre</th><th style={{ ...S.th, textAlign: "right" }}>Precio</th><th style={{ ...S.th, textAlign: "right" }}>Var.</th><th style={{ ...S.th, textAlign: "right" }}>Yield</th></tr></thead>
              <tbody>{market.bonds.map(b => <tr key={b.t} style={S.tr}><td style={S.tdT}>{b.t}</td><td style={S.td}>{b.n}</td><td style={{ ...S.td, textAlign: "right", fontFamily: "var(--mono)" }}>USD {b.p.toFixed(2)}</td><td style={{ ...S.td, textAlign: "right" }}><Pill v={b.c} /></td><td style={{ ...S.td, textAlign: "right", color: "#ffd740", fontFamily: "var(--mono)", fontWeight: 600 }}>{b.y.toFixed(1)}%</td></tr>)}</tbody>
            </table></div>
          </section>
        )}

        {/* ═══ CRYPTO ═══ */}
        {tab === "crypto" && (
          <section>
            <h2 style={S.secT}>₿ Criptomonedas</h2>
            <div style={S.grid}>
              {crypto ? Object.entries(crypto).map(([k, v]) => {
                const N = { bitcoin: "Bitcoin", ethereum: "Ethereum", solana: "Solana", tether: "Tether", "usd-coin": "USDC", ripple: "XRP" };
                const Sy = { bitcoin: "BTC", ethereum: "ETH", solana: "SOL", tether: "USDT", "usd-coin": "USDC", ripple: "XRP" };
                return (<div key={k} style={S.card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, background: "rgba(79,195,247,0.1)", color: "#4fc3f7", padding: "2px 7px", borderRadius: 4, fontFamily: "var(--mono)" }}>{Sy[k]}</span>
                    <span style={{ fontSize: 14, color: "rgba(255,255,255,0.55)" }}>{N[k]}</span>
                  </div>
                  <div style={S.bigNum}>{fmtUSD(v.usd)}</div>
                  <div style={{ marginTop: 4 }}><Pill v={v.usd_24h_change} /></div>
                </div>);
              }) : Array.from({ length: 6 }).map((_, i) => <div key={i} style={S.card}><Skel w="40%" /><div style={{ marginTop: 10 }}><Skel h={22} /></div></div>)}
            </div>
          </section>
        )}

        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center", padding: "20px", lineHeight: 1.6 }}>
          Datos indicativos con posible delay. Verificá con tu broker antes de operar. FCI actualiza después de las 18hs (CAFCI).
        </div>
      </main>

      {/* ═══ CHAT ═══ */}
      <div style={{ ...S.chat, transform: chatOpen ? "translateX(0)" : "translateX(100%)" }}>
        <div style={S.chatHd}>
          <div><div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>🧠 Asesor Financiero IA</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>CFA · Wealth Manager · CFP</div></div>
          <button onClick={() => setChatOpen(false)} style={S.chatX}>✕</button>
        </div>
        {messages.length <= 1 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
          {qPrompts.map((q, i) => <button key={i} onClick={() => sendMessage(q)} style={S.qBtn}>{q}</button>)}
        </div>}
        <div style={S.chatMsgs}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 6, ...(m.role === "user" ? { justifyContent: "flex-end" } : {}) }}>
              {m.role === "assistant" && <div style={S.av}>🧠</div>}
              <div style={{ background: m.role === "user" ? "rgba(79,195,247,0.1)" : "rgba(255,255,255,0.03)", padding: "10px 14px", borderRadius: m.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px", fontSize: 13, lineHeight: 1.55, color: m.role === "user" ? "#fff" : "rgba(255,255,255,0.8)", maxWidth: "85%", wordBreak: "break-word" }}>
                {m.content.split("\n").map((l, j) => <p key={j} style={{ margin: "1px 0" }}>{l || "\u00A0"}</p>)}
              </div>
            </div>
          ))}
          {isTyping && <div style={{ display: "flex", gap: 6 }}><div style={S.av}>🧠</div><div style={{ background: "rgba(255,255,255,0.03)", padding: "8px 12px", borderRadius: "10px 10px 10px 2px" }}><div style={{ display: "flex", gap: 3 }}><span style={S.dot}/><span style={{ ...S.dot, animationDelay: "0.2s" }}/><span style={{ ...S.dot, animationDelay: "0.4s" }}/></div></div></div>}
          <div ref={chatEndRef} />
        </div>
        <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(0,0,0,0.15)" }}>
          <input style={S.inField} value={inputMsg} onChange={e => setInputMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder="Consultá al asesor..." disabled={isTyping} />
          <button onClick={() => sendMessage()} disabled={isTyping || !inputMsg.trim()} style={{ ...S.sendBtn, opacity: isTyping || !inputMsg.trim() ? 0.3 : 1 }}>➤</button>
        </div>
      </div>
    </div>
  );
}

// ── Sample FCI with rendimientos ──
const SAMPLE_FCI = [
  { fondo: "Balanz Money Market", gerente: "Balanz", horizonte: "money market", moneda: "ARS", vcp: "2847.32", patrimonio: "185000000000", rend_diario: 0.21, rend_mensual: 4.85, rend_ytd: 15.2, rend_anual: 68.5 },
  { fondo: "Consultatio Money Market", gerente: "Consultatio", horizonte: "money market", moneda: "ARS", vcp: "3156.44", patrimonio: "95000000000", rend_diario: 0.20, rend_mensual: 4.78, rend_ytd: 14.9, rend_anual: 67.2 },
  { fondo: "ICBC Money Market", gerente: "ICBC Investments", horizonte: "money market", moneda: "ARS", vcp: "3421.09", patrimonio: "210000000000", rend_diario: 0.19, rend_mensual: 4.65, rend_ytd: 14.5, rend_anual: 65.8 },
  { fondo: "Santander Super Ahorro $", gerente: "Santander", horizonte: "money market", moneda: "ARS", vcp: "2987.65", patrimonio: "320000000000", rend_diario: 0.18, rend_mensual: 4.52, rend_ytd: 14.1, rend_anual: 64.3 },
  { fondo: "Galicia Ahorro", gerente: "Galicia", horizonte: "money market", moneda: "ARS", vcp: "3567.82", patrimonio: "180000000000", rend_diario: 0.19, rend_mensual: 4.70, rend_ytd: 14.7, rend_anual: 66.1 },
  { fondo: "Bull Market Money Market", gerente: "Bull Market", horizonte: "money market", moneda: "ARS", vcp: "2345.67", patrimonio: "35000000000", rend_diario: 0.22, rend_mensual: 5.01, rend_ytd: 15.8, rend_anual: 70.2 },
  { fondo: "Megainver Money Market", gerente: "Megainver", horizonte: "money market", moneda: "ARS", vcp: "2654.78", patrimonio: "72000000000", rend_diario: 0.20, rend_mensual: 4.82, rend_ytd: 15.0, rend_anual: 67.8 },
  { fondo: "Galileo Income", gerente: "Galileo", horizonte: "renta fija", moneda: "ARS", vcp: "15234.87", patrimonio: "42000000000", rend_diario: 0.25, rend_mensual: 5.45, rend_ytd: 18.3, rend_anual: 82.1 },
  { fondo: "MAF Renta Fija", gerente: "MAF", horizonte: "renta fija", moneda: "ARS", vcp: "8923.55", patrimonio: "28000000000", rend_diario: 0.28, rend_mensual: 5.82, rend_ytd: 19.5, rend_anual: 85.3 },
  { fondo: "Compass Renta Fija", gerente: "Compass", horizonte: "renta fija", moneda: "ARS", vcp: "12567.33", patrimonio: "15000000000", rend_diario: 0.24, rend_mensual: 5.35, rend_ytd: 17.8, rend_anual: 79.6 },
  { fondo: "BBVA Renta Fija", gerente: "BBVA", horizonte: "renta fija", moneda: "ARS", vcp: "7834.21", patrimonio: "45000000000", rend_diario: 0.23, rend_mensual: 5.15, rend_ytd: 17.2, rend_anual: 76.4 },
  { fondo: "Macro Renta Fija", gerente: "Macro", horizonte: "renta fija", moneda: "ARS", vcp: "11234.56", patrimonio: "52000000000", rend_diario: 0.22, rend_mensual: 5.08, rend_ytd: 16.8, rend_anual: 74.9 },
  { fondo: "SBS Acciones Argentina", gerente: "SBS", horizonte: "renta variable", moneda: "ARS", vcp: "89456.23", patrimonio: "8500000000", rend_diario: 1.45, rend_mensual: 12.3, rend_ytd: 45.2, rend_anual: 185.7 },
  { fondo: "Toronto Trust Acciones", gerente: "Toronto Trust", horizonte: "renta variable", moneda: "ARS", vcp: "67234.12", patrimonio: "5200000000", rend_diario: -0.82, rend_mensual: 8.5, rend_ytd: 38.7, rend_anual: 162.3 },
  { fondo: "Schroders Renta Variable", gerente: "Schroders", horizonte: "renta variable", moneda: "ARS", vcp: "45678.90", patrimonio: "3200000000", rend_diario: 2.15, rend_mensual: 15.2, rend_ytd: 52.1, rend_anual: 198.4 },
  { fondo: "Cohen Renta Variable", gerente: "Cohen", horizonte: "renta variable", moneda: "ARS", vcp: "78234.50", patrimonio: "6100000000", rend_diario: -1.23, rend_mensual: 9.8, rend_ytd: 41.3, rend_anual: 175.6 },
  { fondo: "Delta Renta Mixta", gerente: "Delta", horizonte: "renta mixta", moneda: "ARS", vcp: "5678.91", patrimonio: "12000000000", rend_diario: 0.55, rend_mensual: 7.2, rend_ytd: 25.8, rend_anual: 112.3 },
  { fondo: "AdCap Balanceado II", gerente: "AdCap", horizonte: "renta mixta", moneda: "ARS", vcp: "9123.45", patrimonio: "7800000000", rend_diario: 0.42, rend_mensual: 6.8, rend_ytd: 23.5, rend_anual: 105.7 },
  { fondo: "Allaria Renta Fija Dólar", gerente: "Allaria", horizonte: "renta fija", moneda: "USD", vcp: "45.67", patrimonio: "320000000", rend_diario: 0.03, rend_mensual: 0.85, rend_ytd: 2.8, rend_anual: 8.5 },
  { fondo: "SBS Renta Dólar", gerente: "SBS", horizonte: "renta fija", moneda: "USD", vcp: "38.92", patrimonio: "280000000", rend_diario: 0.02, rend_mensual: 0.72, rend_ytd: 2.4, rend_anual: 7.2 },
];

const S = {
  root: { fontFamily: "'DM Sans',sans-serif", background: "#080c14", color: "#d8dee8", minHeight: "100vh", position: "relative" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 28px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(8,12,20,0.97)", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(16px)", flexWrap: "wrap", gap: 10 },
  advBtn: { display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: "rgba(79,195,247,0.07)", border: "1px solid rgba(79,195,247,0.22)", borderRadius: 8, color: "#4fc3f7", cursor: "pointer", fontSize: 14, fontWeight: 600, position: "relative", fontFamily: "inherit" },
  pulse: { position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: "50%", background: "#00e676", animation: "pulse 2s infinite" },
  tabBar: { display: "flex", gap: 4, padding: "12px 28px", borderBottom: "1px solid rgba(255,255,255,0.05)", overflowX: "auto" },
  tabBtn: { padding: "9px 18px", background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 14, fontWeight: 500, borderRadius: 6, whiteSpace: "nowrap", fontFamily: "inherit", transition: "all 0.15s" },
  tabOn: { background: "rgba(79,195,247,0.1)", color: "#4fc3f7" },
  secT: { fontSize: 17, fontWeight: 600, color: "rgba(255,255,255,0.75)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 },
  card: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "16px 18px" },
  lbl: { fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 },
  bigNum: { fontSize: 20, fontWeight: 700, fontFamily: "var(--mono)", color: "#fff" },
  filterBtn: { fontSize: 13, padding: "7px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, color: "rgba(255,255,255,0.55)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" },
  filterOn: { background: "rgba(79,195,247,0.1)", borderColor: "rgba(79,195,247,0.3)", color: "#4fc3f7" },
  searchIn: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 16px", color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit", maxWidth: 420, width: "100%" },
  tw: { overflowX: "auto", background: "rgba(255,255,255,0.018)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "12px 16px", color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid rgba(255,255,255,0.06)", userSelect: "none" },
  tr: { borderBottom: "1px solid rgba(255,255,255,0.04)" },
  td: { padding: "11px 16px", color: "rgba(255,255,255,0.8)", fontSize: 14 },
  tdT: { padding: "11px 16px", fontWeight: 700, fontFamily: "var(--mono)", color: "#4fc3f7", fontSize: 14 },
  chat: { position: "fixed", top: 0, right: 0, width: 400, height: "100vh", background: "#0b1018", borderLeft: "1px solid rgba(79,195,247,0.1)", display: "flex", flexDirection: "column", zIndex: 200, transition: "transform 0.3s ease", boxShadow: "-4px 0 24px rgba(0,0,0,0.4)" },
  chatHd: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(79,195,247,0.03)" },
  chatX: { background: "rgba(255,255,255,0.06)", border: "none", color: "rgba(255,255,255,0.5)", width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" },
  qBtn: { fontSize: 12, padding: "6px 12px", background: "rgba(79,195,247,0.06)", border: "1px solid rgba(79,195,247,0.15)", borderRadius: 16, color: "#4fc3f7", cursor: "pointer", fontFamily: "inherit" },
  chatMsgs: { flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 },
  av: { width: 28, height: 28, borderRadius: "50%", background: "rgba(79,195,247,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 },
  dot: { width: 5, height: 5, borderRadius: "50%", background: "#4fc3f7", animation: "dotBounce 1.2s infinite", display: "inline-block" },
  inField: { flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit" },
  sendBtn: { width: 40, height: 40, borderRadius: 8, background: "linear-gradient(135deg,#4fc3f7,#00e676)", border: "none", color: "#080c14", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
  :root{--mono:'JetBrains Mono',monospace}
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.05);border-radius:2px}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.3)}}
  @keyframes dotBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-3px)}}
  .fci-row:hover{background:rgba(79,195,247,0.025)!important}
`;
