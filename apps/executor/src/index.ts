import Fastify from 'fastify';
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
  const signals = await prisma.signal.findMany({ where: { status: 'VALIDATED' } });
  for (const sig of signals) {
    try {
      let result;
      if (!dryRun) {
        // TODO: integrate real Binance API
        result = { status: 'FILLED', orderId: 'binance-' + sig.id };
      } else {
        result = { status: 'SIMULATED', orderId: 'sim-' + sig.id };
      }
      await prisma.execution.create({
        data: {
          type: 'ENTRY',
          status: result.status,
          signal: { connect: { id: sig.id } },
          project: { connect: { id: sig.projectId } }
        }
      });
      //await prisma.execution.create({ data: { signalId: sig.id, type: 'ENTRY', status: result.status } });
      await prisma.signal.update({ where: { id: sig.id }, data: { status: 'PROCESSED', processedAt: new Date() } });
    } catch (e) {
      console.error('Error processing signal', sig.id, e);
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

server.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`Executor listening on ${port}`);
  setInterval(processSignals, 5000);
});
