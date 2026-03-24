// /api/market.js — Vercel Serverless Function
// Proxy para Yahoo Finance v8 — resuelve CORS desde el browser
// GET /api/market?tickers=^GSPC,^IXIC,^DJI,^MERV,AAPL.BA,...

const YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const YF_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; InversionistaPro/1.0)" };

async function fetchTicker(ticker) {
  const url = `${YF_BASE}/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
  const r = await fetch(url, { headers: YF_HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error("no price");
  const price = meta.regularMarketPrice;
  const prev  = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
  return { price, prev, changePct };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  if (req.method === "OPTIONS") return res.status(200).end();

  const raw = req.query.tickers ?? "";
  const tickers = raw.split(",").map(t => t.trim()).filter(Boolean);
  if (!tickers.length) return res.status(400).json({ error: "No tickers provided" });

  const results = await Promise.allSettled(tickers.map(t => fetchTicker(t)));

  const out = {};
  tickers.forEach((t, i) => {
    if (results[i].status === "fulfilled") out[t] = results[i].value;
  });

  return res.status(200).json(out);
}
