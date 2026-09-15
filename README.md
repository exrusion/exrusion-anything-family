# Anything

Unified self-service launchpad interface for StonkFun, Pump.fun, Pons, Flap, Ember and Four.meme.

## Apps

- `web/` — static frontend deployed to Vercel
- `api/` — Node.js API deployed to Railway

Production routes use wallet-signed transactions for StonkFun, Pons, Flap and
Ember. Pump.fun custom-pair launches use the secured, idempotent PumpXStocks
adapter with a forced 0% creator fee for Anything. Provider fees and network
costs still apply; Anything does not add a platform cut.
