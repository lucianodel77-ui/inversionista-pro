// ═══════════════════════════════════════════════════════════
// INVERSIONISTA PRO v4 — FINANCE SERVICE
// Lógica de cálculos, liquidación y alertas
// ═══════════════════════════════════════════════════════════

/**
 * Calcula TNA y TEA a partir de la variación diaria porcentual.
 * @param {number} variacion - Variación diaria en % (ej: 0.18 = 0.18%)
 */
export const calculateRates = (variacion) => {
  if (variacion == null || isNaN(variacion)) return { tna: null, tea: null };
  const dailyDecimal = variacion / 100;
  const tna = dailyDecimal * 365 * 100;
  const tea = ((1 + dailyDecimal) ** 365 - 1) * 100;
  return { tna: +tna.toFixed(2), tea: +tea.toFixed(2) };
};

/**
 * Determina el plazo de acreditación según nombre y tipo de fondo.
 * @param {string} name - Nombre del fondo
 * @param {string} type - Tipo de fondo (money_market, renta_fija, etc.)
 */
export const getSettlement = (name, type) => {
  const n = (name || '').toLowerCase();
  if (
    type === 'money_market' ||
    n.includes('ahorro') ||
    n.includes('disponibilidad') ||
    n.includes('inmediato') ||
    n.includes('liquidez')
  ) return 'T+0';

  if (
    type === 'renta_fija' &&
    (n.includes('pesos') || n.includes('cer') || n.includes('plus') || n.includes('gestion'))
  ) return 'T+1';

  return 'T+2';
};

/**
 * Genera alertas financieras basadas en datos de mercado.
 * @param {Array|null} dollar - Array de cotizaciones de dólares
 * @param {object|null} fci - Objeto con fondos y benchmark
 * @returns {Array} Lista de alertas activas
 */
export const getFinancialAlerts = (dollar, fci) => {
  const alerts = [];

  if (dollar) {
    const mep = dollar.find(d => d.nombre === 'Bolsa')?.venta;
    const blue = dollar.find(d => d.nombre === 'Blue')?.venta;

    if (mep && blue) {
      const gap = (blue - mep) / mep;
      if (gap > 0.05) {
        alerts.push({
          id: 'mep-blue-gap',
          type: 'opportunity',
          severity: gap > 0.10 ? 'high' : 'medium',
          title: 'Oportunidad de Puré',
          msg: `Brecha MEP/Blue del ${(gap * 100).toFixed(1)}%. Ventana de arbitraje abierta.`,
          icon: '⚖️',
          value: gap,
        });
      }
    }

    const oficial = dollar.find(d => d.nombre === 'Oficial')?.venta;
    const blueRate = dollar.find(d => d.nombre === 'Blue')?.venta;
    if (oficial && blueRate) {
      const gap = (blueRate - oficial) / oficial;
      if (gap > 0.50) {
        alerts.push({
          id: 'brecha-cambiaria',
          type: 'warning',
          severity: gap > 1.0 ? 'high' : 'medium',
          title: 'Brecha Cambiaria Elevada',
          msg: `Brecha oficial/blue del ${(gap * 100).toFixed(0)}%. Riesgo de salto cambiario latente.`,
          icon: '🚨',
          value: gap,
        });
      }
    }
  }

  if (fci?.funds) {
    const INFLATION_EST = 80;
    const mmFunds = fci.funds.filter(f => f.type === 'money_market' && f.tea > 0);
    if (mmFunds.length > 0) {
      const avgMM = mmFunds.reduce((acc, f) => acc + f.tea, 0) / mmFunds.length;
      if (avgMM < INFLATION_EST) {
        alerts.push({
          id: 'tasa-real-negativa',
          type: 'warning',
          severity: 'high',
          title: 'Tasa Real Negativa',
          msg: `TEA promedio MM (${avgMM.toFixed(1)}%) < Inflación estimada (${INFLATION_EST}%). Cobertura insuficiente.`,
          icon: '⚠️',
          value: avgMM - INFLATION_EST,
        });
      }
    }
  }

  return alerts;
};

/**
 * Calcula la ganancia neta de un arbitraje MEP→Blue.
 * @param {number} amount - Monto en ARS a invertir
 * @param {number} mepRate - Tipo de cambio MEP (compra)
 * @param {number} blueRate - Tipo de cambio Blue (venta)
 * @param {number} commissionPct - Comisión en % (default: 0.5)
 */
export const calcArbitrage = (amount, mepRate, blueRate, commissionPct = 0.5) => {
  if (!amount || !mepRate || !blueRate) return null;
  const comm = commissionPct / 100;
  const usdBought = (amount / mepRate) * (1 - comm);
  const arsReceived = usdBought * blueRate * (1 - comm);
  const profit = arsReceived - amount;
  const profitPct = (profit / amount) * 100;
  return {
    usdBought: +usdBought.toFixed(2),
    arsReceived: +arsReceived.toFixed(2),
    profit: +profit.toFixed(2),
    profitPct: +profitPct.toFixed(2),
    viable: profit > 0,
  };
};
