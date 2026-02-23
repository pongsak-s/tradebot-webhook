/**
 * Replay a sample TradingView payload to the local webhook.
 * Usage (example):
 *   WEBHOOK_URL=http://localhost:3000/v1/webhook/tradingview \
 *   WEBHOOK_SECRET=yoursecret \
 *   node dist/replay.js
 */
const webhookUrl =
  process.env.WEBHOOK_URL ?? 'http://localhost:3000/v1/webhook/tradingview';

const secret = process.env.WEBHOOK_SECRET ?? '';

const sample = {
  projectId: 'wukong-alpha',
  strategy: 'breakout-v1',
  symbol: 'BTCUSDT',
  side: 'BUY',
  qtyType: 'USDT',
  qty: 50,
  leverage: 5,
  entry: { type: 'MARKET' },
  sl: { type: 'PRICE', price: 48000 },
  tp: { type: 'PRICE', price: 52000 },
  time: new Date().toISOString(),
  signalId: `local-${Date.now()}`
};

async function main() {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-secret': secret
    },
    body: JSON.stringify(sample)
  });

  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
