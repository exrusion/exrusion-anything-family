# Anything

Unified self-service launchpad interface for StonkFun, Pump.fun, Pons, Flap, Ember, Four.meme, Bags, Clanker, ArcPad and long.supply.

## Apps

- `web/` — static frontend deployed to Vercel
- `api/` — Node.js API deployed to Railway

Production routes use wallet-signed transactions for StonkFun, Pons, Flap and
Ember. Pump.fun custom-pair launches use the secured, idempotent PumpXStocks
adapter with a forced 0% creator fee for Anything. Provider fees and network
costs still apply; Anything does not add a platform cut.

Bags uses its official prefilled launch-intent flow. Clanker, ArcPad and
long.supply use clearly labelled provider handoffs so users finish network,
liquidity and wallet confirmation on the provider's official page. Arc routes
remain marked early access until Arc publishes stable mainnet infrastructure.
