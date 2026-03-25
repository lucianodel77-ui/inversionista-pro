// /api/fci-history.js — Proxy para datos históricos de FCI de ArgentinaDatos
// Evita CORS y reintenta con fechas anteriores (fines de semana / feriados)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Cacheo agresivo: datos históricos no cambian
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=172800");

  const { tipo, fecha } = req.query;
  if (!tipo || !fecha) {
    return res.status(400).json({ error: "Faltan parámetros: tipo y fecha requeridos" });
  }

  // Reintentar hasta 5 días hacia atrás (fines de semana / feriados)
  const baseDate = new Date(fecha + "T00:00:00Z");
  for (let i = 0; i < 5; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    try {
      const r = await fetch(
        `https://api.argentinadatos.com/v1/finanzas/fci/${tipo}/${ds}`,
        { headers: { "Accept": "application/json" } }
      );
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data) && data.length > 0) {
          return res.status(200).json({ date: ds, data });
        }
      }
    } catch { /* intentar fecha anterior */ }
  }

  return res.status(200).json({ date: fecha, data: [] });
}
