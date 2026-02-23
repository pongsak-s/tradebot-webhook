import crypto from 'crypto';

export interface BinanceConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  isTestnet: boolean;
  dryRun: boolean;
}

export function getBinanceConfig(): BinanceConfig {
  const apiKey = process.env.BINANCE_API_KEY || '';
  const apiSecret = process.env.BINANCE_API_SECRET || '';
  const isTestnet = process.env.BINANCE_TESTNET === 'true';
  const dryRun = process.env.DRY_RUN === 'true';

  if (!apiKey || !apiSecret) {
    throw new Error('Missing BINANCE_API_KEY or BINANCE_API_SECRET');
  }

  const baseUrl = process.env.BINANCE_BASE_URL
    ? process.env.BINANCE_BASE_URL
    : isTestnet
      ? 'https://demo-fapi.binance.com'
      : 'https://fapi.binance.com';

  if (!isTestnet && dryRun === false) {
    throw new Error(
      'Refusing to place real mainnet orders without explicit approval'
    );
  }

  return { apiKey, apiSecret, baseUrl, isTestnet, dryRun };
}

export function signQuery(query: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(query)
    .digest('hex');
}
