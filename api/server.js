import http from "node:http";
import crypto from "node:crypto";

const port = Number(process.env.PORT || 8080);
const startedAt = new Date().toISOString();
const configuredPlatformFeeBps = Math.max(0, Math.min(1000, Number(process.env.PLATFORM_FEE_BPS || 75)));
const platformTreasuryAddress = String(process.env.PLATFORM_TREASURY_ADDRESS || "").trim();
const platformFeeBps = platformTreasuryAddress ? configuredPlatformFeeBps : 0;
const executionMode = process.env.EXECUTION_MODE === "live" ? "live" : "intent-only";
const stonkApiBase = String(process.env.STONK_API_BASE || "https://www.stonkfun.xyz/api/public/v1").replace(/\/$/, "");
const pumpAdapterUrl = String(process.env.PUMPFUN_ADAPTER_URL || "").replace(/\/$/, "");
const pumpAdapterSecret = String(process.env.PUMPFUN_ADAPTER_SECRET || "");
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "https://anything.family,http://localhost:3000")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

const providers = {
  stonkfun: {
    id: "stonkfun",
    name: "StonkFun",
    network: "Solana",
    categories: ["stocks", "rewards"],
    providerFeeBps: 100,
    execution: "wallet_signed",
  },
  pumpfun: {
    id: "pumpfun",
    name: "Pump.fun",
    network: "Solana",
    categories: ["memes", "culture"],
    providerFeeBps: 100,
    execution: pumpAdapterUrl && pumpAdapterSecret ? "server_adapter" : "configuration_required",
  },
  pons: {
    id: "pons",
    name: "Pons",
    network: "Robinhood Chain",
    categories: ["creator", "paired-markets"],
    providerFeeBps: 125,
    execution: "wallet_signed",
  },
};

const launchIntents = new Map();

function json(res, status, body, origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": status === 200 ? "public, max-age=15, stale-while-revalidate=45" : "no-store",
    "x-content-type-options": "nosniff",
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 6_000_000) reject(new Error("payload_too_large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function quote(providerId) {
  const provider = providers[providerId];
  if (!provider) return null;
  return {
    provider: provider.id,
    providerFeeBps: provider.providerFeeBps,
    platformFeeBps,
    totalFeeBps: provider.providerFeeBps + platformFeeBps,
    configuredPlatformFeeBps,
    platformRecipientConfigured: Boolean(platformTreasuryAddress),
    disclosure:
      "The platform fee is disclosed before signing. Creator proceeds are not redirected to the platform.",
  };
}

async function upstream(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text || "Invalid upstream response" }; }
    if (!response.ok) {
      const error = new Error(body.error || body.message || `Provider returned ${response.status}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function validateIntent(body) {
  const errors = [];
  if (!providers[body.provider]) errors.push("Choose a supported provider.");
  if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.length > 32)
    errors.push("Market name must contain 2–32 characters.");
  if (typeof body.ticker !== "string" || !/^[A-Za-z0-9]{2,10}$/.test(body.ticker))
    errors.push("Ticker must contain 2–10 letters or numbers.");
  if (body.initialBuy != null && (!Number.isFinite(Number(body.initialBuy)) || Number(body.initialBuy) < 0))
    errors.push("Initial buy must be zero or greater.");
  return errors;
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === "OPTIONS") {
    if (origin && allowedOrigins.has(origin)) {
      res.writeHead(204, {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type,idempotency-key",
        vary: "origin",
      });
      return res.end();
    }
    return json(res, 403, { error: "origin_not_allowed" });
  }

  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, {
      ok: true,
      service: "anything-api",
      startedAt,
      executionMode,
      providers: Object.keys(providers).length,
    }, origin);
  }

  if (req.method === "GET" && url.pathname === "/v1/providers") {
    return json(res, 200, {
      data: Object.values(providers).map((provider) => ({
        ...provider,
        platformFeeBps,
      })),
      executionMode,
    }, origin);
  }

  if (req.method === "GET" && url.pathname === "/v1/quote") {
    const result = quote(url.searchParams.get("provider"));
    return result
      ? json(res, 200, result, origin)
      : json(res, 400, { error: "unsupported_provider" }, origin);
  }

  if (req.method === "GET" && url.pathname === "/v1/pairs") {
    const provider = url.searchParams.get("provider");
    try {
      if (provider === "stonkfun") return json(res, 200, await upstream(`${stonkApiBase}/pairs?launchable=true`), origin);
      if (provider === "pumpfun" && pumpAdapterUrl) return json(res, 200, await upstream(`${pumpAdapterUrl}/pairs`), origin);
      if (provider === "pons") return json(res, 200, { pairs: [{ symbol: "ETH", address: "0x0000000000000000000000000000000000000000", name: "Native ETH" }] }, origin);
      return json(res, 400, { error: "provider_not_configured" }, origin);
    } catch (error) {
      return json(res, error.status || 502, error.body || { error: error.message || "provider_unavailable" }, origin);
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/launches/prepare") {
    try {
      const body = await readBody(req);
      const errors = validateIntent(body);
      if (errors.length) return json(res, 422, { error: "validation_failed", details: errors }, origin);

      if (body.provider === "stonkfun") {
        if (!body.creatorWallet || !body.logo) return json(res, 422, { error: "Wallet and image are required." }, origin);
        const payload = {
          creatorWallet: body.creatorWallet,
          quoteMint: body.quoteMint,
          name: body.name.trim(),
          symbol: body.ticker.trim().toUpperCase(),
          mode: body.mode === "reward" ? "reward" : "standard",
          logo: body.logo,
        };
        if (Number(body.devBuyPercent) > 0) payload.devBuyPercent = Math.min(50, Number(body.devBuyPercent));
        const result = await upstream(`${stonkApiBase}/launches/prepare`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
        });
        return json(res, 200, { provider: "stonkfun", ...result }, origin);
      }

      if (body.provider === "pumpfun") {
        if (!pumpAdapterUrl || !pumpAdapterSecret) return json(res, 503, { error: "Pump.fun adapter is not configured." }, origin);
        const result = await upstream(`${pumpAdapterUrl}/launch`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${pumpAdapterSecret}` },
          body: JSON.stringify({
            idempotencyKey: body.idempotencyKey || crypto.randomUUID(), name: body.name.trim(),
            symbol: body.ticker.trim().toUpperCase(), description: String(body.description || "Launch from Anything").trim(),
            imageUrl: body.imageUrl, xUrl: body.xUrl, pairSymbol: body.pairSymbol,
            creatorFeeBps: Math.max(0, Math.min(100, Number(body.creatorFeeBps || 0))), cashback: Boolean(body.cashback), firstBuyPercent: 0,
          }),
        });
        return json(res, 200, { provider: "pumpfun", submitted: true, ...result }, origin);
      }

      return json(res, 422, { error: "Pons launches are signed directly in the connected wallet." }, origin);
    } catch (error) {
      return json(res, error.status || (error.message === "payload_too_large" ? 413 : 502), error.body || { error: error.message || "provider_request_failed" }, origin);
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/launches/submit") {
    try {
      const body = await readBody(req);
      if (body.provider !== "stonkfun") return json(res, 400, { error: "unsupported_provider" }, origin);
      const result = await upstream(`${stonkApiBase}/launches/submit`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedQuote: body.signedQuote, signedTransaction: body.signedTransaction, logo: body.logo }),
      });
      return json(res, 200, { provider: "stonkfun", ...result }, origin);
    } catch (error) {
      return json(res, error.status || 502, error.body || { error: error.message || "provider_request_failed" }, origin);
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/launch-intents") {
    try {
      const body = await readBody(req);
      const errors = validateIntent(body);
      if (errors.length) return json(res, 422, { error: "validation_failed", details: errors }, origin);

      const intent = {
        id: `li_${crypto.randomBytes(12).toString("hex")}`,
        status: executionMode === "live" ? "ready_for_wallet_signature" : "adapter_configuration_required",
        provider: body.provider,
        name: body.name.trim(),
        ticker: body.ticker.trim().toUpperCase(),
        description: typeof body.description === "string" ? body.description.trim().slice(0, 500) : "",
        initialBuy: Number(body.initialBuy || 0),
        walletAddress: typeof body.walletAddress === "string" ? body.walletAddress.trim() : null,
        fees: quote(body.provider),
        createdAt: new Date().toISOString(),
      };
      launchIntents.set(intent.id, intent);
      return json(res, 201, { data: intent }, origin);
    } catch (error) {
      const code = error.message === "payload_too_large" ? 413 : 400;
      return json(res, code, { error: error.message || "invalid_request" }, origin);
    }
  }

  const intentMatch = url.pathname.match(/^\/v1\/launch-intents\/(li_[a-f0-9]+)$/);
  if (req.method === "GET" && intentMatch) {
    const intent = launchIntents.get(intentMatch[1]);
    return intent
      ? json(res, 200, { data: intent }, origin)
      : json(res, 404, { error: "launch_intent_not_found" }, origin);
  }

  return json(res, 404, { error: "not_found" }, origin);
});

server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ level: "info", event: "server_started", port, executionMode }));
});

export default server;
