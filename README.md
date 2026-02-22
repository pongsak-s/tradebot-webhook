 # TradingView → Binance Futures Monorepo
 
 ## Overview
 This monorepo contains three applications and shared types:
 
 - **apps/webhook**: Receives TradingView webhooks, validates, persists signals.
 - **apps/executor**: Executes trades on Binance Futures based on signals.
 - **apps/ui**: Web dashboard for viewing projects and P&L.
 - **packages/shared**: Shared schemas, types, Prisma models.
 
 ## Prerequisites
 - Node.js >=18
 - npm or Yarn
 - Docker & Docker Compose
 
 ## Setup
 1. Install dependencies:
 
 ```bash
 npm install
 # or yarn install
 ```
 
 2. Copy environment files:
 
 ```bash
 cp apps/webhook/.env.example apps/webhook/.env
 cp apps/executor/.env.example apps/executor/.env
 cp apps/ui/.env.example apps/ui/.env
 ```
 
 3. Configure `.env` files with your credentials.
 
 4. Generate Prisma client and run migrations:
 
 ```bash
 cd packages/shared
 npx prisma migrate dev --name init
 npx prisma generate
 ```
 
 ## Local Development
 Start services via Docker:
 
 ```bash
 docker-compose up --build
 ```
 
 - Webhook: http://localhost:3000
 - Executor: http://localhost:3001
 - UI: http://localhost:3002
 
 ## Testing
 
 ```bash
 cd apps/webhook
 npm run test
 ```
 
 ## Example TradingView Alert
 Send a POST to `/v1/webhook/tradingview` with header `X-Webhook-Secret` and JSON body:
 
 ```json
 {
   "projectId": "wukong-alpha",
   "strategy": "breakout-v1",
   "symbol": "BTCUSDT",
   "side": "BUY",
   "qtyType": "USDT",
   "qty": 50,
   "leverage": 5,
   "entry": { "type": "MARKET" },
   "sl": { "type": "PRICE", "price": 48000 },
   "tp": { "type": "PRICE", "price": 52000 },
   "time": "2026-02-22T14:00:00Z",
   "signalId": "tv-12345"
 }
 ```