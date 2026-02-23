import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { Prisma, PrismaClient } from '@prisma/client';
import { SignalSchema, Signal } from '@monorepo/shared';

export interface WebhookOptions {
  prisma: PrismaClient;
  webhookSecret: string;
}

export function buildServer(opts: WebhookOptions): FastifyInstance {
  const server = Fastify();
  const { prisma, webhookSecret } = opts;

  // CORS for local UI dev (Vite on :3002)
  server.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      const allow = ['http://localhost:3002', 'http://127.0.0.1:3002']
      cb(null, allow.includes(origin))
    }
  });

  server.post('/v1/webhook/tradingview', async (request, reply) => {
    // TradingView cannot send custom headers reliably; authenticate via body.secret
    const { secret, ...body } = (request.body ?? {}) as any;

    if (!secret || secret !== webhookSecret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    let payload: Signal;
    try {
      payload = SignalSchema.parse(body);
    } catch (err) {
      return reply
        .code(400)
        .send({ error: 'Invalid payload', details: (err as any).errors });
    }

    const existing = await prisma.signal.findUnique({
      where: { signalId: payload.signalId }
    });
    if (existing) {
      return reply.send({ received: true, signalId: payload.signalId, deduped: true });
    }

    // Ensure project exists (FK constraint requires it)
    await prisma.project.upsert({
      where: { id: payload.projectId },
      update: {},
      create: { id: payload.projectId }
    });

    await prisma.signal.create({
      data: {
        signalId: payload.signalId,
        projectId: payload.projectId,
        raw: body as Prisma.InputJsonValue, // secret excluded
        normalized: payload as unknown as Prisma.InputJsonValue,
        status: 'VALIDATED'
      }
    });

    return reply.send({ received: true, signalId: payload.signalId, deduped: false });
  });

  server.get('/v1/history/signals', async (request, reply) => {
    const { projectId = '', limit = '10', offset = '0' } = request.query as any;
    const signals = await prisma.signal.findMany({
      where: projectId ? { projectId } : undefined,
      skip: parseInt(offset, 10),
      take: parseInt(limit, 10),
      orderBy: { createdAt: 'desc' }
    });
    return reply.send({ signals });
  });
  server.get('/v1/projects/:projectId/summary', async (request, reply) => {
    const { projectId } = request.params as any;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    const [signalsCount, executionsCount, lastSignal, lastExecution] = await Promise.all([
      prisma.signal.count({ where: { projectId } }),
      prisma.execution.count({ where: { projectId } }),
      prisma.signal.findFirst({ where: { projectId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      prisma.execution.findFirst({ where: { projectId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);

    // NOTE: realizedPnL is placeholder for now; proper PnL needs fills/income sync.
    return reply.send({
      projectId,
      status: project.killSwitchEnabled ? 'KILL_SWITCH' : 'ACTIVE',
      signalsCount,
      executionsCount,
      realizedPnL: 0,
      lastSignalAt: lastSignal?.createdAt ?? null,
      lastExecutionAt: lastExecution?.createdAt ?? null,
    });
  });

  // Phase 2: Kill Switch toggle (PIN required)
  server.post('/v1/projects/:projectId/kill-switch', async (request, reply) => {
    const { projectId } = request.params as any;
    const body = (request.body ?? {}) as any;
    const enabled = !!body.enabled;
    const pin = String(body.pin ?? '');

    const expectedPin = process.env.UI_ADMIN_PIN || '1234';
    if (pin !== expectedPin) {
      return reply.code(401).send({ error: 'INVALID_PIN' });
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { killSwitchEnabled: enabled },
      select: { id: true, killSwitchEnabled: true },
    });

    return reply.send(updated);
  });

  server.get('/v1/projects/:projectId/signals', async (request, reply) => {
    const { projectId } = request.params as any;
    const { limit = '50', offset = '0' } = request.query as any;

    const take = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = Math.max(0, parseInt(offset, 10) || 0);

    const [items, total] = await Promise.all([
      prisma.signal.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          createdAt: true,
          signalId: true,
          projectId: true,
          status: true,
          normalized: true,
          raw: true,
        },
      }),
      prisma.signal.count({ where: { projectId } }),
    ]);

    return reply.send({ total, limit: take, offset: skip, items });
  });
  server.get('/v1/projects/:projectId/executions', async (request, reply) => {
    const { projectId } = request.params as any;
    const { limit = '50', offset = '0' } = request.query as any;

    const take = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = Math.max(0, parseInt(offset, 10) || 0);

    const [items, total] = await Promise.all([
      prisma.execution.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          createdAt: true,
          projectId: true,
          signalId: true,
          type: true,
          status: true,
          orderId: true,
          exchangeRaw: true,
        },
      }),
      prisma.execution.count({ where: { projectId } }),
    ]);

    return reply.send({ total, limit: take, offset: skip, items });
  });




  server.get('/healthz', async () => ({ status: 'ok' }));

  server.get('/readyz', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (_e) {
      return reply.code(503).send({ status: 'not_ready', reason: 'DB not ready' });
    }
  });

  return server;
}
