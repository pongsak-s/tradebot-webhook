import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import dotenv from 'dotenv';
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
      await prisma.execution.create({ data: { signalId: sig.id, type: 'ENTRY', status: result.status } });
      await prisma.signal.update({ where: { id: sig.id }, data: { status: 'PROCESSED', processedAt: new Date() } });
    } catch (e) {
      console.error('Error processing signal', sig.id, e);
    }
  }
}

const server = Fastify();
server.get('/healthz', async () => ({ status: 'ok' }));
server.get('/readyz', async () => ({ status: 'ok' }));
server.get('/v1/projects', async () => {
  const projects = await prisma.project.findMany({ include: { executions: true, signals: true } });
  return {
    projects: projects.map(p => ({
      projectId: p.id,
      signals: p.signals.length,
      executions: p.executions.length,
      realized: p.executions.filter(e => e.status === 'FILLED').length
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