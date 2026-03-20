// /api/cafci.js — Vercel Serverless Function
// Proxies CAFCI API requests to avoid CORS issues in the browser

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600"); // Cache 5 min

  const { mode } = req.query; // "fichas" or "bulk"

  try {
    if (mode === "fichas") {
      // Strategy 1: Get fund list + individual fichas with rendimientos
      const fundListRes = await fetch("https://api.cafci.org.ar/fondo");
      if (!fundListRes.ok) throw new Error("Fund list failed");

      const fundListData = await fundListRes.json();
      if (!fundListData.data || !Array.isArray(fundListData.data)) throw new Error("No fund data");

      const allFunds = fundListData.data.slice(0, 300);
      const funds = [];
      const batchSize = 20;

      for (let b = 0; b < Math.min(allFunds.length, 200); b += batchSize) {
        const batch = allFunds.slice(b, b + batchSize);
        const promises = batch.map(async (f) => {
          if (!f.clases || f.clases.length === 0) return null;
          for (const clase of f.clases.slice(0, 2)) {
            try {
              const fichaRes = await fetch(
                `https://api.cafci.org.ar/fondo/${f.id}/clase/${clase.id}/ficha`
              );
              if (!fichaRes.ok) continue;
              const fichaData = await fichaRes.json();
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
            } catch {
              // Skip this fund/class on error
            }
          }
          return null;
        });

        const results = await Promise.allSettled(promises);
        results.forEach((r) => {
          if (r.status === "fulfilled" && r.value) funds.push(r.value);
        });

        // Small delay between batches
        if (b + batchSize < 200) await new Promise((r) => setTimeout(r, 150));
      }

      if (funds.length > 0) {
        return res.status(200).json({
          success: true,
          mode: "fichas",
          date: funds[0]?.fecha || new Date().toISOString().split("T")[0],
          funds,
        });
      }
      // If fichas failed, fall through to bulk
      throw new Error("No fichas data");
    }

    // Strategy 2 (default/fallback): Bulk endpoint
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];

      try {
        const [pesosRes, dollarRes] = await Promise.allSettled([
          fetch(`https://api.cafci.org.ar/estadisticas/informacion/diaria/2/${ds}`),
          fetch(`https://api.cafci.org.ar/estadisticas/informacion/diaria/1/${ds}`),
        ]);

        let all = [];
        for (const [r, mon] of [[pesosRes, "ARS"], [dollarRes, "USD"]]) {
          if (r.status === "fulfilled" && r.value.ok) {
            const j = await r.value.json();
            if (j.success && j.data?.length) {
              all.push(...j.data.map((f) => ({ ...f, moneda: mon })));
            }
          }
        }

        if (all.length > 0) {
          return res.status(200).json({
            success: true,
            mode: "bulk",
            date: ds,
            funds: all,
          });
        }
      } catch {
        continue;
      }
    }

    return res.status(200).json({ success: false, mode: "none", funds: [] });
  } catch (error) {
    console.error("CAFCI proxy error:", error.message);
    // Try bulk as final fallback
    try {
      const today = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const ds = d.toISOString().split("T")[0];
        const r = await fetch(`https://api.cafci.org.ar/estadisticas/informacion/diaria/2/${ds}`);
        if (r.ok) {
          const j = await r.json();
          if (j.success && j.data?.length) {
            return res.status(200).json({
              success: true,
              mode: "bulk_fallback",
              date: ds,
              funds: j.data.map((f) => ({ ...f, moneda: "ARS" })),
            });
          }
        }
      }
    } catch {}
    return res.status(500).json({ success: false, error: "CAFCI API unavailable" });
  }
}
