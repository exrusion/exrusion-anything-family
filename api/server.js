import http from "node:http";
import crypto from "node:crypto";

const port = Number(process.env.PORT || 8080);
const startedAt = new Date().toISOString();
const platformFeeBps = Math.max(0, Math.min(1000, Number(process.env.PLATFORM_FEE_BPS || 75)));
const executionMode = process.env.EXECUTION_MODE === "live" ? "live" : "intent-only";
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
    execution: "pending_verified_adapter",
  },
  pumpfun: {
    id: "pumpfun",
    name: "Pump.fun",
    network: "Solana",
    categories: ["memes", "culture"],
    providerFeeBps: 100,
    execution: "pending_verified_adapter",
  },
  pons: {
    id: "pons",
    name: "Pons",
    network: "Robinhood Chain",
    categories: ["creator", "paired-markets"],
    providerFeeBps: 125,
    execution: "pending_verified_adapter",
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
      if (raw.length > 128_000) reject(new Error("payload_too_large"));
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
    platformRecipientConfigured: Boolean(process.env.PLATFORM_TREASURY_ADDRESS),
    disclosure:
      "The platform fee is disclosed before signing. Creator proceeds are not redirected to the platform.",
  };
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
