import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AbiCoder, Contract, JsonRpcProvider, ZeroAddress, ZeroHash, parseEther, parseUnits } from "ethers";

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
const fourMemeApiBase = String(process.env.FOURMEME_API_BASE || "https://four.meme/meme-api/v1").replace(/\/$/, "");
const fourMemeRegistry = "0x912CEf0C3aE9Ab6eB3Ec87cab69371cFb317Ab94";
const fourMemeTemplateId = "1778027615723";
const bscRpcUrls = (process.env.BSC_RPC_URLS || "https://bsc-dataseed.binance.org,https://bsc-rpc.publicnode.com,https://1rpc.io/bnb").split(",").map((value) => value.trim()).filter(Boolean);
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "https://anything.family,https://www.anything.family,https://exrusion-anything-family.vercel.app,http://localhost:3000")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);
const publicDir = fileURLToPath(new URL("./public/", import.meta.url));
const ponsPairs = [{"symbol":"ETH","address":"0x0000000000000000000000000000000000000000","name":"Native ETH","decimals":18},{"address":"0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC","symbol":"NVDA","name":"NVIDIA","decimals":18},{"address":"0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa","symbol":"SPCX","name":"SpaceX Class A","decimals":18},{"address":"0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3","symbol":"GOOGL","name":"Alphabet Class A","decimals":18},{"address":"0x322F0929c4625eD5bAd873c95208D54E1c003b2d","symbol":"TSLA","name":"Tesla","decimals":18},{"address":"0x1b0E319c6A659F002271B69dB8A7df2F911c153E","symbol":"GME","name":"GameStop","decimals":18},{"address":"0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9","symbol":"AAPL","name":"Apple","decimals":18},{"address":"0x117cc2133c37B721F49dE2A7a74833232B3B4C0C","symbol":"SPY","name":"SPDR S&P 500 ETF","decimals":18},{"address":"0xB90A19fF0Af67f7779afF50A882A9CfF42446400","symbol":"SNDK","name":"SanDisk","decimals":18},{"address":"0x86923f96303D656E4aa86D9d42D1e57ad2023fdC","symbol":"AMD","name":"Advanced Micro Devices","decimals":18},{"address":"0x12f190a9F9d7D37a250758b26824B97CE941bF54","symbol":"AMZN","name":"Amazon","decimals":18},{"address":"0xe93237C50D904957Cf27E7B1133b510C669c2e74","symbol":"MSFT","name":"Microsoft","decimals":18},{"address":"0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35","symbol":"META","name":"Meta Platforms","decimals":18},{"address":"0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5","symbol":"CRCL","name":"Circle Internet Group","decimals":18},{"address":"0x6330D8C3178a418788dF01a47479c0ce7CCF450b","symbol":"COIN","name":"Coinbase","decimals":18},{"address":"0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD","symbol":"MU","name":"Micron Technology","decimals":18},{"address":"0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A","symbol":"PLTR","name":"Palantir Technologies","decimals":18},{"address":"0x5e81213613b6B86EaB4c6c50d718d34359459786","symbol":"TTWO","name":"Take-Two Interactive","decimals":18},{"address":"0xB1BF26c1D20ff267A4f93550d1E0d06ac40a114B","symbol":"RIVN","name":"Rivian Automotive","decimals":18},{"address":"0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2","symbol":"COST","name":"Costco","decimals":18},{"address":"0x1D11f0496982706C5e14A514D4E79F2e6BdE4516","symbol":"DJT","name":"Trump Media & Technology Group","decimals":18},{"address":"0xec262a75e413fAfD0dF80480274532C79D42da09","symbol":"MSTR","name":"Strategy","decimals":18},{"address":"0xD5f3879160bc7c32ebb4dC785F8a4F505888de68","symbol":"QQQ","name":"Invesco QQQ","decimals":18},{"address":"0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C","symbol":"RDDT","name":"Reddit","decimals":18},{"address":"0xCceE82fE024c36fA15E1005edE3E9e4787e23D09","symbol":"HIMS","name":"Hims & Hers Health","decimals":18},{"address":"0x48E39E56aCdbA37b09020C0b734A613C9a2f100A","symbol":"BB","name":"BlackBerry","decimals":18},{"address":"0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e","symbol":"GLD","name":"SPDR Gold Shares","decimals":18},{"address":"0xCEC185eB182c47d1bA1EFc84e6959e18cd620Be4","symbol":"cbBTC","name":"Coinbase Wrapped BTC","decimals":8},{"address":"0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168","symbol":"USDG","name":"Global Dollar","decimals":6},{"address":"0x8005d266423c7ea827372c9c864491e5786600ea","symbol":"LLY","name":"Eli Lilly","decimals":18},{"address":"0x9e7ABD3C9139D14E4c86DcE0e455AAB7A0C2FB3E","symbol":"WYFI","name":"WhiteFiber","decimals":18},{"address":"0x58FfE4a942d3885bAa22D7520691F611EF09e7AA","symbol":"TSM","name":"Taiwan Semiconductor Manufacturing","decimals":18},{"address":"0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8","symbol":"RBLX","name":"Roblox","decimals":18},{"address":"0x84CAb63bc87912E71ad199ff14A0bA45de68FeF8","symbol":"SKHY","name":"SK hynix","decimals":18},{"address":"0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd","symbol":"DELL","name":"Dell Technologies","decimals":18},{"address":"0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344","symbol":"USO","name":"United States Oil Fund","decimals":18},{"address":"0xF6589F11Bc40b669e584073F428B05562F568733","symbol":"SNAP","name":"Snap","decimals":18},{"address":"0x4e62068525Ab11FE768e29dfD00ef909B9803016","symbol":"LULU","name":"Lululemon Athletica","decimals":18},{"address":"0x41F4267525a8AFf329540eF24fD83d9044758B33","symbol":"FIG","name":"Figma","decimals":18},{"address":"0x43B07D15cE533bEc5476d70C22a78a1B2B662155","symbol":"MRNA","name":"Moderna","decimals":18},{"address":"0x7066A64c24e4206CD62E83bf198c1E7EB361F51e","symbol":"PFE","name":"Pfizer","decimals":18},{"address":"0x62fd0668e10D8B72339BE2DCF7643001688ff13B","symbol":"MRVL","name":"Marvell Technology","decimals":18},{"address":"0x03DfbBE0AC4E7bCDaFd08eD41A400326B77D8c80","symbol":"JNJ","name":"Johnson & Johnson","decimals":18},{"address":"0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B","symbol":"AMC","name":"AMC Entertainment","decimals":18},{"address":"0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5","symbol":"SGOV","name":"iShares 0-3 Month Treasury Bond ETF","decimals":18},{"address":"0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4","symbol":"BABA","name":"Alibaba","decimals":18},{"address":"0xACEF2e09adb47aD6aBeBAD9fF06689E60615C2B6","symbol":"INDA","name":"iShares MSCI India ETF","decimals":18},{"address":"0x980dcf6766FA79f5Cf0c4AAdb3ab477ff15a9619","symbol":"IBM","name":"IBM","decimals":18},{"address":"0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8","symbol":"NFLX","name":"Netflix","decimals":18},{"address":"0xceF9027c7d6985b85f0BA431125073529A947A68","symbol":"BULL","name":"Webull","decimals":18},{"address":"0x408c14038a04f7bD235329E26d2bf569ee20e250","symbol":"NU","name":"Nu Holdings","decimals":18},{"address":"0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f","symbol":"SLV","name":"iShares Silver Trust","decimals":18},{"address":"0xF53F66751B1Eff985311b693531E3290F600c410","symbol":"SHOP","name":"Shopify","decimals":18},{"address":"0x822CC93fFD030293E9842c30BBD678F530701867","symbol":"BE","name":"Bloom Energy","decimals":18},{"address":"0x25C288E6D899b9BC30160965aD9644c67e73bE0C","symbol":"F","name":"Ford Motor","decimals":18},{"address":"0xf23250dac154D05Bb671CB0d0eBEf3c635c79CE2","symbol":"UPS","name":"United Parcel Service","decimals":18},{"address":"0xf3081494B87e8D5fb7960f066E931D1D0e6E3d67","symbol":"TAO","name":"Bittensor","decimals":18},{"address":"0xc72b96e0E48ecd4DC75E1e45396e26300BC39681","symbol":"INTC","name":"Intel","decimals":18},{"address":"0xBa0CAB75495255d0cB58E22B648bFED4ECD1F47E","symbol":"SNOW","name":"Snowflake","decimals":18},{"address":"0x4D21483a44Bf67a86b77E3dA301411880797D452","symbol":"BA","name":"Boeing","decimals":18},{"address":"0x329fcACEb9AD6F9580DD5F643fed0646900D043c","symbol":"LMT","name":"Lockheed Martin","decimals":18},{"address":"0x7f0aBeF0C07280F82c6a08ead09dEd6BAE2C13Fc","symbol":"EWY","name":"iShares MSCI South Korea ETF","decimals":18},{"address":"0xaE517A2903E68bd929Dfd15be875F8369D53e94a","symbol":"CEG","name":"Constellation Energy","decimals":18},{"address":"0xFDE6b5d9BB419B10C23268c74e369AbFF39C0460","symbol":"RCAT","name":"Red Cat Holdings","decimals":18},{"address":"0x3b14C39E89D60D627b42a1A4CA45b5bb45Fc12e2","symbol":"RKLB","name":"Rocket Lab","decimals":18},{"address":"0x59818904ab4cE163b3cE4FfB64f2D6Ca02c434B4","symbol":"QUBT","name":"Quantum Computing","decimals":18},{"address":"0x116F00968269B7bfbaD4109cE591d6E74c0601d4","symbol":"NET","name":"Cloudflare","decimals":18}];
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/brand-logos.css", ["brand-logos.css", "text/css; charset=utf-8"]],
  ["/wallet-selector.css", ["wallet-selector.css", "text/css; charset=utf-8"]],
  ["/anything-logo.png", ["anything-logo.png", "image/png"]],
  ["/anything-logo.webp", ["anything-logo.webp", "image/webp"]],
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
  fourmeme: {
    id: "fourmeme",
    name: "Four.meme",
    network: "BNB Chain",
    categories: ["memes", "bonding-curve", "pancakeswap"],
    providerFeeBps: null,
    feeType: "native_launch_fee",
    feeDisplay: "Four.meme launch fee plus BNB network gas",
    execution: "wallet_signed",
  },
  bags: {
    id: "bags",
    name: "Bags",
    network: "Solana",
    categories: ["memes", "fee-sharing", "social-splits"],
    providerFeeBps: null,
    feeType: "selected_fee_mode",
    feeDisplay: "Fee mode and final costs shown on the official Bags launch screen",
    execution: "provider_handoff",
  },
  clanker: {
    id: "clanker",
    name: "Clanker",
    network: "Base",
    categories: ["memes", "uniswap", "creator-rewards"],
    providerFeeBps: null,
    feeType: "provider_quote",
    feeDisplay: "Deployment and network costs shown by Clanker",
    execution: "provider_handoff",
  },
  arcpad: {
    id: "arcpad",
    name: "ArcPad",
    network: "Arc",
    categories: ["memes", "uniswap-v3", "creator-rewards"],
    providerFeeBps: 100,
    feeType: "buy_fee",
    feeDisplay: "1% buy fee and 0% sell fee stated by ArcPad; Arc remains early access",
    execution: "provider_handoff",
  },
  long: {
    id: "long",
    name: "long.supply",
    network: "Arc",
    categories: ["stocks", "paired-markets", "custodial-bridge"],
    providerFeeBps: null,
    feeType: "provider_quote",
    feeDisplay: "Launch and bridge costs shown by long.supply",
    execution: "provider_handoff",
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

function errorText(value, fallback = "Provider request failed") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => errorText(item, "")).filter(Boolean).join(" ") || fallback;
  if (typeof value === "object") return errorText(value.message || value.msg || value.error || value.details || value.reason, fallback);
  return String(value);
}

async function upstream(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch {
      const looksLikeHtml = /^\s*<!doctype|^\s*<html/i.test(text);
      body = { error: looksLikeHtml ? "Four.meme temporarily rejected the adapter request. Please retry in a moment." : (text || "Invalid upstream response") };
    }
    if (!response.ok) {
      const error = new Error(errorText(body, `Provider returned ${response.status}`));
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
  if (!match) {
    const error = new Error("A valid image upload is required.");
    error.status = 422;
    throw error;
  }
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 4_500_000) {
    const error = new Error("Image must be smaller than 4.5 MB.");
    error.status = 422;
    throw error;
  }
  return { blob: new Blob([bytes], { type: match[1] }), type: match[1] };
}

function fourMemeResult(payload, step) {
  if (payload?.code === "0" || payload?.code === 0) return payload.data;
  const error = new Error(errorText(payload, `Four.meme ${step} failed.`));
  error.status = 502;
  throw error;
}

function toHexPayload(value) {
  const text = String(value || "");
  if (text.startsWith("0x")) return text;
  if (/^[0-9a-fA-F]+$/.test(text)) return `0x${text}`;
  return `0x${Buffer.from(text, "base64").toString("hex")}`;
}

const openFourRegistryAbi = [
  "function openFourTool() view returns (address)",
  "function openFourCore() view returns (address)",
];
const paramTuple = "(string name,string abiType,uint8 decimals,bool optional,string title,string defaultValue,string hint,string minValue,string maxValue)";
const schemaTuple = `(string kind,uint8 version,${paramTuple}[] params)`;
const openFourToolsAbi = [`function getPresetEncodeSchemas(uint256 presetId) view returns (${schemaTuple} tokenSchema,${schemaTuple} vaultSchema,${schemaTuple} curveSchema,${schemaTuple} tradeSchema,${schemaTuple} migrateSchema,${schemaTuple} customDataSchema)`];
const abiCoder = AbiCoder.defaultAbiCoder();
let openFourRuntimePromise;

function moduleDefault(desc, accountAddress) {
  const name = String(desc.name || "").toLowerCase();
  const raw = String(desc.defaultValue || "").trim();
  if (raw) {
    if (desc.abiType === "bool") return raw === "true" || raw === "1";
    if (desc.abiType === "address") return raw;
    if (desc.abiType === "bytes") return raw === "0" ? "0x" : raw;
    if (desc.abiType === "bytes32") return raw === "0" ? ZeroHash : raw;
    return Number(desc.decimals || 0) > 0 ? parseUnits(raw, Number(desc.decimals)) : BigInt(raw);
  }
  if (desc.abiType === "address") return /(founder|creator|owner|receiver|beneficiary)/.test(name) ? accountAddress : ZeroAddress;
  if (desc.abiType === "bool") return false;
  if (desc.abiType === "bytes") return "0x";
  if (desc.abiType === "bytes32") return ZeroHash;
  if (desc.abiType === "string") return "";
  return 0n;
}

function encodeOpenFourModule(schema, accountAddress) {
  const params = Array.from(schema?.params || []);
  if (!params.length) return "0x";
  const tupleType = `(${params.map((item) => item.abiType).join(",")})`;
  return abiCoder.encode([tupleType], [params.map((item) => moduleDefault(item, accountAddress))]);
}

async function loadOpenFourRuntime() {
  if (!openFourRuntimePromise) {
    openFourRuntimePromise = (async () => {
      let lastError;
      for (const rpcUrl of bscRpcUrls) {
        try {
          const provider = new JsonRpcProvider(rpcUrl, 56, { staticNetwork: true });
          const registry = new Contract(fourMemeRegistry, openFourRegistryAbi, provider);
          const [toolsAddress, coreAddress] = await Promise.all([registry.openFourTool(), registry.openFourCore()]);
          const tools = new Contract(toolsAddress, openFourToolsAbi, provider);
          const schemas = await tools.getPresetEncodeSchemas(fourMemeTemplateId);
          return { coreAddress, schemas };
        } catch (error) { lastError = error; }
      }
      throw new Error(`Four.meme BNB configuration is unavailable: ${lastError?.shortMessage || lastError?.message || "RPC unavailable"}`);
    })().catch((error) => { openFourRuntimePromise = null; throw error; });
  }
  return openFourRuntimePromise;
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
      if (provider === "pons") return json(res, 200, { pairs: ponsPairs }, origin);
      if (provider === "ember") return json(res, 200, await upstream(`${emberApiBase}/api/solana/quotes`), origin);
      if (provider === "flap") {
        const catalog = await upstream(`${flapApiBase}/api/launch/quote-tokens`);
        const bnb = catalog.chains?.find((chain) => Number(chain.chainId) === 56);
        return json(res, 200, { pairs: bnb?.quoteTokens || [] }, origin);
      }
      if (provider === "fourmeme") return json(res, 200, { pairs: [{ symbol: "BNB", name: "BNB", address: "0x0000000000000000000000000000000000000000", decimals: 18 }] }, origin);
      if (provider === "bags") return json(res, 200, { pairs: [{ symbol: "SOL", name: "Solana", address: "So11111111111111111111111111111111111111112", decimals: 9 }] }, origin);
      if (provider === "clanker") return json(res, 200, { pairs: [{ symbol: "WETH", name: "Wrapped Ether", address: "0x4200000000000000000000000000000000000006", decimals: 18 }] }, origin);
      if (provider === "arcpad") return json(res, 200, { pairs: [{ symbol: "USDC", name: "Arc native gas and launch pair", address: "native", decimals: 18 }] }, origin);
      if (provider === "long") return json(res, 200, { pairs: [{ symbol: "STOCK", name: "Choose a live stock pair on long.supply", address: "provider", decimals: 18 }] }, origin);
      return json(res, 400, { error: "provider_not_configured" }, origin);
    } catch (error) {
      return json(res, error.status || 502, error.body || { error: error.message || "provider_unavailable" }, origin);
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/fourmeme/nonce") {
    try {
      const body = await readBody(req);
      const accountAddress = String(body.accountAddress || "");
      if (!/^0x[a-fA-F0-9]{40}$/.test(accountAddress)) return json(res, 422, { error: "A valid BNB wallet address is required." }, origin);
      const result = await upstream(`${fourMemeApiBase}/private/user/nonce/generate`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountAddress, verifyType: "LOGIN", networkCode: "BSC" }),
      });
      return json(res, 200, { nonce: fourMemeResult(result, "nonce request") }, origin);
    } catch (error) {
      return json(res, error.status || 502, error.body || { error: error.message || "fourmeme_nonce_failed" }, origin);
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/fourmeme/prepare") {
    try {
      const body = await readBody(req);
      const accountAddress = String(body.accountAddress || "");
      if (!/^0x[a-fA-F0-9]{40}$/.test(accountAddress) || !/^0x[a-fA-F0-9]+$/.test(String(body.loginSignature || ""))) {
        return json(res, 422, { error: "A valid BNB wallet and login signature are required." }, origin);
      }
      const errors = validateIntent({ ...body, provider: "fourmeme" });
      if (errors.length) return json(res, 422, { error: "validation_failed", details: errors }, origin);
      const image = imageBlob(body.logo);
      const login = await upstream(`${fourMemeApiBase}/private/user/login/dex`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          region: "WEB", langType: "EN", loginIp: "", inviteCode: "", walletName: String(body.walletName || "Browser wallet").slice(0, 80),
          verifyInfo: { address: accountAddress, networkCode: "BSC", signature: body.loginSignature, verifyType: "LOGIN" },
        }),
      });
      const accessToken = fourMemeResult(login, "wallet login");
      const uploadForm = new FormData();
      uploadForm.append("file", image.blob, `token.${image.type.split("/")[1] || "webp"}`);
      const upload = await upstream(`${fourMemeApiBase}/private/token/upload`, { method: "POST", headers: { "meme-web-access": accessToken }, body: uploadForm });
      const imgUrl = fourMemeResult(upload, "image upload");
      const config = await upstream(`${fourMemeApiBase}/public/token_template/config?templateId=${fourMemeTemplateId}`);
      const symbols = fourMemeResult(config, "OpenFour template configuration");
      if (!Array.isArray(symbols) || !symbols.length) throw new Error("Four.meme returned no OpenFour launch configuration.");
      const raisedToken = symbols.find((item) => item?.symbol === "BNB") || symbols[0];
      const { coreAddress, schemas } = await loadOpenFourRuntime();
      const allowedLabels = ["Meme", "AI", "Defi", "Games", "Infra", "De-Sci", "Social", "Depin", "Charity", "Others"];
      const label = allowedLabels.includes(body.label) ? body.label : "Meme";
      const preSale = Math.max(0, Number(body.preSale || 0));
      const createBody = {
        templateId: fourMemeTemplateId,
        name: body.name.trim(), shortName: body.ticker.trim().toUpperCase(), desc: String(body.description || "Launch from Anything").trim() || "Launch from Anything",
        imgUrl, symbol: raisedToken.symbol, totalSupply: String(raisedToken.totalSupply), saleAmount: String(raisedToken.saleAmount), raisedAmount: String(raisedToken.raisedAmount),
        presaleQuote: String(preSale), feePlan: true, label,
        initParams: {
          tokenParams: encodeOpenFourModule(schemas[0], accountAddress),
          vaultParams: encodeOpenFourModule(schemas[1], accountAddress),
          curveParams: encodeOpenFourModule(schemas[2], accountAddress),
          tradeParams: encodeOpenFourModule(schemas[3], accountAddress),
          migrateParams: encodeOpenFourModule(schemas[4], accountAddress),
          customDataParams: encodeOpenFourModule(schemas[5], accountAddress),
        },
      };
      if (body.links?.website) createBody.webUrl = String(body.links.website).slice(0, 300);
      if (body.links?.x) createBody.twitterUrl = String(body.links.x).slice(0, 300);
      if (body.links?.telegram) createBody.telegramUrl = String(body.links.telegram).slice(0, 300);
      const created = await upstream(`${fourMemeApiBase}/private/token_template/token/create`, {
        method: "POST", headers: { "meme-web-access": accessToken, "content-type": "application/json" }, body: JSON.stringify(createBody),
      });
      const result = fourMemeResult(created, "OpenFour launch preparation");
      const payload = Array.isArray(result) ? result[0] : result;
      if (!payload?.createArg || !payload?.signature) throw new Error("Four.meme did not return a launch transaction.");
      const txValue = parseEther(String(raisedToken.createFee || "0")) + (raisedToken.symbol === "BNB" ? parseEther(String(preSale)) : 0n);
      return json(res, 200, { createArg: toHexPayload(payload.createArg), signature: toHexPayload(payload.signature), tokenId: payload.tokenId || "", coreAddress, txValue: txValue.toString(), templateId: fourMemeTemplateId }, origin);
    } catch (error) {
      return json(res, error.status || (error.message === "payload_too_large" ? 413 : 502), error.body || { error: error.message || "fourmeme_prepare_failed" }, origin);
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

  if (req.method === "POST" && url.pathname === "/v1/metadata/image") {
    try {
      const body = await readBody(req);
      const image = imageBlob(body.logo);
      const form = new FormData();
      form.append("file", image.blob, `token.${image.type.split("/")[1] || "png"}`);
      const uploaded = await upstream(`${emberApiBase}/api/upload/image`, { method: "POST", body: form });
      if (!uploaded.url) throw new Error("Image host did not return a public URL.");
      const uploadedUrl = String(uploaded.url);
      const publicUrl = uploadedUrl.startsWith("ipfs://")
        ? `https://ipfs.io/ipfs/${uploadedUrl.slice("ipfs://".length)}`
        : uploadedUrl;
      return json(res, 200, { url: publicUrl, uri: uploadedUrl }, origin);
    } catch (error) {
      return json(res, error.status || 502, error.body || { error: error.message || "image_upload_failed" }, origin);
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
        if (payload.mode === "standard" && body.feeTier === "2%") payload.feeTier = "2%";
        if (payload.mode === "reward") {
          payload.transferFeeBps = Number(body.transferFeeBps) === 300 ? 300 : 100;
          if (Number(body.airdropPercent) > 0) {
            payload.airdropPercent = Math.min(50, Number(body.airdropPercent));
            payload.airdropTier = ["top100", "top500", "top1000", "top2500", "top5000"].includes(body.airdropTier) ? body.airdropTier : "top100";
          }
        }
        if (Number(body.devBuyPercent) > 0) payload.devBuyPercent = Math.min(50, Number(body.devBuyPercent));
        else if (Number(body.devBuySol) > 0) payload.devBuySol = Number(body.devBuySol);
        if (body.links?.website) payload.website = String(body.links.website).slice(0, 300);
        if (body.links?.x) payload.twitter = String(body.links.x).slice(0, 300);
        if (body.links?.telegram) payload.telegram = String(body.links.telegram).slice(0, 300);
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
            creatorWallet: body.creatorWallet || undefined, links: body.links || {},
            creatorFeeBps: Math.max(0, Math.min(100, Number(body.creatorFeeBps || 0))), cashback: Boolean(body.cashback), mayhemMode: Boolean(body.mayhemMode), firstBuyPercent: 0,
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
            mode: String(body.mode || "holders"), splits: [], holdersBps: 10000, payInQuote: body.payout !== "sol", payMint: body.payout === "ember" ? "EMBER" : undefined,
            addons: { shield: Boolean(body.addons?.shield), volatilityFee: Boolean(body.addons?.volatilityFee), airdropPct: Number(body.addons?.airdropPct || 0) },
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
