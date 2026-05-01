/**
 * 💰 CURRENCY UTILS
 * Centraliza la lógica de pricing para eliminar hardcoding de "MX$49" en el código.
 * Soporta geo-pricing internacional (MX, US, EU).
 */

export type Region = 'MX' | 'US' | 'EU';

export type PriceConfig = {
  amount: number;        // Precio numérico (179 para MX, 19 para US, 17 para EU)
  currency: string;      // Código ISO (MXN, USD, EUR)
  symbol: string;        // Símbolo visual (MX$, $, €)
  displayText: string;   // Texto completo para UI (ej: "MX$179", "$19", "€17")
  priceId: string;       // Stripe Price ID desde .env
  flag: string;          // Emoji de bandera para selector
  regionLabel: string;   // Label para dropdown (ej: "México")
};

/**
 * 📊 Configuración de precios por región
 * IMPORTANTE: Los price IDs vienen de variables de entorno (.env.local)
 */
const PRICE_CONFIG: Record<Region, Omit<PriceConfig, 'priceId'>> = {
  MX: {
    amount: 179,
    currency: 'MXN',
    symbol: 'MX$',
    displayText: 'MX$179',
    flag: '🇲🇽',
    regionLabel: 'México',
  },
  US: {
    amount: 19,
    currency: 'USD',
    symbol: '$',
    displayText: '$19',
    flag: '🇺🇸',
    regionLabel: 'USA',
  },
  EU: {
    amount: 17,
    currency: 'EUR',
    symbol: '€',
    displayText: '€17',
    flag: '🇪🇺',
    regionLabel: 'Europa',
  },
};

/**
 * 🌍 Obtiene la configuración de precio completa para una región
 * @param region - Región (MX, US, EU). Default: MX
 * @returns Configuración de precio con price ID desde .env
 */
export function getPriceConfig(region: Region = 'MX'): PriceConfig {
  const config = PRICE_CONFIG[region];

  // Leer price ID desde variables de entorno
  const priceId = getPriceIdFromEnv(region);

  return {
    ...config,
    priceId,
  };
}

/**
 * 🎨 Obtiene solo el texto a mostrar en UI (wrapper convenience)
 * @param region - Región (MX, US, EU)
 * @returns String listo para renderizar (ej: "MX$179")
 */
export function getPriceDisplay(region: Region = 'MX'): string {
  return getPriceConfig(region).displayText;
}

/**
 * 💳 Obtiene el Stripe Price ID desde variables de entorno
 * @param region - Región (MX, US, EU)
 * @returns Stripe Price ID o fallback al de México
 */
function getPriceIdFromEnv(region: Region): string {
  // Mapping de región a variable de entorno
  const envVarMap: Record<Region, string> = {
    MX: process.env.STRIPE_PRICE_ID_MX || process.env.STRIPE_PRICE_SINGLE || '',
    US: process.env.STRIPE_PRICE_ID_US || '',
    EU: process.env.STRIPE_PRICE_ID_EU || '',
  };

  const priceId = envVarMap[region];

  // Fallback a MX si la región solicitada no tiene price ID configurado
  if (!priceId && region !== 'MX') {
    console.warn(`⚠️ No STRIPE_PRICE_ID_${region} found in env, falling back to MX`);
    return envVarMap.MX;
  }

  if (!priceId) {
    console.error('❌ CRITICAL: No Stripe price ID configured for any region!');
    throw new Error('Stripe price configuration missing');
  }

  return priceId;
}

/**
 * 🔍 Valida si una región es válida
 * @param region - String a validar
 * @returns true si es región válida
 */
export function isValidRegion(region: string): region is Region {
  return ['MX', 'US', 'EU'].includes(region);
}

/**
 * 📋 Obtiene todas las regiones disponibles (para dropdown de selección manual)
 * @returns Array de configuraciones de precio
 */
export function getAllRegions(): Array<PriceConfig> {
  return (['MX', 'US', 'EU'] as Region[]).map(region => getPriceConfig(region));
}
