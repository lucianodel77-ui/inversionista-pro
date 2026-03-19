# ◈ INVERSIONISTA PRO

Dashboard financiero argentino con asesor IA integrado.

## Qué incluye

- **Fondos Comunes de Inversión** — datos de CAFCI con rendimiento diario, mensual, YTD y anual
- **Cotización del Dólar** — oficial, blue, MEP, CCL, tarjeta, mayorista (API en tiempo real)
- **Criptomonedas** — BTC, ETH, SOL, USDT, USDC, XRP (API CoinGecko)
- **Índices** — S&P 500, NASDAQ, Dow Jones, S&P Merval
- **CEDEARs y Bonos** — principales activos argentinos
- **Asesor Financiero IA** — chat con Claude (CFA, Wealth Manager, Portfolio Manager, CFP)

## Requisitos previos

1. **Node.js** versión 18 o superior — [descargar](https://nodejs.org/)
2. **Cuenta en Vercel** (gratis) — [registrarse](https://vercel.com/signup)
3. **API Key de Anthropic** — [obtener](https://console.anthropic.com/settings/keys)

## Deployar en Vercel (paso a paso)

### Opción A: Deploy desde GitHub (recomendado)

**Paso 1 — Subir a GitHub**

Creá un repositorio nuevo en [github.com/new](https://github.com/new) y subí estos archivos:

```bash
cd inversionista-pro
git init
git add .
git commit -m "Inversionista PRO v3"
git remote add origin https://github.com/TU_USUARIO/inversionista-pro.git
git push -u origin main
```

**Paso 2 — Conectar con Vercel**

1. Entrá a [vercel.com/new](https://vercel.com/new)
2. Hacé click en "Import Git Repository"
3. Seleccioná tu repositorio `inversionista-pro`
4. En la configuración que aparece, buscá **Environment Variables**
5. Agregá:
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-tu-key-aqui`
6. Click en **Deploy**

¡Listo! En 1-2 minutos tu sitio estará live en `inversionista-pro.vercel.app`.

### Opción B: Deploy directo desde la terminal

```bash
# 1. Instalá Vercel CLI
npm install -g vercel

# 2. Entrá al proyecto
cd inversionista-pro

# 3. Instalá dependencias
npm install

# 4. Deployá
vercel

# 5. Configurá la API key en el dashboard de Vercel:
#    Settings > Environment Variables > ANTHROPIC_API_KEY
```

## Desarrollo local

```bash
# Instalá dependencias
npm install

# Creá el archivo .env
cp .env.example .env
# Editá .env y poné tu API key

# Iniciá el servidor de desarrollo
npm run dev
```

El sitio estará disponible en `http://localhost:5173`

## Estructura del proyecto

```
inversionista-pro/
├── api/
│   └── chat.js          ← Serverless function (proxy seguro a Anthropic)
├── src/
│   ├── App.jsx          ← Dashboard principal
│   └── main.jsx         ← Entry point React
├── index.html           ← HTML base
├── package.json
├── vercel.json          ← Config de Vercel
├── vite.config.js       ← Config de Vite
└── .env.example         ← Template de variables de entorno
```

## Fuentes de datos

| Dato | API | Costo |
|------|-----|-------|
| Dólar | dolarapi.com | Gratis |
| Crypto | CoinGecko | Gratis |
| FCI | api.cafci.org.ar | Gratis |
| Asesor IA | Anthropic (Claude) | Pago por uso |

## Costos estimados

- **Hosting (Vercel)**: Gratis (hobby plan)
- **Anthropic API**: ~$0.003 por consulta al asesor (Claude Sonnet). Con 100 consultas/día serían ~$9/mes.
- **APIs de datos**: Todas gratuitas

## Notas

- Los datos de FCI se actualizan después de las 18hs (hora CAFCI)
- El dólar y crypto se refrescan cada 5 minutos automáticamente
- Índices, CEDEARs y bonos son valores de referencia (no en tiempo real)
