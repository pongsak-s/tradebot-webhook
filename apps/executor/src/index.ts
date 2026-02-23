import Fastify from 'fastify';
import * as crypto from "crypto";
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from '@fastify/cors';
import { getBinanceConfig } from './binance';
import { signQuery } from './binance';
dotenv.config();

const prisma = new PrismaClient();
const dryRun = process.env.DRY_RUN === 'true';
const port = parseInt(process.env.PORT || '3001', 10);

async function processSignals() {
  if (process.env.KILL_SWITCH === 'true') {
    console.log('[KILL_SWITCH] Executor is disabled. Skipping signal processing.');
    return;
  }
  const signals = await prisma.signal.findMany({ where: { status: 'VALIDATED' } });
  for (const sig of signals) {
    const payload = sig.normalized as any;

    // DB-backed per-project Kill Switch (mode C): block + cancel open orders + close position
    const proj = await prisma.project.findUnique({
      where: { id: sig.projectId },
      select: { id: true, killSwitchEnabled: true },
    });

    async function signedFetch(method: string, path: string, params: Record<string, string>) {
      const timestamp = Date.now();
      const recvWindow = 5000;
      const qs = new URLSearchParams({ ...params, timestamp: String(timestamp), recvWindow: String(recvWindow) }).toString();
      const signature = signQuery(qs, binance.apiSecret);
      const url = `${binance.baseUrl}${path}?${qs}&signature=${signature}`;
      const res = await fetch(url, { method, headers: { "X-MBX-APIKEY": binance.apiKey } });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
    }

    async function cancelAllOpenOrders(symbol: string) {
      // DELETE /fapi/v1/allOpenOrders?symbol=...
      const r = await signedFetch("DELETE", "/fapi/v1/allOpenOrders", { symbol });
      if (!r.ok) throw new Error(`Cancel open orders failed: ${r.status} ${r.text}`);
      return r.json ?? r.text;
    }

    async function closePositionsForSymbol(symbol: string) {
      // Close BOTH LONG and SHORT in Hedge mode by reading positionRisk and submitting reduceOnly MARKET
      const pr = await signedFetch("GET", "/fapi/v2/positionRisk", { symbol });
      if (!pr.ok) throw new Error(`positionRisk failed: ${pr.status} ${pr.text}`);
      const rows = (pr.json ?? []) as any[];

      // rows include positionSide and positionAmt (string). Close any non-zero positionAmt.
      for (const row of rows) {
        const positionSide = String(row.positionSide ?? "");
        const amt = Number(row.positionAmt ?? 0);
        if (!positionSide || !amt || abs(amt) == 0) continue

      }

      function abs(x: number){ return x < 0 ? -x : x; }

      for (const row of rows) {
        const positionSide = String(row.positionSide ?? "");
        const amt = Number(row.positionAmt ?? 0);
        if (!positionSide || !amt || abs(amt) == 0) continue;

        const side = amt > 0 ? "SELL" : "BUY"; // opposite to flatten
        const qty = String(abs(amt));

        const r = await signedFetch("POST", "/fapi/v1/order", {
          symbol,
          side,
          positionSide,
          type: "MARKET",
          quantity: qty,
        });

        if (!r.ok) throw new Error(`Close position failed (${positionSide}): ${r.status} ${r.text}`);
      }
      return true;
    }

    if (proj?.killSwitchEnabled) {
      console.warn(`[KILL_SWITCH] Project ${sig.projectId} enabled. Blocking signal ${sig.signalId || sig.id}`);

      // Mark the signal so we don't keep re-processing it forever
      await prisma.signal.update({ where: { id: sig.id }, data: { status: "REJECTED" } });

      // Mode C: Cancel orders + close position (skip in dryRun)
      const symbol = String(payload?.symbol ?? "").toUpperCase();
      if (!dryRun && symbol) {
        try {
          await cancelAllOpenOrders(symbol);
          await closePositionsForSymbol(symbol);
        } catch (e) {
          console.error(`[KILL_SWITCH] Emergency action failed: ${String(e)}`);
        }
      }
      continue;
    }

    try {
      let result;
      if (!dryRun) {
        // integrate real Binance API
// Convert signal -> Binance MARKET order (testnet)
// NOTE: For now we assume qtyType=CONTRACT and payload.qty is already the contract quantity.
if (!binance.isTestnet) {
  throw new Error('Refusing to trade: BINANCE_TESTNET is false');
}

const timestamp = Date.now();
const recvWindow = 5000;

const params = new URLSearchParams({
  symbol: String(payload.symbol).toUpperCase(),
  side: String(payload.side).toUpperCase(),
            positionSide: (String(payload.side).toUpperCase() === 'BUY' ? 'LONG' : 'SHORT'), // BUY | SELL
  type: 'MARKET',
  quantity: String(payload.qty),
  recvWindow: String(recvWindow),
  timestamp: String(timestamp),
});

const qs = params.toString();
const signature = signQuery(qs, binance.apiSecret);
const url = `${binance.baseUrl}/fapi/v1/order?${qs}&signature=${signature}`;

const res = await fetch(url, {
  method: 'POST',
  headers: { 'X-MBX-APIKEY': binance.apiKey },
});

const text = await res.text();
if (!res.ok) {
  throw new Error(`Binance order failed: ${res.status} ${text}`);
}

const order = JSON.parse(text);
result = { status: (order.status ?? "NEW"), orderId: String(order.orderId), exchangeRaw: order };

        if (payload?.sl?.price != null || payload?.tp?.price != null) {
        // --- SL/TP from signal payload (price-based) ---
        // Expect payload.sl.price and/or payload.tp.price
        const entrySide = String(payload.side).toUpperCase();
        const exitSide = entrySide === "BUY" ? "SELL" : "BUY";

        async function placeExit(type: "SL" | "TP", orderType: "STOP_MARKET" | "TAKE_PROFIT_MARKET", triggerPrice: number) {
          // Binance migrated conditional orders to Algo service:
          // POST /fapi/v1/algoOrder (algoType=CONDITIONAL)   [oai_citation:2‡Binance Developer Center](https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/New-Algo-Order)

          const symbol = String(payload.symbol).toUpperCase();
          const entrySide = String(payload.side).toUpperCase();
          const exitSide = (entrySide === "BUY" ? "SELL" : "BUY");
          const positionSide = (entrySide === "BUY" ? "LONG" : "SHORT");

          const params = new URLSearchParams({
            algoType: "CONDITIONAL",
            symbol,
            side: exitSide,
            positionSide,
            type: orderType,
            triggerPrice: String(triggerPrice),
            workingType: "CONTRACT_PRICE",
            closePosition: "true",
            // return full payload so we can store algoId/status
            newOrderRespType: "RESULT",
            timestamp: String(Date.now()),
          });

          const signature = crypto
            .createHmac("sha256", binance.apiSecret)
            .update(params.toString())
            .digest("hex");

          const url = `${binance.baseUrl}/fapi/v1/algoOrder?${params.toString()}&signature=${signature}`;

          const resp = await fetch(url, {
            method: "POST",
            headers: { "X-MBX-APIKEY": binance.apiKey },
          });

          const data = (await resp.json()) as any;

          if (!resp.ok) {
            throw new Error(`Binance ${type} algoOrder failed: HTTP ${resp.status} ${JSON.stringify(data)}`);
          }

          // Persist as an Execution row
          await prisma.execution.create({
            data: {
              projectId: sig.projectId,
              signalId: sig.id,
              type,
              status: data.algoStatus ?? "NEW",
              orderId: data.algoId?.toString() ?? null,
              exchangeRaw: data as any,
            },
          });
        }


        const slPrice = payload?.sl?.price;
        if (slPrice != null) {
          try {
            await placeExit("SL", "STOP_MARKET", Number(slPrice));
          } catch (e) {
            await prisma.execution.create({
              data: {
                projectId: sig.projectId,
                signalId: sig.id,
                type: "SL",
                status: "ERROR",
                orderId: null,
                exchangeRaw: { error: String(e) },
              },
            });
          }
        }

        const tpPrice = payload?.tp?.price;
        if (tpPrice != null) {
          try {
            await placeExit("TP", "TAKE_PROFIT_MARKET", Number(tpPrice));
          } catch (e) {
            await prisma.execution.create({
              data: {
                projectId: sig.projectId,
                signalId: sig.id,
                type: "TP",
                status: "ERROR",
                orderId: null,
                exchangeRaw: { error: String(e) },
              },
            });
          }
        }
        // --- end SL/TP ---
        } else {
          // SL/TP disabled (ENTRY only)
        }
      } else {
        result = { status: 'SIMULATED', orderId: 'sim-' + sig.id };
      }
      await prisma.execution.create({
        data: {
          type: 'ENTRY',
          status: result.status,
          orderId: (result as any).orderId ?? null,
        exchangeRaw: (result as any).exchangeRaw ?? null,
        signal: { connect: { id: sig.id } },
          project: { connect: { id: sig.projectId } }
        }
      });
      //await prisma.execution.create({ data: { signalId: sig.id, type: 'ENTRY', status: result.status } });
      await prisma.signal.update({ where: { id: sig.id }, data: { status: 'PROCESSED', processedAt: new Date() } });
    } catch (e) {
      console.error('Error processing signal', sig.id, e);
      await prisma.signal.update({
        where: { id: sig.id },
        data: { status: 'PROCESSED' },
      });
    }
  }
}

//const server = Fastify();
const server = Fastify({ logger: true });
const binance = getBinanceConfig();
server.log.info(
  { baseUrl: binance.baseUrl, isTestnet: binance.isTestnet, dryRun: binance.dryRun },
  'binance config'
);
//await server.register(cors, { origin: true });
server.register(cors, { origin: true });
server.get('/healthz', async () => ({ status: 'ok' }));
server.get('/readyz', async () => ({ status: 'ok' }));
server.get('/v1/binance/time', async (_req, reply) => {
  const url = `${binance.baseUrl}/fapi/v1/time`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    return reply.code(502).send({ error: 'Binance upstream error', status: res.status, body: text });
  }

  const data = await res.json();
  return { baseUrl: binance.baseUrl, data };
});
server.post('/v1/binance/test-order', async (request, reply) => {
  // Safety: only allow on testnet for now
  if (!binance.isTestnet) {
    return reply.code(400).send({ error: 'This endpoint is testnet-only' });
  }

  const { symbol, side, quantity } = (request.body ?? {}) as any;

  if (!symbol || !side || !quantity) {
    return reply.code(400).send({
      error: 'Missing required fields: symbol, side, quantity',
      example: { symbol: 'BTCUSDT', side: 'BUY', quantity: '0.001' },
    });
  }

  // Build signed params (Binance requires timestamp on signed endpoints)
  const timestamp = Date.now();
  const recvWindow = 5000;

  const params = new URLSearchParams({
    symbol: String(symbol).toUpperCase(),
    side: String(side).toUpperCase(),      // BUY | SELL
    type: 'MARKET',
    quantity: String(quantity),            // contract qty (e.g., 0.001 for BTCUSDT)
    recvWindow: String(recvWindow),
    timestamp: String(timestamp),
  });

  const qs = params.toString();
  const signature = signQuery(qs, binance.apiSecret);

  // Test order endpoint (does NOT execute a trade)
  const url = `${binance.baseUrl}/fapi/v1/order/test?${qs}&signature=${signature}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': binance.apiKey,
    },
  });

  const text = await res.text();

  // Binance typically returns empty body on success for /order/test
  if (!res.ok) {
    return reply.code(502).send({
      error: 'Binance upstream error',
      status: res.status,
      body: text,
    });
  }

  return reply.send({
    ok: true,
    testnet: binance.isTestnet,
    symbol: String(symbol).toUpperCase(),
    side: String(side).toUpperCase(),
    quantity: String(quantity),
    binanceResponse: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null,
  });
});
server.post('/v1/binance/order', async (request, reply) => {
  // Safety: only allow on testnet for now
  if (!binance.isTestnet) {
    return reply.code(400).send({ error: 'This endpoint is testnet-only' });
  }

  const { symbol, side, quantity } = (request.body ?? {}) as any;

  if (!symbol || !side || !quantity) {
    return reply.code(400).send({
      error: 'Missing required fields: symbol, side, quantity',
      example: { symbol: 'BTCUSDT', side: 'BUY', quantity: '0.002' },
    });
  }

  const timestamp = Date.now();
  const recvWindow = 5000;

  const params = new URLSearchParams({
    symbol: String(symbol).toUpperCase(),
    side: String(side).toUpperCase(), // BUY | SELL
    type: 'MARKET',
    quantity: String(quantity),
    recvWindow: String(recvWindow),
    timestamp: String(timestamp),
  });

  const qs = params.toString();
  const signature = signQuery(qs, binance.apiSecret);

  // REAL order endpoint (executes a trade)
  const url = `${binance.baseUrl}/fapi/v1/order?${qs}&signature=${signature}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': binance.apiKey,
    },
  });

  const text = await res.text();

  if (!res.ok) {
    return reply.code(502).send({
      error: 'Binance upstream error',
      status: res.status,
      body: text,
    });
  }

  // Binance returns JSON for real order creation
  return reply.send({
    ok: true,
    testnet: binance.isTestnet,
    baseUrl: binance.baseUrl,
    order: JSON.parse(text),
  });
});
server.get('/v1/binance/account', async (_req, reply) => {
  // Guardrails
  //if (binance.dryRun) {
  //  return reply.code(400).send({ error: 'DRY_RUN=true; account check is disabled' });
  //}
  const readonlyOk = process.env.BINANCE_READONLY_OK === 'true';
  if (!readonlyOk) {
    return reply.code(400).send({ error: 'BINANCE_READONLY_OK is false; account check disabled' });
  }
  const timestamp = Date.now();
  const recvWindow = 5000;

  const qs = new URLSearchParams({
    timestamp: String(timestamp),
    recvWindow: String(recvWindow),
  }).toString();

  const signature = signQuery(qs, binance.apiSecret);
  const url = `${binance.baseUrl}/fapi/v2/account?${qs}&signature=${signature}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-MBX-APIKEY': binance.apiKey,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    return reply.code(502).send({
      error: 'Binance upstream error',
      status: res.status,
      body: text,
    });
  }

  // Return as JSON
  try {
    return reply.send({ baseUrl: binance.baseUrl, data: JSON.parse(text) });
  } catch {
    return reply.send({ baseUrl: binance.baseUrl, raw: text });
  }
});
server.get('/v1/projects', async () => {
  const projects = await prisma.project.findMany({ include: { executions: true, signals: true } });
  return {
    projects: projects.map((p: any) => ({
      projectId: p.id,
      signals: p.signals.length,
      executions: p.executions.length,
      realized: p.executions.filter((e: any) => e.status === 'FILLED').length
    }))
  };
});
server.get('/v1/projects/:projectId/pnl', async (request) => {
  const { projectId } = request.params as any;
  const snapshots = await prisma.pnlSnapshot.findMany({ where: { projectId }, orderBy: { timestamp: 'asc' } });
  return { projectId, pnl: snapshots };
});


server.get('/v1/projects/:projectId/risk', async (request, reply) => {
  const { projectId } = request.params as any;

  // One-strategy-per-symbol: infer symbol from latest signal; allow override via ?symbol=
  const q = request.query as any;
  let symbol = (q?.symbol ? String(q.symbol) : '').toUpperCase();

  if (!symbol) {
    const lastSig = await prisma.signal.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: { normalized: true, raw: true },
    });
    symbol =
      String((lastSig as any)?.normalized?.symbol ?? (lastSig as any)?.raw?.symbol ?? '').toUpperCase();
  }

  if (!symbol) return reply.code(400).send({ error: 'NO_SYMBOL', message: 'No symbol found; pass ?symbol=BTCUSDT' });

  const timestamp = Date.now();
  const recvWindow = 5000;

  async function signedGet(path: string, params: Record<string, string>) {
    const qs = new URLSearchParams({
      ...params,
      timestamp: String(timestamp),
      recvWindow: String(recvWindow),
    }).toString();

    const signature = signQuery(qs, binance.apiSecret);
    const url = `${binance.baseUrl}${path}?${qs}&signature=${signature}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-MBX-APIKEY': binance.apiKey },
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { ok: res.ok, status: res.status, text, json };
  }

  // Binance Futures endpoints (USD-M)
  const [posRes, ooRes] = await Promise.all([
    signedGet('/fapi/v2/positionRisk', { symbol }),
    signedGet('/fapi/v1/openOrders', { symbol }),
  ]);

  if (!posRes.ok) {
    return reply.code(502).send({ error: 'BINANCE_positionRisk', status: posRes.status, body: posRes.text });
  }
  if (!ooRes.ok) {
    return reply.code(502).send({ error: 'BINANCE_openOrders', status: ooRes.status, body: ooRes.text });
  }

  const positions = posRes.json ?? [];
  const openOrders = ooRes.json ?? [];

  // Return both raw + a compact summary (UI can render summary easily)
  const summary = (positions || []).map((p: any) => ({
    symbol: p.symbol,
    positionSide: p.positionSide,
    positionAmt: p.positionAmt,
    entryPrice: p.entryPrice,
    markPrice: p.markPrice,
    unrealizedProfit: p.unRealizedProfit ?? p.unrealizedProfit,
    leverage: p.leverage,
    marginType: p.marginType,
    liquidationPrice: p.liquidationPrice,
    notional: p.notional,
    updateTime: p.updateTime,
  }));

  return reply.send({
    projectId,
    testnet: binance.isTestnet,
    baseUrl: binance.baseUrl,
    symbol,
    positions: summary,
    openOrdersCount: Array.isArray(openOrders) ? openOrders.length : 0,
    openOrders,
  });
});

server.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`Executor listening on ${port}`);
  setInterval(processSignals, 5000);
});
