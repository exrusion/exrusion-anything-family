const config = window.ANYTHING_CONFIG || {};
const apiUrl = String(config.apiUrl || "").replace(/\/$/, "");
const providers = [...document.querySelectorAll(".provider")];
const $ = (selector) => document.querySelector(selector);
let selected = providers[0];
let imageData = "";
let walletAddress = "";
let walletType = "";
let evmProvider = null;
let evmWalletName = "";
let walletChoiceResolver = null;
let walletChooserState = { kind: "evm", preferredKey: "", network: "" };
let launchMode = "single";
let activeMultiIds = [];
let launchAttemptId = "";
const providerDrafts = new Map();
const multiResults = new Map();
const announcedEvmWallets = new Map();
const walletConnections = { solana: null, pons: null, flap: null };
let Transaction;
let createPublicClient, createWalletClient, custom, decodeEventLog, defineChain, getContractAddress, http, keccak256, parseUnits, toBytes, toHex;
let robinhoodChain;
let bnbChain;
let solanaToolsPromise;
let evmToolsPromise;

async function ensureSolanaTools() {
  if (!solanaToolsPromise) {
    solanaToolsPromise = import("https://esm.sh/@solana/web3.js@1.98.4").then((module) => {
      Transaction = module.Transaction;
    });
  }
  return solanaToolsPromise;
}

async function ensureEvmTools() {
  if (!evmToolsPromise) {
    evmToolsPromise = import("https://esm.sh/viem@2.37.3").then((module) => {
      ({ createPublicClient, createWalletClient, custom, decodeEventLog, defineChain, getContractAddress, http, keccak256, parseUnits, toBytes, toHex } = module);
      robinhoodChain = defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RH_RPC] } }, blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } } });
      bnbChain = defineChain({ id: 56, name: "BNB Smart Chain", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }, rpcUrls: { default: { http: [BSC_RPC] } }, blockExplorers: { default: { name: "BscScan", url: "https://bscscan.com" } } });
    });
  }
  return evmToolsPromise;
}

const providerContent = {
  stonkfun: {
    headline: "Pair a coin with the market.",
    description: "Use StonkFun’s stock, commodity and custom pairs with creator or holder rewards.",
    mechanic: "Wallet-signed API",
    hint: "Built for paired markets",
    logo: "https://www.stonkfun.xyz/stonk-mark.svg",
  },
  pumpfun: {
    headline: "Make the meme. Launch the coin.",
    description: "Route a culture coin through the secured Pump.fun custom-pair launch adapter.",
    mechanic: "Secured launch adapter",
    hint: "Fast meme launch",
    logo: "https://pump.fun/pump-logomark.svg",
  },
  pons: {
    headline: "Creators meet onchain markets.",
    description: "Launch a paired market on Robinhood Chain and direct creator fees to your connected wallet.",
    mechanic: "Direct factory contract",
    hint: "Creator-first market",
    logo: "https://www.ponsfamily.com/pons.png",
  },
  flap: {
    headline: "Program the token. Ship on BNB.",
    description: "Create a Flap Tax Token V3 with selectable buy and sell tax plus a live BNB or RWA pair.",
    mechanic: "BNB Portal V6",
    hint: "Programmable tax token",
    logo: "https://flap.sh/icon.svg",
  },
  ember: {
    headline: "Send every fee somewhere useful.",
    description: "Launch on a Meteora curve and distribute the creator side to holders in the selected pair token.",
    mechanic: "Meteora DBC route",
    hint: "Fee-powered market",
    logo: "https://embercurve.fun/apple-touch-icon.png",
  },
  fourmeme: {
    headline: "Turn a meme into a market.",
    description: "Launch a BNB meme token through Four.meme’s current OpenFour creation route.",
    mechanic: "OpenFour Core",
    hint: "BNB meme launch",
    logo: "https://four.meme/apple-touch-icon.png",
  },
};

const providerCosts = {
  stonkfun: { label: "Default trade fee", value: "1.00%", totalLabel: "Launch charge", total: "Live quote", disclosure: "StonkFun receives its trading and quoted launch costs. Anything takes no cut." },
  pumpfun: { label: "Bonding curve trade fee", value: "1.25%", totalLabel: "Token creation", total: "No creation fee", disclosure: "Pump.fun receives its trading fees. Network costs may apply; Anything takes no cut." },
  pons: { label: "Launchpad launch fee", value: "0.0005 ETH", totalLabel: "Network cost", total: "Plus gas", disclosure: "Pons receives its launch and trading fees. Anything takes no cut." },
  flap: { label: "Selected token tax", value: "3% buy / 10% sell", totalLabel: "Launch cost", total: "Initial buy + gas", disclosure: "Flap’s selected token taxes and BNB network costs apply. Anything takes no cut." },
  ember: { label: "Selected trade tax", value: "2.00%", totalLabel: "Launch charge", total: "Provider quote", disclosure: "Ember applies its selected trade-tax split and network costs. Anything takes no cut." },
  fourmeme: { label: "Launchpad fee", value: "Live contract fee", totalLabel: "Launch cost", total: "Provider fee + gas", disclosure: "Four.meme receives its launch and trading fees. BNB network gas applies; Anything takes no cut." },
};

const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const PONS_BUY_HELPER = "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948";
const PONS_DISTRIBUTOR_FACTORY = "0x70e95CC5f03DB2906081E7a8D16e4C4209291507";
const ZERO = "0x0000000000000000000000000000000000000000";
const MAGIC_DIVIDEND_SELF = "0xfEEDFEEDfeEDFEedFEEdFEEDFeEdfEEdFeEdFEEd";
const RH_RPC = "https://rpc.mainnet.chain.robinhood.com";
const FLAP_PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const FLAP_TAX_IMPL = "0x024f18294970B5c76c0691b87f138A0317156422";
const BSC_RPC = "https://bsc-dataseed.binance.org/";
const factoryAbi = [
  { type: "function", name: "launchFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "launchConfigCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "canLaunch", stateMutability: "view", inputs: [{ name: "launcher", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "approvedPairTokens", stateMutability: "view", inputs: [{ name: "pairToken", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "previewLaunchEconomics", stateMutability: "view", inputs: [{ name: "launchConfigId", type: "uint256" }, { name: "pairToken", type: "address" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "transferCreatorFeeRecipient", stateMutability: "nonpayable", inputs: [{ name: "token", type: "address" }, { name: "newRecipient", type: "address" }], outputs: [] },
  { type: "function", name: "getLaunchConfig", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "supply", type: "uint256" }, { name: "curveFeeBps", type: "uint256" }, { name: "phantomQuote", type: "uint256" }, { name: "graduationThreshold", type: "uint256" }, { name: "poolFee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "enabled", type: "bool" }] }] },
  { type: "function", name: "launchToken", stateMutability: "payable", inputs: [{ name: "params", type: "tuple", components: [{ name: "name", type: "string" }, { name: "symbol", type: "string" }, { name: "logo", type: "string" }, { name: "description", type: "string" }, { name: "socials", type: "tuple", components: [{ name: "twitter", type: "string" }, { name: "telegram", type: "string" }, { name: "discord", type: "string" }, { name: "website", type: "string" }, { name: "farcaster", type: "string" }] }, { name: "creatorFeeRecipient", type: "address" }, { name: "creatorTaxBps", type: "uint16" }, { name: "buybackEnabled", type: "bool" }, { name: "expectedEconomics", type: "bytes32" }, { name: "salt", type: "bytes32" }] }, { name: "launchConfigId", type: "uint256" }, { name: "pairToken", type: "address" }, { name: "snipeTaxExemptions", type: "address[]" }], outputs: [{ name: "token", type: "address" }, { name: "curve", type: "address" }] },
  { type: "event", name: "TokenLaunched", anonymous: false, inputs: [{ name: "token", type: "address", indexed: true }, { name: "curve", type: "address", indexed: true }, { name: "deployer", type: "address", indexed: true }, { name: "pairToken", type: "address", indexed: false }, { name: "launchConfigId", type: "uint256", indexed: false }, { name: "graduationThreshold", type: "uint256", indexed: false }] },
];
const ponsLaunchInput = factoryAbi.find((item) => item.name === "launchToken").inputs[0];
const ponsBuyHelperAbi = [{ type: "function", name: "launchAndBuy", stateMutability: "payable", inputs: [ponsLaunchInput, { name: "launchConfigId", type: "uint256" }, { name: "pairToken", type: "address" }, { name: "quoteIn", type: "uint256" }, { name: "minTokensOut", type: "uint256" }, { name: "recipient", type: "address" }, { name: "snipeTaxExemptions", type: "address[]" }], outputs: [{ name: "token", type: "address" }, { name: "curve", type: "address" }, { name: "tokensOut", type: "uint256" }] }];
const ponsDistributorAbi = [
  { type: "function", name: "distributorOf", stateMutability: "view", inputs: [{ name: "token", type: "address" }], outputs: [{ type: "address" }] },
  { type: "function", name: "createFor", stateMutability: "nonpayable", inputs: [{ name: "token", type: "address" }], outputs: [{ type: "address" }] },
];
const flapPortalAbi = [{ type: "function", name: "newTokenV6", stateMutability: "payable", inputs: [{ name: "params", type: "tuple", components: [
  { name: "name", type: "string" }, { name: "symbol", type: "string" }, { name: "meta", type: "string" }, { name: "dexThresh", type: "uint8" }, { name: "salt", type: "bytes32" }, { name: "migratorType", type: "uint8" }, { name: "quoteToken", type: "address" }, { name: "quoteAmt", type: "uint256" }, { name: "beneficiary", type: "address" }, { name: "permitData", type: "bytes" }, { name: "extensionID", type: "bytes32" }, { name: "extensionData", type: "bytes" }, { name: "dexId", type: "uint8" }, { name: "lpFeeProfile", type: "uint8" }, { name: "buyTaxRate", type: "uint16" }, { name: "sellTaxRate", type: "uint16" }, { name: "taxDuration", type: "uint64" }, { name: "antiFarmerDuration", type: "uint64" }, { name: "mktBps", type: "uint16" }, { name: "deflationBps", type: "uint16" }, { name: "dividendBps", type: "uint16" }, { name: "lpBps", type: "uint16" }, { name: "minimumShareBalance", type: "uint256" }, { name: "dividendToken", type: "address" }, { name: "commissionReceiver", type: "address" }, { name: "tokenVersion", type: "uint8" },
]}], outputs: [{ name: "token", type: "address" }] }];
const erc20Abi = [{ type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] }, { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }];
const fourMemeAbi = [
  { type: "function", name: "createToken", stateMutability: "payable", inputs: [{ name: "createArg", type: "bytes" }, { name: "signature", type: "bytes" }], outputs: [] },
];

function moneyBps(value) { return (Number(value) / 100).toFixed(2) + "%"; }
function shortAddress(value) { return value ? `${value.slice(0, 5)}…${value.slice(-4)}` : "Connect wallet"; }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 3600); }
function bytesToBase64(bytes) { let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); }
function base64ToBytes(value) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }

const launchHistoryKey = "anything.family.launched.v1";
function launchHistory() {
  try { const value = JSON.parse(localStorage.getItem(launchHistoryKey) || "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function renderLaunchHistory() {
  const grid = $("#launchedGrid");
  if (!grid) return;
  const history = launchHistory();
  if (!history.length) {
    grid.innerHTML = '<div class="launched-empty"><b>No launches saved yet.</b><span>Your successful launches will appear here automatically.</span></div>';
    return;
  }
  grid.innerHTML = history.map((item) => {
    const provider = providerContent[item.provider] || providerContent.stonkfun;
    const action = item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">View ↗</a>` : "<i>Confirmed</i>";
    return `<article class="launched-item"><img src="${escapeHtml(provider.logo)}" alt=""><span><b>${escapeHtml(item.name)} · $${escapeHtml(item.ticker)}</b><small>${escapeHtml(item.providerName)} · ${escapeHtml(item.network)} · ${escapeHtml(new Date(item.createdAt).toLocaleString())}</small></span>${action}</article>`;
  }).join("");
}
function recordLaunch(providerId, result) {
  try {
    const providerButton = providers.find((item) => item.dataset.provider === providerId);
    if (!providerButton) return;
    const item = { provider: providerId, providerName: providerButton.dataset.name, network: providerButton.dataset.chain, name: $("#marketName").value.trim(), ticker: $("#ticker").value.trim().toUpperCase(), url: result?.url || "", createdAt: new Date().toISOString() };
    const history = launchHistory().filter((entry) => !(item.url && entry.url === item.url));
    history.unshift(item);
    localStorage.setItem(launchHistoryKey, JSON.stringify(history.slice(0, 24)));
    renderLaunchHistory();
  } catch {}
}

async function responseJson(response, fallback) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { error: fallback || "The launch provider returned an invalid response. Please retry." }; }
}

const SAFE_IMAGE_BYTES = 1_800_000;
const SAFE_IMAGE_EDGE = 1200;

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("This browser could not prepare the token image.")), type, quality);
  });
}

function decodeImage(file) {
  return new Promise((resolve, reject) => {
    const source = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, source });
    image.onerror = () => { URL.revokeObjectURL(source); reject(new Error("Use an image your browser can open, such as PNG, JPEG, WebP, GIF, SVG or AVIF.")); };
    image.src = source;
  });
}

async function normalizeTokenImage(file) {
  if (!file || !String(file.type || "").startsWith("image/")) throw new Error("Choose an image file.");
  const decoded = await decodeImage(file);
  try {
    const sourceWidth = decoded.image.naturalWidth;
    const sourceHeight = decoded.image.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error("The selected image has no readable dimensions.");
    let scale = Math.min(1, SAFE_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
    let output;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("This browser could not prepare the token image.");
      context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
      output = await canvasBlob(canvas, "image/webp", Math.max(0.68, 0.9 - attempt * 0.035));
      if (output.size <= SAFE_IMAGE_BYTES) break;
      scale *= 0.8;
    }
    if (!output || output.size > SAFE_IMAGE_BYTES) throw new Error("The token image could not be reduced below the 2 MB provider limit.");
    return `data:image/webp;base64,${bytesToBase64(new Uint8Array(await output.arrayBuffer()))}`;
  } finally {
    URL.revokeObjectURL(decoded.source);
  }
}

function currentMultiIds() { return [...document.querySelectorAll('.multi-options input:checked')].map((input) => input.value); }
function walletRouteForProvider(providerId) { return ["stonkfun", "pumpfun", "ember"].includes(providerId) ? "solana" : providerId === "fourmeme" ? "flap" : providerId; }
function providerForWalletRoute(route) { return route === "solana" ? "pumpfun" : route; }
function selectedWalletRoutes(ids = currentMultiIds()) { return [...new Set(ids.map(walletRouteForProvider))]; }
function linkValue(providerSelector, sharedSelector) {
  return $(providerSelector).value.trim() || (launchMode === "multi" ? $(sharedSelector).value.trim() : "");
}

function renderProviderCosts(providerId = selected.dataset.provider) {
  const cost = { ...providerCosts[providerId] };
  if (providerId === "flap") cost.value = `${Number($("#flapBuyTax").value).toFixed(1)}% buy / ${Number($("#flapSellTax").value).toFixed(1)}% sell`;
  if (providerId === "ember") cost.value = moneyBps($("#emberFee").value);
  $("#providerFeeLabel").textContent = cost.label;
  $("#providerFee").textContent = cost.value;
  $("#totalFeeLabel").textContent = cost.totalLabel;
  $("#totalFee").textContent = cost.total;
  $("#platformFee").textContent = "0.00%";
  $("#feeDisclosure").textContent = cost.disclosure;
}

function captureProviderDraft(providerId = selected.dataset.provider) {
  if (!providerId) return;
  providerDrafts.set(providerId, { pair: $("#pairSelect").value });
}

function restoreProviderDraft(providerId) {
  const draft = providerDrafts.get(providerId);
  if (!draft) return;
  if ([...$("#pairSelect").options].some((option) => option.value === draft.pair)) $("#pairSelect").value = draft.pair;
}

function walletIdentity(provider, info = {}) {
  const rdns = String(info.rdns || "").toLowerCase();
  if (rdns === "io.metamask" || (provider?.isMetaMask && !provider?.isTrust && !provider?.isTrustWallet)) return { name: "MetaMask", key: "metamask", order: 1 };
  if (rdns.includes("trust") || provider?.isTrust || provider?.isTrustWallet) return { name: "Trust Wallet", key: "trust", order: 2 };
  if (rdns.includes("coinbase") || provider?.isCoinbaseWallet) return { name: "Coinbase Wallet", key: "coinbase", order: 3 };
  return { name: info.name || "Browser wallet", key: rdns || info.uuid || "browser", order: 10 };
}

window.addEventListener("eip6963:announceProvider", (event) => {
  const detail = event.detail || {};
  if (!detail.provider) return;
  const identity = walletIdentity(detail.provider, detail.info);
  announcedEvmWallets.set(detail.info?.uuid || identity.key, { provider: detail.provider, info: detail.info || {}, ...identity });
});
window.dispatchEvent(new Event("eip6963:requestProvider"));

function detectedEvmWallets() {
  const wallets = [...announcedEvmWallets.values()];
  const injected = Array.isArray(window.ethereum?.providers) ? window.ethereum.providers : window.ethereum ? [window.ethereum] : [];
  injected.forEach((provider, index) => {
    if (wallets.some((wallet) => wallet.provider === provider)) return;
    const identity = walletIdentity(provider, { uuid: `injected-${index}` });
    wallets.push({ provider, info: {}, ...identity });
  });
  const unique = [];
  wallets.sort((a, b) => a.order - b.order).forEach((wallet) => {
    if (!unique.some((item) => item.provider === wallet.provider || (item.key === wallet.key && item.name === wallet.name))) unique.push(wallet);
  });
  return unique;
}

function detectedSolanaWallets() {
  const candidates = [
    { provider: window.phantom?.solana, name: "Phantom", key: "phantom", order: 1 },
    { provider: window.solflare, name: "Solflare", key: "solflare", order: 2 },
    { provider: window.backpack, name: "Backpack", key: "backpack", order: 3 },
    { provider: window.solana, name: window.solana?.isPhantom ? "Phantom" : "Solana wallet", key: window.solana?.isPhantom ? "phantom" : "solana", order: 9 },
  ].filter((wallet) => wallet.provider);
  return candidates.filter((wallet, index) => candidates.findIndex((item) => item.provider === wallet.provider) === index);
}

function closeWalletChooser(reason = "Wallet connection cancelled.") {
  const chooser = $("#walletChooser");
  chooser.classList.remove("open"); chooser.setAttribute("aria-hidden", "true");
  if (walletChoiceResolver) { walletChoiceResolver.reject(new Error(reason)); walletChoiceResolver = null; }
}

function renderWalletOptions() {
  const { kind, preferredKey, network } = walletChooserState;
  const wallets = (kind === "solana" ? detectedSolanaWallets() : detectedEvmWallets())
    .sort((a, b) => Number(b.key === preferredKey) - Number(a.key === preferredKey) || a.order - b.order);
  const container = $("#walletOptions"); container.replaceChildren();
  wallets.forEach((wallet) => {
    const button = document.createElement("button"); button.type = "button";
    let badge;
    if (wallet.info?.icon?.startsWith("data:image/")) { badge = document.createElement("img"); badge.src = wallet.info.icon; badge.alt = ""; }
    else { badge = document.createElement("span"); badge.className = `wallet-fallback ${wallet.key}`; badge.textContent = wallet.name.slice(0, 1); }
    const label = document.createElement("span"); const name = document.createElement("b"); const detail = document.createElement("small");
    name.textContent = wallet.name; detail.textContent = wallet.key === preferredKey ? `Recommended for ${network}` : "Detected in this browser"; label.append(name, detail);
    const arrow = document.createElement("i"); arrow.textContent = "→"; button.append(badge, label, arrow);
    button.addEventListener("click", () => {
      if (!walletChoiceResolver) return;
      const resolver = walletChoiceResolver; walletChoiceResolver = null;
      $("#walletChooser").classList.remove("open"); $("#walletChooser").setAttribute("aria-hidden", "true");
      resolver.resolve(wallet);
    });
    container.append(button);
  });
  $("#walletDetection").textContent = wallets.length
    ? `${wallets.length} compatible wallet${wallets.length === 1 ? "" : "s"} detected`
    : kind === "solana" ? "No Solana wallet detected. Install Phantom, Solflare or Backpack, then refresh." : "No EVM wallet detected. Install MetaMask or Trust Wallet, then refresh.";
}

function chooseWallet({ kind, preferredKey = "", network = "" }) {
  if (kind === "evm") window.dispatchEvent(new Event("eip6963:requestProvider"));
  return new Promise((resolve, reject) => {
    walletChooserState = { kind, preferredKey, network };
    walletChoiceResolver = { resolve, reject };
    const chooser = $("#walletChooser"); chooser.classList.add("open"); chooser.setAttribute("aria-hidden", "false");
    $("#walletChooserKicker").textContent = kind === "solana" ? "Solana signer" : `${network} signer`;
    $("#walletChooserTitle").textContent = "Choose your wallet";
    $("#walletChooserCopy").textContent = kind === "solana"
      ? "Choose the Solana wallet used by the selected StonkFun, Pump.fun and Ember routes."
      : `Choose the wallet used by ${network}. ${preferredKey === "metamask" ? "MetaMask" : "Trust Wallet"} is recommended, but another compatible wallet can be selected.`;
    renderWalletOptions();
    setTimeout(renderWalletOptions, 250);
  });
}

function activateConnection(route) {
  const connection = walletConnections[route];
  if (!connection) return null;
  walletAddress = connection.address;
  walletType = connection.kind;
  evmProvider = connection.kind === "evm" ? connection.provider : null;
  evmWalletName = connection.name;
  return connection;
}

function updateWalletUi() {
  const routes = launchMode === "multi" ? selectedWalletRoutes() : [walletRouteForProvider(selected.dataset.provider)];
  const connected = routes.filter((route) => walletConnections[route]).length;
  document.querySelectorAll("[data-wallet]").forEach((button) => {
    if (launchMode === "multi" && routes.length > 1) button.textContent = connected ? `${connected}/${routes.length} wallets` : "Connect wallets";
    else button.textContent = walletConnections[routes[0]] ? shortAddress(walletConnections[routes[0]].address) : "Connect wallet";
  });
  ["solana", "pons", "flap"].forEach((route) => {
    const status = $(`#${route}SignerStatus`);
    if (!status) return;
    const connection = walletConnections[route];
    status.textContent = connection ? `${connection.name} · ${shortAddress(connection.address)}` : "Connect";
    status.closest("button").classList.toggle("connected", Boolean(connection));
  });
}

async function connectWallet(providerId = selected.dataset.provider) {
  const route = walletRouteForProvider(providerId);
  if (route === "solana") {
    const wallet = await chooseWallet({ kind: "solana", preferredKey: "phantom", network: "Solana" });
    const result = await wallet.provider.connect();
    const address = (result?.publicKey || wallet.provider.publicKey)?.toString();
    if (!address) throw new Error("The Solana wallet did not return an address.");
    walletConnections.solana = { provider: wallet.provider, address, name: wallet.name, kind: "solana" };
  } else {
    const preferredKey = route === "pons" ? "metamask" : "trust";
    const network = route === "pons" ? "Robinhood Chain" : "BNB Chain";
    const wallet = await chooseWallet({ kind: "evm", preferredKey, network });
    const accounts = await wallet.provider.request({ method: "eth_requestAccounts" });
    if (!accounts?.[0]) throw new Error(`${wallet.name} did not return an account.`);
    walletConnections[route] = { provider: wallet.provider, address: accounts[0], name: wallet.name, kind: "evm" };
  }
  const connection = activateConnection(route);
  updateWalletUi();
  showToast(`${connection.name} connected for ${route === "solana" ? "Solana" : route === "pons" ? "Pons" : "Flap"}.`);
  return connection;
}

async function activateWalletForProvider(providerId) {
  const route = walletRouteForProvider(providerId);
  return activateConnection(route) || connectWallet(providerId);
}

async function connectNextWallet() {
  if (launchMode !== "multi") return connectWallet(selected.dataset.provider);
  const ids = currentMultiIds();
  if (!ids.length) throw new Error("Select launchpads first.");
  const route = selectedWalletRoutes(ids).find((item) => !walletConnections[item]);
  if (!route) { showToast("All selected signer wallets are connected."); return activateConnection(walletRouteForProvider(selected.dataset.provider)); }
  return connectWallet(providerForWalletRoute(route));
}

async function selectProvider(button) {
  if (selected && selected !== button) captureProviderDraft();
  providers.forEach((item) => item.classList.remove("active")); button.classList.add("active"); selected = button;
  const providerId = button.dataset.provider;
  const content = providerContent[providerId];
  document.body.dataset.theme = providerId;
  $("#networkName").textContent = button.dataset.chain; $("#routeName").textContent = button.dataset.name; $("#settlement").textContent = button.dataset.chain + " settlement";
  $("#routeTone").textContent = button.dataset.tone;
  $("#routeHeadline").textContent = content.headline;
  $("#routeDescription").textContent = content.description;
  $("#heroNetwork").textContent = button.dataset.chain;
  $("#heroMechanic").textContent = content.mechanic;
  if (launchMode === "single") $("#formHint").textContent = content.hint;
  $("#sideLogo").src = content.logo;
  $("#sideLogo").alt = `${button.dataset.name} logo`;
  renderProviderCosts(providerId);
  $("#stonkOptions").hidden = button.dataset.provider !== "stonkfun";
  $("#pumpOptions").hidden = button.dataset.provider !== "pumpfun";
  $("#ponsOptions").hidden = button.dataset.provider !== "pons";
  $("#flapOptions").hidden = button.dataset.provider !== "flap";
  $("#emberOptions").hidden = button.dataset.provider !== "ember";
  $("#fourMemeOptions").hidden = button.dataset.provider !== "fourmeme";
  await Promise.all([loadQuote(), loadPairs()]);
  restoreProviderDraft(providerId);
  updateWalletUi();
}

async function loadQuote() {
  if (!apiUrl) return;
  try {
    const response = await fetch(`${apiUrl}/v1/quote?provider=${selected.dataset.provider}`); if (!response.ok) return;
    const quote = await response.json();
    $("#platformFee").textContent = moneyBps(quote.platformFeeBps || 0);
    renderProviderCosts();
  } catch {}
}

function normalizePairs(data) {
  const list = data.pairs || data.quotes || data.data?.pairs || data.data?.quotes || data.data || [];
  return Array.isArray(list) ? list.map((item) => ({
    label: item.ticker ? `${item.ticker} — ${item.symbol || item.name || "Launch pair"}` : item.displayName || item.name || item.symbol || "Pair",
    value: selected.dataset.provider === "pumpfun" ? item.ticker || item.symbol : selected.dataset.provider === "flap" ? item.address : item.quoteMint || item.mint || item.address || item.id,
    decimals: Number(item.decimals ?? 18),
  })) : [];
}
async function loadPairs() {
  const providerId = selected.dataset.provider;
  const select = $("#pairSelect"); select.disabled = true; select.innerHTML = '<option value="">Loading launch pairs…</option>';
  try {
    const response = await fetch(`${apiUrl}/v1/pairs?provider=${providerId}`); const data = await response.json(); if (!response.ok) throw new Error(data.error);
    if (selected.dataset.provider !== providerId) return;
    const pairs = normalizePairs(data);
    select.innerHTML = pairs.map((pair) => `<option value="${String(pair.value).replaceAll('"', '&quot;')}" data-decimals="${pair.decimals}">${pair.label}</option>`).join("") || '<option value="">No launch pairs available</option>';
    select.disabled = pairs.length === 0;
  } catch {
    if (selected.dataset.provider === providerId) {
      select.innerHTML = '<option value="">Provider route unavailable — refresh to retry</option>';
      select.disabled = true;
    }
  }
}

async function checkApi() {
  try {
    const [healthResponse, providersResponse] = await Promise.all([fetch(`${apiUrl}/health`), fetch(`${apiUrl}/v1/providers`)]);
    if (!healthResponse.ok || !providersResponse.ok) throw new Error();
    const providerState = await providersResponse.json();
    const ready = Array.isArray(providerState.data) && providerState.data.length >= 6 && providerState.data.every((provider) => provider.execution !== "configuration_required");
    if (!ready) throw new Error();
    $("#apiStatus").textContent = "6 launch routes online";
    $("#apiStatus").parentElement.classList.add("online");
  }
  catch { $("#apiStatus").textContent = "Interface mode"; }
}

function setLaunchMode(mode) {
  launchMode = mode;
  document.body.dataset.launchMode = mode;
  document.querySelectorAll(".mode-button").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  $("#multiPicker").hidden = mode !== "multi";
  $("#multiSharedIntro").hidden = mode !== "multi";
  $("#multiSharedDetails").hidden = mode !== "multi";
  $("#tokenDetailsTitle").textContent = mode === "multi" ? "Shared token details" : "Token details";
  $("#formHint").textContent = mode === "multi" ? "One form · up to six launches" : providerContent[selected.dataset.provider].hint;
  $("#sharedX").required = false;
  $("#sharedXLabel").textContent = "X / Twitter";
  $("#reviewButtonText").textContent = mode === "multi" ? "Review selected launches" : "Review launch";
  if (mode === "multi") updateMultiSelection();
  else updateWalletUi();
}

function updateMultiWalletRouting(ids) {
  const routes = selectedWalletRoutes(ids);
  $("#multiWalletRouting").hidden = ids.length === 0;
  document.querySelectorAll("[data-signer-route]").forEach((button) => { button.hidden = !routes.includes(button.dataset.signerRoute); });
  updateWalletUi();
}

function updateMultiSelection() {
  const checked = currentMultiIds();
  const ready = checked.length >= 1;
  const pumpSelected = checked.includes("pumpfun");
  $("#sharedX").required = pumpSelected;
  $("#sharedXLabel").textContent = pumpSelected ? "X post URL · required by Pump.fun" : "X / Twitter";
  $("#sharedX").placeholder = pumpSelected ? "https://x.com/.../status/..." : "https://x.com/...";
  $("#multiStatus").textContent = ready ? `${checked.length} launchpad${checked.length === 1 ? "" : "s"} selected · ready to launch` : "0 launchpads selected";
  $("#multiStatus").classList.toggle("ready", ready);
  $("#selectAllRails").textContent = checked.length === providers.length ? "Clear selection" : `Select all ${providers.length}`;
  updateMultiWalletRouting(checked);
}

providers.forEach((button) => button.addEventListener("click", () => selectProvider(button)));
document.querySelectorAll(".mode-button").forEach((button) => button.addEventListener("click", () => setLaunchMode(button.dataset.mode)));
document.querySelectorAll(".multi-options input").forEach((input) => input.addEventListener("change", updateMultiSelection));
$("#selectAllRails").addEventListener("click", () => {
  const inputs = [...document.querySelectorAll(".multi-options input")];
  const selectAll = inputs.some((input) => !input.checked);
  inputs.forEach((input) => { input.checked = selectAll; });
  updateMultiSelection();
});
document.querySelectorAll("[data-wallet]").forEach((button) => button.addEventListener("click", async () => { try { await connectNextWallet(); } catch (error) { showToast(readableError(error)); } }));
document.querySelectorAll("[data-connect-provider]").forEach((button) => button.addEventListener("click", async () => { try { await connectWallet(button.dataset.connectProvider); } catch (error) { showToast(readableError(error)); } }));
$("#closeWalletChooser").addEventListener("click", () => closeWalletChooser());
$("#walletChooserBackdrop").addEventListener("click", () => closeWalletChooser());
$("#emberFee").addEventListener("change", () => renderProviderCosts());
$("#flapBuyTax").addEventListener("change", () => renderProviderCosts());
$("#flapSellTax").addEventListener("change", () => renderProviderCosts());
$("#stonkMode").addEventListener("change", () => {
  const reward = $("#stonkMode").value === "reward";
  $("#stonkRewardTaxLabel").hidden = !reward;
  $("#stonkStandardFeeLabel").hidden = reward;
});
$("#stonkDevMode").addEventListener("change", () => {
  const sol = $("#stonkDevMode").value === "sol";
  $("#stonkDevLabel").textContent = sol ? "Dev buy SOL" : "Dev buy % · max 50";
  $("#stonkDevBuy").max = sol ? "" : "50";
});

$("#assetImage").addEventListener("change", async (event) => {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;
  imageData = "";
  input.disabled = true;
  $("#uploadText").innerHTML = "<b>…</b><small>Preparing</small>";
  $("#uploadText").style.display = "block";
  $("#imagePreview").style.display = "none";
  try {
    imageData = await normalizeTokenImage(file);
    $("#imagePreview").src = imageData;
    $("#imagePreview").style.display = "block";
    $("#uploadText").style.display = "none";
    showToast("Image ready for every selected launchpad.");
  } catch (error) {
    input.value = "";
    $("#uploadText").innerHTML = "<b>+</b><small>Add image</small>";
    showToast(readableError(error, "Could not prepare that image."));
  } finally {
    input.disabled = false;
  }
});

function multiReadiness(ids) {
  const issues = [];
  if (ids.length && !imageData) issues.push("add a token image");
  if (ids.includes("pumpfun") && !$("#sharedX").value.trim()) issues.push("add an X post URL in Project links for Pump.fun");
  return issues;
}

function readableError(value, fallback = "Launch failed.") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => readableError(item, "")).filter(Boolean).join(" ") || fallback;
  if (value instanceof Error) return readableError(value.message, fallback);
  if (typeof value === "object") return readableError(value.message || value.error || value.details || value.reason, fallback);
  return String(value);
}

async function uploadTokenImage(progressMessage = "Uploading your token image…") {
  if (!imageData) throw new Error("Add a token image first.");
  $("#intentMessage").textContent = progressMessage;
  const response = await fetch(`${apiUrl}/v1/metadata/image`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ logo: imageData }),
  });
  const uploaded = await response.json();
  if (!response.ok || !uploaded.url) throw new Error(readableError(uploaded, "Token image upload failed."));
  return uploaded.url;
}

function renderLaunchQueue(ids) {
  const queue = $("#launchQueue"); queue.replaceChildren();
  ids.forEach((id, index) => {
    const button = providers.find((item) => item.dataset.provider === id);
    const row = document.createElement("article"); row.dataset.queueProvider = id;
    const logo = document.createElement("img"); logo.src = providerContent[id].logo; logo.alt = "";
    const copy = document.createElement("span"); const name = document.createElement("b"); const network = document.createElement("small");
    name.textContent = button.dataset.name; network.textContent = button.dataset.chain; copy.append(name, network);
    const status = document.createElement("i"); status.textContent = `${index + 1}`; status.dataset.queueStatus = id;
    row.append(logo, copy, status); queue.append(row);
  });
}

function updateQueueStatus(id, state, detail = "") {
  const row = document.querySelector(`[data-queue-provider="${id}"]`); if (!row) return;
  row.dataset.state = state;
  const status = row.querySelector(`[data-queue-status="${id}"]`);
  status.textContent = state === "running" ? "Waiting" : state === "success" ? "Done" : state === "failed" ? "Failed" : status.textContent;
  status.title = detail;
}

$("#launchForm").addEventListener("submit", (event) => {
  event.preventDefault(); captureProviderDraft();
  launchAttemptId = window.crypto.randomUUID();
  const ticker = $("#ticker").value.trim().toUpperCase();
  $("#summaryName").textContent = $("#marketName").value.trim(); $("#summaryTicker").textContent = "$" + ticker;
  if (launchMode === "multi") {
    const launchOrder = ["stonkfun", "pumpfun", "ember", "pons", "flap", "fourmeme"];
    const ids = currentMultiIds().sort((a, b) => launchOrder.indexOf(a) - launchOrder.indexOf(b));
    if (ids.length < 1) { $("#multiStatus").textContent = "Choose at least one launchpad first."; showToast("Choose at least one launchpad."); return; }
    const issues = multiReadiness(ids);
    if (issues.length) { const message = `Before multi-launch: ${issues.join("; ")}.`; $("#multiStatus").textContent = message; showToast(message); return; }
    activeMultiIds = ids; multiResults.clear(); renderLaunchQueue(ids);
    $("#reviewTitle").textContent = ids.length === 1 ? "Review selected launch" : `Review ${ids.length} launches`;
    $("#summaryLogo").src = providerContent[ids[0]].logo; $("#summaryLogo").alt = "Selected launchpads";
    $("#summaryProvider").textContent = `${ids.length} launchpad${ids.length === 1 ? "" : "s"}`;
    $("#singleSummary").hidden = true; $("#launchQueue").hidden = false;
    $("#riskNote").textContent = "One button starts every selected launch. Each network still shows its own wallet confirmation, and completed launches cannot be reversed.";
    $("#launchNow").textContent = ids.length === 1 ? "Start selected launch" : `Start all ${ids.length} launches`;
    $("#intentMessage").textContent = `Keep this window open while ${ids.length} selected launch${ids.length === 1 ? " is" : "es are"} prepared.`;
  } else {
    $("#reviewTitle").textContent = "Review launch";
    $("#summaryLogo").src = providerContent[selected.dataset.provider].logo; $("#summaryLogo").alt = `${selected.dataset.name} logo`;
    $("#summaryProvider").textContent = selected.dataset.name; $("#summaryRoute").textContent = selected.dataset.name; $("#summaryNetwork").textContent = selected.dataset.chain;
    const launchAmount = selected.dataset.provider === "stonkfun" ? $("#stonkDevBuy").value : selected.dataset.provider === "pons" ? $("#ponsDevBuy").value : selected.dataset.provider === "flap" ? $("#flapInitialBuy").value : selected.dataset.provider === "fourmeme" ? $("#fourMemePresale").value : "0";
    $("#summaryBuy").textContent = launchAmount || "0"; $("#summaryFee").textContent = `${$("#providerFee").textContent} · Anything 0%`;
    $("#singleSummary").hidden = false; $("#launchQueue").hidden = true;
    $("#riskNote").textContent = "This creates an on-chain asset. Verify every amount and address in your wallet before signing; transactions cannot be reversed.";
    $("#launchNow").textContent = `Connect & launch on ${selected.dataset.name}`; $("#intentMessage").textContent = "Your wallet will show the final network transaction before anything is submitted.";
  }
  $("#drawer").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false");
});
function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); }
$("#closeDrawer").addEventListener("click", closeDrawer); $("#backdrop").addEventListener("click", closeDrawer);

async function launchStonk() {
  if (!imageData) throw new Error("Add a token image first.");
  const connection = await activateWalletForProvider("stonkfun");
  await ensureSolanaTools();
  const wallet = connection.provider;
  const devValue = Number($("#stonkDevBuy").value || 0);
  const body = { provider: "stonkfun", creatorWallet: walletAddress, quoteMint: $("#pairSelect").value, name: $("#marketName").value, ticker: $("#ticker").value, mode: $("#stonkMode").value, logo: imageData, feeTier: $("#stonkFeeTier").value, transferFeeBps: Number($("#stonkRewardTax").value), airdropPercent: Number($("#stonkAirdrop").value || 0), airdropTier: $("#stonkAirdropTier").value, links: { website: linkValue("#stonkWebsite", "#sharedWebsite"), x: linkValue("#stonkX", "#sharedX"), telegram: linkValue("#stonkTelegram", "#sharedTelegram") } };
  if (devValue > 0) body[$("#stonkDevMode").value === "sol" ? "devBuySol" : "devBuyPercent"] = devValue;
  const response = await fetch(`${apiUrl}/v1/launches/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const prepared = await response.json(); if (!response.ok) throw new Error(readableError(prepared, "Could not prepare launch."));
  const transaction = Transaction.from(base64ToBytes(prepared.paymentTransaction));
  const signed = await wallet.signTransaction(transaction);
  const submit = await fetch(`${apiUrl}/v1/launches/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "stonkfun", signedQuote: prepared.signedQuote, signedTransaction: bytesToBase64(signed.serialize()), logo: imageData }) });
  const result = await submit.json(); if (!submit.ok) throw new Error(readableError(result, "Launch submission failed."));
  return { message: `StonkFun launch submitted${result.paymentSignature ? ` · ${shortAddress(result.paymentSignature)}` : ""}.`, url: result.url || result.explorerUrl };
}

async function launchPump() {
  const pumpXUrl = launchMode === "multi" ? $("#sharedX").value.trim() : $("#xUrl").value.trim();
  if (!pumpXUrl || !$("#pairSelect").value) throw new Error("Pump.fun requires an X post URL and launch pair.");
  const connection = await activateWalletForProvider("pumpfun");
  const imageUrl = await uploadTokenImage("Uploading your Pump.fun token image…");
  const body = { provider: "pumpfun", idempotencyKey: `${launchAttemptId}:pumpfun`, creatorWallet: connection.address, name: $("#marketName").value, ticker: $("#ticker").value, description: $("#description").value || "Launch from Anything", imageUrl, xUrl: pumpXUrl, pairSymbol: $("#pairSelect").value, creatorFeeBps: 0, cashback: $("#pumpRewards").value === "holders", mayhemMode: $("#pumpMayhem").checked, links: { website: $("#sharedWebsite").value.trim(), x: $("#sharedX").value.trim(), telegram: $("#sharedTelegram").value.trim() } };
  const response = await fetch(`${apiUrl}/v1/launches/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(readableError(result, "Pump.fun launch failed."));
  return { message: `Pump.fun launch submitted${result.mint ? ` · ${shortAddress(result.mint)}` : ""}.`, url: result.url || result.explorerUrl };
}

async function launchPons() {
  const connection = await activateWalletForProvider("pons");
  await ensureEvmTools();
  const logo = await uploadTokenImage("Uploading your Pons token image…");
  const provider = connection.provider;
  try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1237" }] }); }
  catch (error) { if (error?.code !== 4902) throw error; await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x1237", chainName: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [RH_RPC], blockExplorerUrls: ["https://robinhoodchain.blockscout.com"] }] }); }
  const publicClient = createPublicClient({ chain: robinhoodChain, transport: http(RH_RPC) });
  const walletClient = createWalletClient({ account: walletAddress, chain: robinhoodChain, transport: custom(provider) });
  const pairToken = $("#pairSelect").value || ZERO;
  const [launchFee, count] = await Promise.all([publicClient.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "launchFee" }), publicClient.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "launchConfigCount" })]);
  let configId; for (let id = 0n; id < count; id++) { const cfg = await publicClient.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "getLaunchConfig", args: [id] }); if (cfg.enabled) { configId = id; break; } }
  if (configId === undefined) throw new Error("Pons has no enabled launch configuration.");
  if (pairToken !== ZERO && !(await publicClient.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "approvedPairTokens", args: [pairToken] }))) throw new Error("That pair token is not approved by Pons.");
  if (!(await publicClient.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "canLaunch", args: [walletAddress] }))) throw new Error("This wallet is not currently permitted by the Pons factory.");
  const economics = await publicClient.readContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "previewLaunchEconomics", args: [configId, pairToken] });
  const creatorWallet = $("#ponsCreatorWallet").value.trim() || walletAddress;
  if (!/^0x[a-fA-F0-9]{40}$/.test(creatorWallet)) throw new Error("Enter a valid Pons creator payout wallet.");
  const exemptions = $("#ponsExemptions").value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
  if (exemptions.length > 30 || exemptions.some((item) => !/^0x[a-fA-F0-9]{40}$/.test(item))) throw new Error("Use up to 30 valid EVM addresses for snipe-tax exemptions.");
  const params = { name: $("#marketName").value, symbol: $("#ticker").value.toUpperCase(), logo, description: $("#description").value, socials: { twitter: linkValue("#ponsX", "#sharedX"), telegram: linkValue("#ponsTelegram", "#sharedTelegram"), discord: "", website: linkValue("#websiteUrl", "#sharedWebsite"), farcaster: "" }, creatorFeeRecipient: creatorWallet, creatorTaxBps: Math.round(Number($("#ponsCreatorTax").value || 0) * 100), buybackEnabled: true, expectedEconomics: economics, salt: keccak256(toHex(`anything:${walletAddress}:${Date.now()}`)) };
  const devBuy = Number($("#ponsDevBuy").value || 0);
  let hash;
  if (devBuy > 0) {
    const decimals = Number($("#pairSelect").selectedOptions[0]?.dataset.decimals || 18);
    const quoteIn = parseUnits(String(devBuy), decimals);
    if (pairToken !== ZERO) {
      const allowance = await publicClient.readContract({ address: pairToken, abi: erc20Abi, functionName: "allowance", args: [walletAddress, PONS_BUY_HELPER] });
      if (allowance < quoteIn) {
        $("#intentMessage").textContent = "Approve the Pons dev-buy pair token…";
        const approval = await walletClient.writeContract({ address: pairToken, abi: erc20Abi, functionName: "approve", args: [PONS_BUY_HELPER, quoteIn] });
        await publicClient.waitForTransactionReceipt({ hash: approval });
      }
    }
    $("#intentMessage").textContent = "Quoting the atomic Pons launch and dev buy…";
    const simulation = await publicClient.simulateContract({ account: walletAddress, address: PONS_BUY_HELPER, abi: ponsBuyHelperAbi, functionName: "launchAndBuy", args: [params, configId, pairToken, quoteIn, 0n, walletAddress, exemptions], value: pairToken === ZERO ? launchFee + quoteIn : launchFee });
    const quotedOut = Array.isArray(simulation.result) ? simulation.result[2] : 0n;
    if (!quotedOut) throw new Error("Pons could not quote this dev buy.");
    const minTokensOut = quotedOut * 98n / 100n;
    hash = await walletClient.writeContract({ address: PONS_BUY_HELPER, abi: ponsBuyHelperAbi, functionName: "launchAndBuy", args: [params, configId, pairToken, quoteIn, minTokensOut, walletAddress, exemptions], value: pairToken === ZERO ? launchFee + quoteIn : launchFee });
  } else {
    hash = await walletClient.writeContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "launchToken", args: [params, configId, pairToken, exemptions], value: launchFee });
  }
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 180000 }); if (receipt.status !== "success") throw new Error("Pons transaction reverted.");
  let token = ""; for (const log of receipt.logs) { if (log.address.toLowerCase() !== PONS_FACTORY.toLowerCase()) continue; try { token = String(decodeEventLog({ abi: factoryAbi, eventName: "TokenLaunched", data: log.data, topics: log.topics }).args.token); break; } catch {} }
  if ($("#ponsHolderShare").checked) {
    if (!token) throw new Error("Pons launched, but the token address was not found for holder-sharing setup. Use the transaction link to finish on Pons.");
    $("#intentMessage").textContent = "Pons confirmation 2 of 3: deploy the holder distributor…";
    let distributor = await publicClient.readContract({ address: PONS_DISTRIBUTOR_FACTORY, abi: ponsDistributorAbi, functionName: "distributorOf", args: [token] });
    if (distributor === ZERO) {
      const deployHash = await walletClient.writeContract({ address: PONS_DISTRIBUTOR_FACTORY, abi: ponsDistributorAbi, functionName: "createFor", args: [token] });
      await publicClient.waitForTransactionReceipt({ hash: deployHash, confirmations: 1, timeout: 180000 });
      distributor = await publicClient.readContract({ address: PONS_DISTRIBUTOR_FACTORY, abi: ponsDistributorAbi, functionName: "distributorOf", args: [token] });
    }
    $("#intentMessage").textContent = "Pons confirmation 3 of 3: route creator fees to holders…";
    const routeHash = await walletClient.writeContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "transferCreatorFeeRecipient", args: [token, distributor] });
    await publicClient.waitForTransactionReceipt({ hash: routeHash, confirmations: 1, timeout: 180000 });
  }
  return { message: `Pons launch confirmed${token ? ` · ${shortAddress(token)}` : ""}.`, url: `https://robinhoodchain.blockscout.com/tx/${hash}` };
}

async function switchToBnb() {
  try { await evmProvider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] }); }
  catch (error) { if (error?.code !== 4902) throw error; await evmProvider.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x38", chainName: "BNB Smart Chain", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }, rpcUrls: [BSC_RPC], blockExplorerUrls: ["https://bscscan.com"] }] }); }
}

function findFlapSalt() {
  const bytecode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${FLAP_TAX_IMPL.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
  const predict = (salt) => getContractAddress({ from: FLAP_PORTAL, salt: toBytes(salt), bytecode, opcode: "CREATE2" });
  const seed = new Uint8Array(32); window.crypto.getRandomValues(seed);
  let salt = keccak256(seed); let address = predict(salt); let iterations = 0;
  while (!address.toLowerCase().endsWith("7777")) { salt = keccak256(salt); address = predict(salt); iterations++; if (iterations > 500000) throw new Error("Could not reserve a Flap token address. Try again."); }
  return { salt, address };
}

async function launchFlap() {
  if (!imageData) throw new Error("Add a token image first.");
  const connection = await activateWalletForProvider("flap");
  await ensureEvmTools();
  evmProvider = connection.provider;
  await switchToBnb();
  const publicClient = createPublicClient({ chain: bnbChain, transport: http(BSC_RPC) });
  const walletClient = createWalletClient({ account: walletAddress, chain: bnbChain, transport: custom(evmProvider) });
  const balance = await publicClient.getBalance({ address: walletAddress });
  const option = $("#pairSelect").selectedOptions[0];
  const quoteToken = $("#pairSelect").value || ZERO; const quoteDecimals = Number(option?.dataset.decimals || 18);
  const quoteAmt = parseUnits(String($("#flapInitialBuy").value || "0"), quoteDecimals);
  const minimumGas = parseUnits("0.01", 18);
  if (balance < minimumGas + (quoteToken === ZERO ? quoteAmt : 0n)) throw new Error("This wallet needs more BNB for launch gas and the selected initial buy.");
  $("#intentMessage").textContent = "Uploading artwork to Flap IPFS…";
  const upload = await fetch(`${apiUrl}/v1/metadata/flap`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ logo: imageData, creatorWallet: walletAddress, description: $("#description").value, website: linkValue("#flapWebsite", "#sharedWebsite"), x: linkValue("#flapX", "#sharedX"), telegram: linkValue("#flapTelegram", "#sharedTelegram") }) });
  const metadata = await upload.json(); if (!upload.ok || !metadata.cid) throw new Error(metadata.error || "Flap metadata upload failed.");
  $("#intentMessage").textContent = "Reserving a Flap 7777 token address…";
  const vanity = findFlapSalt();
  if (quoteToken !== ZERO && quoteAmt > 0n) {
    const allowance = await publicClient.readContract({ address: quoteToken, abi: erc20Abi, functionName: "allowance", args: [walletAddress, FLAP_PORTAL] });
    if (allowance < quoteAmt) { $("#intentMessage").textContent = "Approve the selected Flap quote token…"; const approval = await walletClient.writeContract({ address: quoteToken, abi: erc20Abi, functionName: "approve", args: [FLAP_PORTAL, quoteAmt] }); await publicClient.waitForTransactionReceipt({ hash: approval }); }
  }
  const allocations = ["#flapMarketing", "#flapBurn", "#flapDividend", "#flapLp"].map((id) => Number($(id).value || 0));
  if (allocations.reduce((sum, value) => sum + value, 0) !== 100) throw new Error("Flap tax allocation must total exactly 100%.");
  const params = { name: $("#marketName").value.trim(), symbol: $("#ticker").value.trim().toUpperCase(), meta: metadata.cid, dexThresh: 1, salt: vanity.salt, migratorType: 1, quoteToken, quoteAmt, beneficiary: walletAddress, permitData: "0x", extensionID: `0x${"0".repeat(64)}`, extensionData: "0x", dexId: 0, lpFeeProfile: 0, buyTaxRate: Math.round(Number($("#flapBuyTax").value) * 100), sellTaxRate: Math.round(Number($("#flapSellTax").value) * 100), taxDuration: BigInt($("#flapTaxDuration").value), antiFarmerDuration: BigInt($("#flapAntiFarmer").value), mktBps: allocations[0] * 100, deflationBps: allocations[1] * 100, dividendBps: allocations[2] * 100, lpBps: allocations[3] * 100, minimumShareBalance: 0n, dividendToken: $("#flapDividendToken").value === "self" ? MAGIC_DIVIDEND_SELF : quoteToken, commissionReceiver: $("#flapCommission").checked ? walletAddress : ZERO, tokenVersion: 6 };
  $("#intentMessage").textContent = "Confirm the Flap launch in your wallet…";
  const hash = await walletClient.writeContract({ address: FLAP_PORTAL, abi: flapPortalAbi, functionName: "newTokenV6", args: [params], value: quoteToken === ZERO ? quoteAmt : 0n });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 180000 }); if (receipt.status !== "success") throw new Error("Flap launch transaction reverted.");
  return { message: `Flap token live · ${shortAddress(vanity.address)}.`, url: `https://flap.sh/bnb/${vanity.address}` };
}

async function launchFourMeme() {
  if (!imageData) throw new Error("Add a token image first.");
  const connection = await activateWalletForProvider("fourmeme");
  await ensureEvmTools();
  evmProvider = connection.provider;
  await switchToBnb();
  const publicClient = createPublicClient({ chain: bnbChain, transport: http(BSC_RPC) });
  const walletClient = createWalletClient({ account: connection.address, chain: bnbChain, transport: custom(evmProvider) });
  $("#intentMessage").textContent = "Requesting a Four.meme wallet login…";
  const nonceResponse = await fetch(`${apiUrl}/v1/fourmeme/nonce`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountAddress: connection.address }) });
  const nonceData = await responseJson(nonceResponse, "Four.meme login returned an invalid response.");
  if (!nonceResponse.ok || !nonceData.nonce) throw new Error(readableError(nonceData, "Four.meme login could not start."));
  const loginSignature = await walletClient.signMessage({ account: connection.address, message: `You are sign in Meme ${nonceData.nonce}` });
  $("#intentMessage").textContent = "Uploading artwork and preparing Four.meme…";
  const prepareResponse = await fetch(`${apiUrl}/v1/fourmeme/prepare`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      accountAddress: connection.address, loginSignature, walletName: connection.name, logo: imageData,
      name: $("#marketName").value, ticker: $("#ticker").value, description: $("#description").value,
      label: $("#fourMemeLabel").value, preSale: $("#fourMemePresale").value,
      links: { website: linkValue("#fourMemeWebsite", "#sharedWebsite"), x: linkValue("#fourMemeX", "#sharedX"), telegram: linkValue("#fourMemeTelegram", "#sharedTelegram") },
    }),
  });
  const prepared = await responseJson(prepareResponse, "Four.meme launch preparation returned an invalid response.");
  if (!prepareResponse.ok || !prepared.createArg || !prepared.signature || !prepared.coreAddress) throw new Error(readableError(prepared, "Four.meme launch preparation failed."));
  const value = BigInt(prepared.txValue || "0");
  $("#intentMessage").textContent = "Confirm the Four.meme launch in your BNB wallet…";
  const hash = await walletClient.writeContract({ address: prepared.coreAddress, abi: fourMemeAbi, functionName: "createToken", args: [prepared.createArg, prepared.signature], value });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 180000 });
  if (receipt.status !== "success") throw new Error("Four.meme launch transaction reverted.");
  return { message: "Four.meme token launch confirmed.", url: `https://bscscan.com/tx/${hash}` };
}

async function launchEmber() {
  if (!imageData) throw new Error("Add a token image first.");
  const connection = await activateWalletForProvider("ember");
  await ensureSolanaTools();
  const wallet = connection.provider;
  $("#intentMessage").textContent = "Uploading artwork to Ember…";
  const upload = await fetch(`${apiUrl}/v1/metadata/ember`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ logo: imageData, name: $("#marketName").value.trim(), ticker: $("#ticker").value.trim().toUpperCase(), description: $("#description").value, website: linkValue("#emberWebsite", "#sharedWebsite"), x: linkValue("#emberX", "#sharedX"), telegram: linkValue("#emberTelegram", "#sharedTelegram") }) });
  const metadata = await upload.json(); if (!upload.ok || !metadata.uri) throw new Error(metadata.error || "Ember metadata upload failed.");
  const prepare = await fetch(`${apiUrl}/v1/launches/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "ember", creatorWallet: walletAddress, name: $("#marketName").value, ticker: $("#ticker").value, description: $("#description").value, uri: metadata.uri, image: metadata.image, links: { website: linkValue("#emberWebsite", "#sharedWebsite"), x: linkValue("#emberX", "#sharedX"), telegram: linkValue("#emberTelegram", "#sharedTelegram") }, quoteMint: $("#pairSelect").value, feeBps: Number($("#emberFee").value), graduateUsd: Number($("#emberGraduate").value), mode: $("#emberMode").value, payout: $("#emberPayout").value, addons: { shield: $("#emberShield").checked, volatilityFee: $("#emberVolatility").checked, airdropPct: $("#emberAirdrop").checked ? 5 : 0 } }) });
  const prepared = await prepare.json(); if (!prepare.ok) throw new Error(prepared.error || "Ember launch preparation failed.");
  const transaction = Transaction.from(base64ToBytes(prepared.transaction));
  const signed = await wallet.signTransaction(transaction);
  const submit = await fetch(`${apiUrl}/v1/launches/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "ember", launchId: prepared.launchId, signedTransaction: bytesToBase64(signed.serialize()) }) });
  const result = await submit.json(); if (!submit.ok) throw new Error(result.error || "Ember launch submission failed.");
  return { message: `Ember token live${result.mint ? ` · ${shortAddress(result.mint)}` : ""}.`, url: result.mint || result.pool ? `https://embercurve.fun/t/${result.mint || result.pool}` : undefined };
}

async function launchCurrentProvider() {
  return selected.dataset.provider === "stonkfun" ? launchStonk() : selected.dataset.provider === "pumpfun" ? launchPump() : selected.dataset.provider === "pons" ? launchPons() : selected.dataset.provider === "flap" ? launchFlap() : selected.dataset.provider === "fourmeme" ? launchFourMeme() : launchEmber();
}

async function launchProviderById(id) {
  const providerButton = providers.find((item) => item.dataset.provider === id);
  await selectProvider(providerButton);
  return launchCurrentProvider();
}

$("#launchNow").addEventListener("click", async () => {
  const button = $("#launchNow"); button.disabled = true;
  if (launchMode === "multi") {
    let successCount = [...multiResults.values()].filter((result) => result.ok).length;
    const failures = [];
    for (let index = 0; index < activeMultiIds.length; index++) {
      const id = activeMultiIds[index];
      if (multiResults.get(id)?.ok) continue;
      const providerButton = providers.find((item) => item.dataset.provider === id);
      updateQueueStatus(id, "running"); button.textContent = `Approve ${index + 1} of ${activeMultiIds.length}: ${providerButton.dataset.name}`;
      $("#intentMessage").textContent = `Preparing ${providerButton.dataset.name}. Confirm only after checking the wallet network and amount.`;
      try {
        const result = await launchProviderById(id); multiResults.set(id, { ok: true, result }); recordLaunch(id, result); successCount++; updateQueueStatus(id, "success", result.message);
      } catch (error) {
        const message = readableError(error); multiResults.set(id, { ok: false, message }); failures.push(`${providerButton.dataset.name}: ${message}`); updateQueueStatus(id, "failed", message);
      }
    }
    if (successCount === activeMultiIds.length) {
      $("#intentMessage").textContent = `All ${activeMultiIds.length} launches were submitted successfully.`; button.textContent = `${activeMultiIds.length} launches submitted`; showToast(`All ${activeMultiIds.length} launches submitted.`);
    } else {
      $("#intentMessage").textContent = `${successCount} of ${activeMultiIds.length} succeeded. ${failures.join(" ")}`;
      button.textContent = "Retry failed launches"; button.disabled = false; showToast(`${successCount} of ${activeMultiIds.length} launches succeeded.`);
    }
    return;
  }
  button.textContent = "Waiting for wallet…"; $("#intentMessage").textContent = "Do not close this window while the provider prepares your transaction.";
  try {
    const result = await launchCurrentProvider();
    recordLaunch(selected.dataset.provider, result);
    $("#intentMessage").innerHTML = result.url ? `${result.message} <a href="${result.url}" target="_blank" rel="noopener">View transaction ↗</a>` : result.message;
    button.textContent = "Launch submitted"; showToast("Launch submitted successfully.");
  } catch (error) { $("#intentMessage").textContent = readableError(error); button.textContent = "Try launch again"; button.disabled = false; }
});

renderLaunchHistory(); checkApi(); loadQuote(); loadPairs();
