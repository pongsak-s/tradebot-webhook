import { z } from 'zod';

export const SignalSchema = z.object({
  projectId: z.string(),
  strategy: z.string(),
  symbol: z.string(),
  side: z.enum(['BUY', 'SELL']),
  qtyType: z.enum(['USDT', 'CONTRACT']),
  qty: z.number(),
  leverage: z.number().optional(),
  entry: z.object({ type: z.enum(['MARKET', 'LIMIT']), price: z.number().optional() }),
  sl: z
    .object({ type: z.enum(['PRICE', 'PERCENT']), price: z.number().optional(), percent: z.number().optional() })
    .optional(),
  tp: z
    .object({ type: z.enum(['PRICE', 'PERCENT']), price: z.number().optional(), percent: z.number().optional() })
    .optional(),
  time: z.string(),
  signalId: z.string(),
});

export type Signal = z.infer<typeof SignalSchema>;