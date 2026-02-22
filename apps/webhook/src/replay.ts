import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const data = JSON.parse(fs.readFileSync('sample_payload.json', 'utf-8'));
  const url = `http://localhost:${process.env.PORT || 3000}/v1/webhook/tradingview`;
  const res = await axios.post(url, data, {
    headers: { 'X-Webhook-Secret': process.env.WEBHOOK_SECRET || '' },
  });
  console.log(res.data);
}
main().catch(console.error);