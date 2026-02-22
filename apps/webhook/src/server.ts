import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { buildServer } from './index';

const prisma = new PrismaClient();
const port = parseInt(process.env.PORT || '3000', 10);
const server = buildServer({ prisma, webhookSecret: process.env.WEBHOOK_SECRET || '' });
server.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`Webhook server listening on ${port}`);
});