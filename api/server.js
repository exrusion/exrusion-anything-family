import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 8080);
const startedAt = new Date().toISOString();
const configuredPlatformFeeBps = 0;
const platformFeeBps = 0;
const executionMode = process.env.EXECUTION_MODE === "live" ? "live" : "intent-only";
const stonkApiBase = String(process.env.STONK_API_BASE || "https://www.stonkfun.xyz/api/public/v1").replace(/\/$/, "");
const pumpAdapterUrl = String(process.env.PUMPFUN_ADAPTER_URL || "").replace(/\/$/, "");
const pumpAdapterSecret = String(process.env.PUMPFUN_ADAPTER_SECRET || "");
const emberApiBase = String(process.env.EMBER_API_BASE || "https://embercurve.fun").replace(/\/$/, "");
const flapApiBase = String(process.env.FLAP_API_BASE || "https://flap.sh").replace(/\/$/, "");
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "https://anything.family,http://localhost:3000")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);
const publicDir = fileURLToPath(new URL("./public/", import.meta.url));
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/brand-logos.css", ["brand-logos.css", "text/css; charset=utf-8"]],
  ["/wallet-selector.css", ["wallet-selector.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/config.js", ["config.js", "text/javascript; charset=utf-8"]],
]);

const providers = {
  stonkfun: {
    id: "stonkfun",
    name: "StonkFun",
    network: "Solana",
    categories: ["stocks", "rewards"],
    providerFeeBps: 100,
    feeType: "default_trade_fee",
    feeDisplay: "1.00% default trading fee; launch charge returned by live quote",
    execution: "wallet_signed",
  },
  pumpfun: {
    id: "pumpfun",
    name: "Pump.fun",
    network: "Solana",
    categories: ["memes", "culture"],
    providerFeeBps: 125,
    feeType: "bonding_curve_trade_fee",
    feeDisplay: "1.25% bonding-curve trading fee; no token creation fee",
    execution: pumpAdapterUrl && pumpAdapterSecret ? "server_adapter" : "configuration_required",
  },
  pons: {
    id: "pons",
    name: "Pons",
    network: "Robinhood Chain",
    categories: ["creator", "paired-markets"],
    providerFeeBps: null,
    feeType: "native_launch_fee",
    feeDisplay: "0.0005 ETH launch fee plus gas; trading fees follow live configuration",
    execution: "wallet_signed",
  },
  flap: {
    id: "flap",
    name: "Flap",
    network: "BNB Chain",
    categories: ["memes", "tax-tokens", "rwa-pairs"],
    providerFeeBps: null,
    feeType: "selected_token_tax",
    feeDisplay: "Selected buy/sell tax plus initial buy and gas",
    execution: "wallet_signed",
  },
  ember: {
    id: "ember",
    name: "Ember",
    network: "Solana",
    categories: ["stocks", "fee-modules", "meteora"],
    providerFeeBps: 200,
    feeType: "selected_trade_tax",
    feeDisplay: "2.00% default selected trade tax; 1%, 2% and 3% available",
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
  const percentageFee = Number.isFinite(provider.providerFeeBps) ? provider.providerFeeBps : null;
  return {
    provider: provider.id,
    providerFeeBps: percentageFee,
    feeType: provider.feeType,
    feeDisplay: provider.feeDisplay,
    platformFeeBps,
    totalFeeBps: percentageFee == null ? null : percentageFee + platformFeeBps,
    configuredPlatformFeeBps,
    platformRecipientConfigured: false,
    disclosure: "Provider and network costs apply. Anything takes no cut.",
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

function imageBlob(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error("A valid image upload is required.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 4_500_000) throw new Error("Image must be smaller than 4.5 MB.");
  return { blob: new Blob([bytes], { type: match[1] }), type: match[1] };
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

  if (req.method === "GET" && staticFiles.has(url.pathname)) {
    const [fileName, contentType] = staticFiles.get(url.pathname);
    try {
      const body = await readFile(`${publicDir}${fileName}`);
      res.writeHead(200, {
        "content-type": contentType,
        "cache-control": fileName === "index.html" ? "no-cache" : "public, max-age=3600",
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
      });
      return res.end(body);
    } catch {
      return json(res, 404, { error: "frontend_not_found" }, origin);
    }
  }

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
      if (provider === "ember") return json(res, 200, await upstream(`${emberApiBase}/api/solana/quotes`), origin);
      if (provider === "flap") {
        const catalog = await upstream(`${flapApiBase}/api/launch/quote-tokens`);
        const bnb = catalog.chains?.find((chain) => Number(chain.chainId) === 56);
        return json(res, 200, { pairs: bnb?.quoteTokens || [] }, origin);
      }
      return json(res, 400, { error: "provider_not_configured" }, origin);
    } catch (error) {
      return json(res, error.status || 502, error.body || { error: error.message || "provider_unavailable" }, origin);
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/metadata/flap") {
    try {
      const body = await readBody(req);
      const image = imageBlob(body.logo);
      const form = new FormData();
      form.append("operations", JSON.stringify({ query: "mutation Create($file: Upload!, $meta: MetadataInput!) { create(file: $file, meta: $meta) }", variables: { file: null, meta: { description: String(body.description || "").slice(0, 500), twitter: body.x || null, telegram: body.telegram || null, website: body.website || null, creator: body.creatorWallet || "0x0000000000000000000000000000000000000000" } } }));
      form.append("map", JSON.stringify({ "0": ["variables.file"] }));
      form.append("0", image.blob, `token.${image.type.split("/")[1] || "png"}`);
      const result = await upstream("https://funcs.flap.sh/api/upload", { method: "POST", body: form });
      return json(res, 200, { cid: result.data?.create || result.create }, origin);
    } catch (error) {
      return json(res, error.status || 502, error.body || { error: error.message || "flap_metadata_failed" }, origin);
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/metadata/ember") {
    try {
      const body = await readBody(req);
      const image = imageBlob(body.logo);
      const form = new FormData();
      form.append("file", image.blob, `token.${image.type.split("/")[1] || "png"}`);
      const uploaded = await upstream(`${emberApiBase}/api/upload/image`, { method: "POST", body: form });
      const metadata = await upstream(`${emberApiBase}/api/upload/metadata`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: body.name, symbol: body.ticker, description: body.description || "", image: uploaded.url, website: body.website || "", x: body.x || "", telegram: body.telegram || "" }) });
      return json(res, 200, { image: uploaded.url, uri: metadata.uri }, origin);
    } catch (error) {
      return json(res, error.status || 502, error.body || { error: error.message || "ember_metadata_failed" }, origin);
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
        return json(res, 200, { provider: "stonkfun", ...(result.data || result) }, origin);
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

      if (body.provider === "ember") {
        if (!body.creatorWallet || !body.uri || !body.quoteMint) return json(res, 422, { error: "Wallet, metadata and launch pair are required." }, origin);
        const result = await upstream(`${emberApiBase}/api/solana/launch`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
            action: "prepare", creatorWallet: body.creatorWallet, name: body.name.trim(), symbol: body.ticker.trim().toUpperCase(),
            uri: body.uri, image: body.image, description: String(body.description || "").slice(0, 500), links: body.links || {},
            quoteMint: body.quoteMint, feeBps: [100, 200, 300].includes(Number(body.feeBps)) ? Number(body.feeBps) : 200,
            graduateUsd: [25000, 35000, 40000].includes(Number(body.graduateUsd)) ? Number(body.graduateUsd) : 35000,
            mode: "holders", splits: [], holdersBps: 10000, payInQuote: true, addons: { shield: false, volatilityFee: false, airdropPct: 0 },
          }),
        });
        return json(res, 200, { provider: "ember", ...(result.data || result) }, origin);
      }

      return json(res, 422, { error: "Pons launches are signed directly in the connected wallet." }, origin);
    } catch (error) {
      return json(res, error.status || (error.message === "payload_too_large" ? 413 : 502), error.body || { error: error.message || "provider_request_failed" }, origin);
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/launches/submit") {
    try {
      const body = await readBody(req);
      if (body.provider === "stonkfun") {
        const result = await upstream(`${stonkApiBase}/launches/submit`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ signedQuote: body.signedQuote, signedTransaction: body.signedTransaction, logo: body.logo }),
        });
        return json(res, 200, { provider: "stonkfun", ...(result.data || result) }, origin);
      }
      if (body.provider === "ember") {
        const result = await upstream(`${emberApiBase}/api/solana/launch`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "submit", launchId: body.launchId, signedTransaction: body.signedTransaction }),
        });
        return json(res, 200, { provider: "ember", ...(result.data || result) }, origin);
      }
      return json(res, 400, { error: "unsupported_provider" }, origin);
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
