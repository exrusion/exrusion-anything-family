const apiBase = String(process.env.FOURMEME_API_BASE || "https://four.meme/meme-api/v1").replace(/\/$/, "");
const allowedLabels = new Set(["Meme", "AI", "Defi", "Games", "Infra", "De-Sci", "Social", "Depin", "Charity", "Others"]);

function providerError(payload, fallback) {
  if (typeof payload === "string") return payload || fallback;
  return payload?.message || payload?.msg || payload?.error || fallback;
}

async function requestJson(url, options, step) {
  const upstream = await fetch(url, options);
  const text = await upstream.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text }; }
  if (!upstream.ok || ![0, "0"].includes(payload?.code)) throw new Error(providerError(payload, `Four.meme ${step} failed.`));
  return payload.data;
}

function imageFile(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([a-zA-Z0-9+/=]+)$/i);
  if (!match) throw new Error("Add a PNG, JPEG, WebP or GIF token image.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 2_000_000) throw new Error("Token image must be smaller than 2 MB.");
  const extension = match[1].toLowerCase() === "image/jpeg" ? "jpg" : match[1].slice(6).toLowerCase();
  return { blob: new Blob([bytes], { type: match[1] }), name: `token.${extension}` };
}

function toHex(value) {
  const text = String(value || "");
  if (/^0x[0-9a-fA-F]+$/.test(text)) return text;
  if (/^[0-9a-fA-F]+$/.test(text)) return `0x${text}`;
  return `0x${Buffer.from(text, "base64").toString("hex")}`;
}

function safeLink(value) {
  const text = String(value || "").trim().slice(0, 300);
  if (!text) return "";
  const url = new URL(text);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Project links must use HTTP or HTTPS.");
  return url.toString();
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed." });
  response.setHeader("cache-control", "no-store");
  try {
    const body = request.body || {};
    const accountAddress = String(body.accountAddress || "");
    const loginSignature = String(body.loginSignature || "");
    const name = String(body.name || "").trim();
    const ticker = String(body.ticker || "").trim().toUpperCase();
    if (!/^0x[a-fA-F0-9]{40}$/.test(accountAddress) || !/^0x[a-fA-F0-9]+$/.test(loginSignature)) throw new Error("A valid BNB wallet and login signature are required.");
    if (name.length < 2 || name.length > 32) throw new Error("Token name must contain 2–32 characters.");
    if (!/^[A-Z0-9]{2,10}$/.test(ticker)) throw new Error("Ticker must contain 2–10 letters or numbers.");
    const image = imageFile(body.logo);
    const accessToken = await requestJson(`${apiBase}/private/user/login/dex`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        region: "WEB", langType: "EN", loginIp: "", inviteCode: "", walletName: String(body.walletName || "Browser wallet").slice(0, 80),
        verifyInfo: { address: accountAddress, networkCode: "BSC", signature: loginSignature, verifyType: "LOGIN" },
      }),
    }, "wallet login");
    const form = new FormData();
    form.append("file", image.blob, image.name);
    const imgUrl = await requestJson(`${apiBase}/private/token/upload`, { method: "POST", headers: { "meme-web-access": accessToken }, body: form }, "image upload");
    const symbols = await requestJson(`${apiBase}/public/config`, {}, "configuration request");
    if (!Array.isArray(symbols) || !symbols.length) throw new Error("Four.meme returned no launch configuration.");
    const published = symbols.filter((item) => item?.status === "PUBLISH");
    const choices = published.length ? published : symbols;
    const raisedToken = choices.find((item) => item?.symbol === "BNB") || choices[0];
    const preSale = Math.max(0, Number(body.preSale || 0));
    if (!Number.isFinite(preSale)) throw new Error("Enter a valid Four.meme presale amount.");
    const createBody = {
      name, shortName: ticker, desc: String(body.description || "Launch from Anything").trim().slice(0, 500) || "Launch from Anything",
      totalSupply: Number(raisedToken.totalAmount ?? 1_000_000_000), raisedAmount: Number(raisedToken.totalBAmount ?? 24), saleRate: Number(raisedToken.saleRate ?? 0.8), reserveRate: 0,
      imgUrl, raisedToken, launchTime: Date.now(), funGroup: false, label: allowedLabels.has(body.label) ? body.label : "Meme",
      lpTradingFee: 0.0025, preSale: String(preSale), clickFun: false, symbol: raisedToken.symbol,
      dexType: "PANCAKE_SWAP", rushMode: false, onlyMPC: false, feePlan: false,
    };
    const website = safeLink(body.links?.website);
    const x = safeLink(body.links?.x);
    const telegram = safeLink(body.links?.telegram);
    if (website) createBody.webUrl = website;
    if (x) createBody.twitterUrl = x;
    if (telegram) createBody.telegramUrl = telegram;
    const prepared = await requestJson(`${apiBase}/private/token/create`, {
      method: "POST", headers: { "meme-web-access": accessToken, "content-type": "application/json" }, body: JSON.stringify(createBody),
    }, "launch preparation");
    if (!prepared?.createArg || !prepared?.signature) throw new Error("Four.meme did not return a launch transaction.");
    return response.status(200).json({ createArg: toHex(prepared.createArg), signature: toHex(prepared.signature), preSale: String(preSale), quoteSymbol: raisedToken.symbol });
  } catch (error) {
    return response.status(422).json({ error: error instanceof Error ? error.message : "Four.meme launch preparation failed." });
  }
}
