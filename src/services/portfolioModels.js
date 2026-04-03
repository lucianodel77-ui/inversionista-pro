// ═══════════════════════════════════════════════════════════
// INVERSIONISTA PRO v4 — PORTFOLIO MODELS
// Modelos de portafolio con composición porcentual
// ═══════════════════════════════════════════════════════════

export const PORTFOLIO_MODELS = {
  conservative: {
    label: 'Conservador',
    emoji: '🛡️',
    description: 'Máxima liquidez y preservación de capital. Ideal ante alta volatilidad cambiaria.',
    riskScore: 2,
    horizon: 'Corto plazo (< 6 meses)',
    allocations: [
      { label: 'Money Market', pct: 70, color: '#4fc3f7', type: 'money_market', detail: 'T+0 · Alta liquidez' },
      { label: 'Renta Fija CER', pct: 20, color: '#ffd740', type: 'renta_fija', detail: 'Cobertura inflación' },
      { label: 'CEDEARs', pct: 10, color: '#ff5252', type: 'renta_variable', detail: 'Dolarización parcial' },
    ],
  },
  moderate: {
    label: 'Moderado',
    emoji: '⚖️',
    description: 'Equilibrio entre rendimiento en pesos y cobertura contra inflación y dólar.',
    riskScore: 5,
    horizon: 'Mediano plazo (6–18 meses)',
    allocations: [
      { label: 'Money Market', pct: 50, color: '#4fc3f7', type: 'money_market', detail: 'T+0 · Base líquida' },
      { label: 'Renta Fija CER', pct: 30, color: '#ffd740', type: 'renta_fija', detail: 'Ajuste por inflación' },
      { label: 'CEDEARs', pct: 20, color: '#ff5252', type: 'renta_variable', detail: 'Exposición USD' },
    ],
  },
  aggressive: {
    label: 'Agresivo',
    emoji: '🚀',
    description: 'Máxima exposición a activos en dólares y renta variable para retorno superior.',
    riskScore: 8,
    horizon: 'Largo plazo (> 18 meses)',
    allocations: [
      { label: 'Money Market', pct: 15, color: '#4fc3f7', type: 'money_market', detail: 'Colchón de liquidez' },
      { label: 'Renta Fija / ON', pct: 25, color: '#ffd740', type: 'renta_fija', detail: 'Bonos hard dollar' },
      { label: 'CEDEARs / Acciones', pct: 60, color: '#ff5252', type: 'renta_variable', detail: 'Alta exposición USD' },
    ],
  },
};

/**
 * Calcula el retorno estimado ponderado de un portfolio.
 * @param {string} profileKey - Clave del perfil
 * @param {object} rates - { mmTea, rfTea, rvReturn } tasas por clase
 */
export const calcPortfolioReturn = (profileKey, rates = {}) => {
  const model = PORTFOLIO_MODELS[profileKey];
  if (!model) return null;
  const { mmTea = 70, rfTea = 85, rvReturn = 120 } = rates;
  const ratesByType = { money_market: mmTea, renta_fija: rfTea, renta_variable: rvReturn };
  const weighted = model.allocations.reduce((acc, a) => {
    return acc + (a.pct / 100) * (ratesByType[a.type] || 0);
  }, 0);
  return +weighted.toFixed(2);
};
