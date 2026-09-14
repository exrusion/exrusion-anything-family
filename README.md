# Anything

Unified launchpad interface for StonkFun, Pump.fun and Pons.

## Apps

- `web/` — static frontend deployed to Vercel
- `api/` — Node.js API deployed to Railway

Live transaction submission is intentionally gated behind verified provider
adapter configuration. The public API can safely create launch intents and fee
quotes without accepting custody of creator proceeds.

