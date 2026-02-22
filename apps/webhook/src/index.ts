import Fastify, { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { SignalSchema, Signal } from '@monorepo/shared';

export interface WebhookOptions {
  prisma: PrismaClient;
  webhookSecret: string;
}

export function buildServer(opts: WebhookOptions): FastifyInstance {
  const server = Fastify();
  const { prisma, webhookSecret } = opts;
  server.post('/v1/webhook/tradingview', async (request, reply) => {
    const secret = (request.headers['x-webhook-secret'] as string) || '';
    if (secret !== webhookSecret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    let payload: Signal;
    try {
      payload = SignalSchema.parse(request.body);
    } catch (err) {
      return reply.code(400).send({ error: 'Invalid payload', details: (err as any).errors });
    }
    const existing = await prisma.signal.findUnique({ where: { signalId: payload.signalId } });
    if (existing) {
      return reply.send({ received: true, signalId: payload.signalId, deduped: true });
    }
    await prisma.signal.create({
      data: {
        signalId: payload.signalId,
        projectId: payload.projectId,
        raw: request.body,
        normalized: payload,
        status: 'VALIDATED',
      },
    });
    return reply.send({ received: true, signalId: payload.signalId, deduped: false });
  });
  server.get('/v1/history/signals', async (request, reply) => {
    const { projectId = '', limit = '10', offset = '0' } = request.query as any;
    const signals = await prisma.signal.findMany({
      where: projectId ? { projectId } : undefined,
      skip: parseInt(offset, 10),
      take: parseInt(limit, 10),
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ signals });
  });
  server.get('/healthz', async () => ({ status: 'ok' }));
  server.get('/readyz', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (e) {
      return server.httpErrors.internalServerError('DB not ready');
    }
  });
  return server;
}