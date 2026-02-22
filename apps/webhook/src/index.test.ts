import { buildServer } from './index';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const mockPrisma: any = {
  signal: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
};

let server: FastifyInstance;
beforeEach(() => {
  mockPrisma.signal.findUnique.mockReset();
  mockPrisma.signal.create.mockReset();
  server = buildServer({ prisma: mockPrisma as any, webhookSecret: 'secret' });
});

describe('Webhook Handler', () => {
  it('rejects invalid schema', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/webhook/tradingview',
      headers: { 'x-webhook-secret': 'secret' },
      payload: { invalid: true },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns deduped for duplicate signal', async () => {
    mockPrisma.signal.findUnique.mockResolvedValue({ id: 1 });
    const payload = {
      projectId: 'p1', strategy: 's1', symbol: 'BTCUSDT', side: 'BUY', qtyType: 'USDT', qty: 50,
      entry: { type: 'MARKET' }, time: new Date().toISOString(), signalId: 'id1',
    };
    const response = await server.inject({
      method: 'POST',
      url: '/v1/webhook/tradingview',
      headers: { 'x-webhook-secret': 'secret' },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true, signalId: 'id1', deduped: true });
  });
});