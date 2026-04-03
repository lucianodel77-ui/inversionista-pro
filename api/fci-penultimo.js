// /api/fci-penultimo.js — Proxy para VCP penúltimo de FCI (ArgentinaDatos)
// Necesario para calcular rendimiento diario real: (VCP_hoy / VCP_ayer) - 1

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Cacheo corto: los datos del penúltimo pueden actualizarse durante el día
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");

  const { tipo } = req.query;
  if (!tipo) {
    return res.status(400).json({ error: "Falta parámetro: tipo requerido" });
  }

  const validTipos = ["mercadoDinero", "rentaFija", "rentaVariable", "rentaMixta", "otros"];
  if (!validTipos.includes(tipo)) {
    return res.status(400).json({ error: `Tipo inválido. Valores permitidos: ${validTipos.join(", ")}` });
  }

  try {
    const r = await fetch(
      `https://api.argentinadatos.com/v1/finanzas/fci/${tipo}/penultimo`,
      { headers: { Accept: "application/json" } }
    );
    if (!r.ok) {
      return res.status(r.status).json({ error: `ArgentinaDatos respondió ${r.status}` });
    }
    const data = await r.json();
    return res.status(200).json(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error("fci-penultimo error:", e);
    return res.status(500).json({ error: "Error al contactar ArgentinaDatos" });
  }
}
