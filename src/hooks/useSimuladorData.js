import { useState, useEffect, useMemo } from "react";

// ── Defaults y fallback de IPC ──────────────────────────────────────
const DEFAULTS = { capital: 1_000_000, plazo: 30, tna_pf: 37, tea_mm: 70, inflacion: 3.5 };

// Últimos valores reales conocidos (fallback si la API falla)
const FALLBACK_IPC = [
  { fecha: "2024-10", valor: 2.4 },
  { fecha: "2024-11", valor: 2.4 },
  { fecha: "2024-12", valor: 2.7 },
  { fecha: "2025-01", valor: 2.3 },
  { fecha: "2025-02", valor: 2.4 },
];

// ── Hook ─────────────────────────────────────────────────────────────
/**
 * useSimuladorData
 *
 * Encapsula:
 *  - Estado editable del simulador (sim / setSim)
 *  - Fetch del IPC mensual desde ArgentinaDatos con fallback
 *  - Pre-llenado automático desde datos FCI en vivo
 *  - Cálculos derivados memorizados (simResults)
 *
 * @param {object|null} fci  Objeto FCI de App: { funds, benchmarkTNA, benchmarkTEA }
 */
export function useSimuladorData(fci) {
  const [sim, setSim] = useState(DEFAULTS);
  const [inflacionData, setInflacionData] = useState(null);
  const [inflLoading, setInflLoading] = useState(true);

  // ── Fetch IPC mensual ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const fetchIPC = async () => {
      setInflLoading(true);
      try {
        const r = await fetch("https://api.argentinadatos.com/v1/finanzas/indices/inflacion");
        if (!r.ok) throw new Error("HTTP " + r.status);
        const data = await r.json();
        if (!cancelled) {
          setInflacionData(Array.isArray(data) && data.length > 0 ? data : FALLBACK_IPC);
        }
      } catch {
        if (!cancelled) setInflacionData(FALLBACK_IPC);
      } finally {
        if (!cancelled) setInflLoading(false);
      }
    };

    fetchIPC();
    return () => { cancelled = true; };
  }, []);

  // ── Pre-llenado desde FCI en vivo ─────────────────────────────────
  // Toma la TNA benchmark (depósitos 30d) y la TEA del mejor MM real
  useEffect(() => {
    if (!fci?.funds) return;
    const bestMM = fci.funds
      .filter(f => f.type === "money_market" && f.tea != null && f.tea > 0 && f.tea < 2000)
      .sort((a, b) => b.tea - a.tea)[0];
    setSim(s => ({
      ...s,
      tna_pf: fci.benchmarkTNA != null ? Math.round(fci.benchmarkTNA * 10) / 10 : s.tna_pf,
      tea_mm: bestMM        ? Math.round(bestMM.tea  * 10) / 10 : s.tea_mm,
    }));
  }, [fci]);

  // ── Pre-llenado del IPC cuando llegan los datos ───────────────────
  useEffect(() => {
    if (!inflacionData?.length) return;
    const last = inflacionData[inflacionData.length - 1];
    if (last?.valor != null) {
      setSim(s => ({ ...s, inflacion: Math.round(parseFloat(last.valor) * 10) / 10 }));
    }
  }, [inflacionData]);

  // ── Cálculos memorizados ──────────────────────────────────────────
  const simResults = useMemo(() => {
    const { capital, plazo, tna_pf, tea_mm, inflacion } = sim;
    if (!capital || !plazo || capital <= 0 || plazo <= 0) return null;

    const tna = tna_pf  || 0;
    const tea = tea_mm  || 0;
    const inf = inflacion || 0;

    // Plazo Fijo: interés simple (convención argentina estándar)
    const pf_final      = capital * (1 + (tna / 100) / 365 * plazo);
    const pf_ganancia   = pf_final - capital;
    const pf_rendimiento = (pf_ganancia / capital) * 100;

    // Money Market: capitalización diaria compuesta
    // daily_rate = (1 + TEA)^(1/365) - 1
    const daily_rate    = Math.pow(1 + tea / 100, 1 / 365) - 1;
    const mm_final      = capital * Math.pow(1 + daily_rate, plazo);
    const mm_ganancia   = mm_final - capital;
    const mm_rendimiento = (mm_ganancia / capital) * 100;

    // Inflación: compuesta mensual
    const infl_factor    = Math.pow(1 + inf / 100, plazo / 30);
    const infl_adjusted  = capital * infl_factor;
    const infl_rendimiento = (infl_factor - 1) * 100;

    // Retorno real (poder adquisitivo)
    const pf_real = ((pf_final  / infl_adjusted) - 1) * 100;
    const mm_real = ((mm_final  / infl_adjusted) - 1) * 100;

    // Curva diaria para el gráfico (máx 90 puntos)
    const steps = Math.min(plazo, 90);
    const chartData = Array.from({ length: steps + 1 }, (_, i) => {
      const d = (i / steps) * plazo;
      return {
        day:  Math.round(d),
        pf:   capital * (1 + (tna / 100) / 365 * d),
        mm:   capital * Math.pow(1 + daily_rate, d),
        infl: capital * Math.pow(1 + inf / 100, d / 30),
      };
    });

    return {
      pf_final, pf_ganancia, pf_rendimiento, pf_real,
      mm_final, mm_ganancia, mm_rendimiento, mm_real,
      infl_adjusted, infl_rendimiento,
      chartData,
    };
  }, [sim]);

  return { sim, setSim, simResults, inflacionData, inflLoading };
}
