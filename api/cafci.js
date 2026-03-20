// /api/cafci.js — Vercel Serverless Function
// Proxies CAFCI API requests with proper browser headers

const CAFCI_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
  "Referer": "https://www.cafci.org.ar/",
  "Origin": "https://www.cafci.org.ar",
};

async function cafciFetch(url) {
  const r = await fetch(url, { headers: CAFCI_HEADERS });
  if (!r.ok) throw new Error(`CAFCI ${r.status} for ${url}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  const { mode } = req.query;

  try {
    if (mode === "fichas") {
      const fundListData = await cafciFetch("https://api.cafci.org.ar/fondo");
      if (!fundListData.data || !Array.isArray(fundListData.data)) throw new Error("No fund list");

      const allFunds = fundListData.data.slice(0, 300);
      const funds = [];
      const batchSize = 20;

      for (let b = 0; b < Math.min(allFunds.length, 200); b += batchSize) {
        const batch = allFunds.slice(b, b + batchSize);
        const promises = batch.map(async (f) => {
          if (!f.clases || f.clases.length === 0) return null;
          for (const clase of f.clases.slice(0, 2)) {
            try {
              const fichaData = await cafciFetch(
                `https://api.cafci.org.ar/fondo/${f.id}/clase/${clase.id}/ficha`
              );
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
            } catch { /* skip */ }
          }
          return null;
        });

        const results = await Promise.allSettled(promises);
        results.forEach((r) => {
          if (r.status === "fulfilled" && r.value) funds.push(r.value);
        });
        if (b + batchSize < 200) await new Promise((r) => setTimeout(r, 150));
      }

      if (funds.length > 0) {
        return res.status(200).json({
          success: true, mode: "fichas", count: funds.length,
          date: funds[0]?.fecha || new Date().toISOString().split("T")[0],
          funds,
        });
      }
      throw new Error("No fichas collected");
    }

    // Bulk mode
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      try {
        let all = [];
        for (const [monId, mon] of [["2", "ARS"], ["1", "USD"]]) {
          try {
            const j = await cafciFetch(
              `https://api.cafci.org.ar/estadisticas/informacion/diaria/${monId}/${ds}`
            );
            if (j.success && j.data?.length) {
              all.push(...j.data.map((f) => ({ ...f, moneda: mon })));
            }
          } catch { /* skip */ }
        }
        if (all.length > 0) {
          return res.status(200).json({
            success: true, mode: "bulk", count: all.length, date: ds, funds: all,
          });
        }
      } catch { continue; }
    }

    return res.status(200).json({ success: false, mode: "none", funds: [] });
  } catch (error) {
    console.error("CAFCI error:", error.message);
    return res.status(200).json({ success: false, error: error.message, funds: [] });
  }
}
