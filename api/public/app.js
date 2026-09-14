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
let launchMode = "single";
let activeMultiIds = [];
let launchAttemptId = "";
const providerDrafts = new Map();
const multiResults = new Map();
const announcedEvmWallets = new Map();
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
};

const providerCosts = {
  stonkfun: { label: "Default trade fee", value: "1.00%", totalLabel: "Launch charge", total: "Live quote", disclosure: "StonkFun receives its trading and quoted launch costs. Anything takes no cut." },
  pumpfun: { label: "Bonding curve trade fee", value: "1.25%", totalLabel: "Token creation", total: "No creation fee", disclosure: "Pump.fun receives its trading fees. Network costs may apply; Anything takes no cut." },
  pons: { label: "Launchpad launch fee", value: "0.0005 ETH", totalLabel: "Network cost", total: "Plus gas", disclosure: "Pons receives its launch and trading fees. Anything takes no cut." },
  flap: { label: "Selected token tax", value: "3% buy / 10% sell", totalLabel: "Launch cost", total: "Initial buy + gas", disclosure: "Flap’s selected token taxes and BNB network costs apply. Anything takes no cut." },
  ember: { label: "Selected trade tax", value: "2.00%", totalLabel: "Launch charge", total: "Provider quote", disclosure: "Ember applies its selected trade-tax split and network costs. Anything takes no cut." },
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

function moneyBps(value) { return (Number(value) / 100).toFixed(2) + "%"; }
function shortAddress(value) { return value ? `${value.slice(0, 5)}…${value.slice(-4)}` : "Connect wallet"; }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 3600); }
function bytesToBase64(bytes) { let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); }
function base64ToBytes(value) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }

function currentMultiIds() { return [...document.querySelectorAll('.multi-options input:checked')].map((input) => input.value); }

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

function closeWalletChooser(reason = "Wallet connection cancelled.") {
  const chooser = $("#walletChooser");
  chooser.classList.remove("open"); chooser.setAttribute("aria-hidden", "true");
  if (walletChoiceResolver) { walletChoiceResolver.reject(new Error(reason)); walletChoiceResolver = null; }
}

function renderWalletOptions() {
  const wallets = detectedEvmWallets();
  const container = $("#walletOptions"); container.replaceChildren();
  wallets.forEach((wallet) => {
    const button = document.createElement("button"); button.type = "button";
    let badge;
    if (wallet.info?.icon?.startsWith("data:image/")) { badge = document.createElement("img"); badge.src = wallet.info.icon; badge.alt = ""; }
    else { badge = document.createElement("span"); badge.className = `wallet-fallback ${wallet.key}`; badge.textContent = wallet.name.slice(0, 1); }
    const label = document.createElement("span"); const name = document.createElement("b"); const detail = document.createElement("small");
    name.textContent = wallet.name; detail.textContent = "Detected in this browser"; label.append(name, detail);
    const arrow = document.createElement("i"); arrow.textContent = "→"; button.append(badge, label, arrow);
    button.addEventListener("click", () => {
      if (!walletChoiceResolver) return;
      const resolver = walletChoiceResolver; walletChoiceResolver = null;
      $("#walletChooser").classList.remove("open"); $("#walletChooser").setAttribute("aria-hidden", "true");
      resolver.resolve(wallet);
    });
    container.append(button);
  });
  $("#walletDetection").textContent = wallets.length ? `${wallets.length} wallet${wallets.length === 1 ? "" : "s"} detected` : "No EVM wallet detected. Install MetaMask or Trust Wallet, then refresh.";
}

function chooseEvmWallet() {
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  return new Promise((resolve, reject) => {
    walletChoiceResolver = { resolve, reject };
    const chooser = $("#walletChooser"); chooser.classList.add("open"); chooser.setAttribute("aria-hidden", "false");
    renderWalletOptions();
    setTimeout(renderWalletOptions, 250);
  });
}

async function connectWallet() {
  if (["pons", "flap"].includes(selected.dataset.provider)) {
    const wallet = await chooseEvmWallet();
    evmProvider = wallet.provider; evmWalletName = wallet.name;
    const accounts = await evmProvider.request({ method: "eth_requestAccounts" });
    walletAddress = accounts[0]; walletType = "evm";
  } else {
    const wallet = window.phantom?.solana || window.solana;
    if (!wallet?.isPhantom) throw new Error("Install Phantom to sign Solana launches.");
    const result = await wallet.connect();
    walletAddress = result.publicKey.toString(); walletType = "solana";
  }
  document.querySelectorAll("[data-wallet]").forEach((button) => { button.textContent = shortAddress(walletAddress); });
  showToast(`${evmWalletName || "Wallet"} connected.`);
  return walletAddress;
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
  $("#formHint").textContent = content.hint;
  $("#sideLogo").src = content.logo;
  $("#sideLogo").alt = `${button.dataset.name} logo`;
  renderProviderCosts(providerId);
  $("#stonkOptions").hidden = button.dataset.provider !== "stonkfun";
  $("#pumpOptions").hidden = button.dataset.provider !== "pumpfun";
  $("#ponsOptions").hidden = button.dataset.provider !== "pons";
  $("#flapOptions").hidden = button.dataset.provider !== "flap";
  $("#emberOptions").hidden = button.dataset.provider !== "ember";
  await Promise.all([loadQuote(), loadPairs()]);
  restoreProviderDraft(providerId);
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
    const ready = Array.isArray(providerState.data) && providerState.data.length === 5 && providerState.data.every((provider) => provider.execution !== "configuration_required");
    if (!ready) throw new Error();
    $("#apiStatus").textContent = "5 launch routes online";
    $("#apiStatus").parentElement.classList.add("online");
  }
  catch { $("#apiStatus").textContent = "Interface mode"; }
}

function setLaunchMode(mode) {
  launchMode = mode;
  document.querySelectorAll(".mode-button").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  $("#multiPicker").hidden = mode !== "multi";
  $("#reviewButtonText").textContent = mode === "multi" ? "Review multi-launch" : "Review launch";
  if (mode === "multi") updateMultiSelection();
}

function updateMultiSelection() {
  const checked = currentMultiIds();
  document.querySelectorAll(".multi-options input").forEach((input) => { input.disabled = checked.length >= 4 && !input.checked; });
  $("#multiStatus").textContent = checked.length === 4 ? "4 of 4 selected · ready to review" : `${checked.length} of 4 selected`;
  $("#multiStatus").classList.toggle("ready", checked.length === 4);
}

providers.forEach((button) => button.addEventListener("click", () => selectProvider(button)));
document.querySelectorAll(".mode-button").forEach((button) => button.addEventListener("click", () => setLaunchMode(button.dataset.mode)));
document.querySelectorAll(".multi-options input").forEach((input) => input.addEventListener("change", updateMultiSelection));
document.querySelectorAll("[data-wallet]").forEach((button) => button.addEventListener("click", async () => { try { await connectWallet(); } catch (error) { showToast(error.message); } }));
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

$("#assetImage").addEventListener("change", (event) => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 4_000_000) { showToast("Use an image smaller than 4 MB."); event.target.value = ""; return; }
  const reader = new FileReader(); reader.onload = () => { imageData = String(reader.result); $("#imagePreview").src = imageData; $("#imagePreview").style.display = "block"; $("#uploadText").style.display = "none"; }; reader.readAsDataURL(file);
});

function multiReadiness(ids) {
  const issues = [];
  if (ids.length && !imageData) issues.push("add a token image");
  if (ids.includes("pumpfun") && !$("#xUrl").value.trim()) issues.push("add Pump.fun’s X post URL");
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
    const ids = currentMultiIds().sort((a, b) => (["stonkfun", "pumpfun", "ember"].includes(a) ? 0 : 1) - (["stonkfun", "pumpfun", "ember"].includes(b) ? 0 : 1));
    if (ids.length !== 4) { $("#multiStatus").textContent = "Select exactly four launchpads first."; showToast("Choose exactly four launchpads."); return; }
    const issues = multiReadiness(ids);
    if (issues.length) { const message = `Before multi-launch: ${issues.join("; ")}.`; $("#multiStatus").textContent = message; showToast(message); return; }
    activeMultiIds = ids; multiResults.clear(); renderLaunchQueue(ids);
    $("#reviewTitle").textContent = "Review 4 launches";
    $("#summaryLogo").src = providerContent[ids[0]].logo; $("#summaryLogo").alt = "Selected launchpads";
    $("#summaryProvider").textContent = "4 launchpads";
    $("#singleSummary").hidden = true; $("#launchQueue").hidden = false;
    $("#riskNote").textContent = "One button starts the queue, but every network still asks for its own wallet approval. Successful launches cannot be rolled back if another rail fails.";
    $("#launchNow").textContent = "Start 4-launch sequence";
    $("#intentMessage").textContent = "Keep this window open while the four provider transactions are prepared.";
  } else {
    $("#reviewTitle").textContent = "Review launch";
    $("#summaryLogo").src = providerContent[selected.dataset.provider].logo; $("#summaryLogo").alt = `${selected.dataset.name} logo`;
    $("#summaryProvider").textContent = selected.dataset.name; $("#summaryRoute").textContent = selected.dataset.name; $("#summaryNetwork").textContent = selected.dataset.chain;
    const launchAmount = selected.dataset.provider === "stonkfun" ? $("#stonkDevBuy").value : selected.dataset.provider === "pons" ? $("#ponsDevBuy").value : selected.dataset.provider === "flap" ? $("#flapInitialBuy").value : "0";
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
  if (walletType !== "solana") await connectWallet();
  await ensureSolanaTools();
  const wallet = window.phantom?.solana || window.solana;
  const devValue = Number($("#stonkDevBuy").value || 0);
  const body = { provider: "stonkfun", creatorWallet: walletAddress, quoteMint: $("#pairSelect").value, name: $("#marketName").value, ticker: $("#ticker").value, mode: $("#stonkMode").value, logo: imageData, feeTier: $("#stonkFeeTier").value, transferFeeBps: Number($("#stonkRewardTax").value), airdropPercent: Number($("#stonkAirdrop").value || 0), airdropTier: $("#stonkAirdropTier").value, links: { website: $("#stonkWebsite").value, x: $("#stonkX").value, telegram: $("#stonkTelegram").value } };
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
  if (!$("#xUrl").value.trim() || !$("#pairSelect").value) throw new Error("Pump.fun requires an X post URL and launch pair.");
  const imageUrl = await uploadTokenImage("Uploading your Pump.fun token image…");
  const body = { provider: "pumpfun", idempotencyKey: `${launchAttemptId}:pumpfun`, name: $("#marketName").value, ticker: $("#ticker").value, description: $("#description").value || "Launch from Anything", imageUrl, xUrl: $("#xUrl").value.trim(), pairSymbol: $("#pairSelect").value, creatorFeeBps: 0, cashback: $("#pumpRewards").value === "holders", mayhemMode: $("#pumpMayhem").checked };
  const response = await fetch(`${apiUrl}/v1/launches/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(readableError(result, "Pump.fun launch failed."));
  return { message: `Pump.fun launch submitted${result.mint ? ` · ${shortAddress(result.mint)}` : ""}.`, url: result.url || result.explorerUrl };
}

async function launchPons() {
  if (walletType !== "evm") await connectWallet();
  await ensureEvmTools();
  const logo = await uploadTokenImage("Uploading your Pons token image…");
  const provider = evmProvider;
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
  const params = { name: $("#marketName").value, symbol: $("#ticker").value.toUpperCase(), logo, description: $("#description").value, socials: { twitter: $("#ponsX").value, telegram: $("#ponsTelegram").value, discord: "", website: $("#websiteUrl").value, farcaster: "" }, creatorFeeRecipient: creatorWallet, creatorTaxBps: Math.round(Number($("#ponsCreatorTax").value || 0) * 100), buybackEnabled: true, expectedEconomics: economics, salt: keccak256(toHex(`anything:${walletAddress}:${Date.now()}`)) };
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
  if (walletType !== "evm") await connectWallet();
  await ensureEvmTools();
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
  const upload = await fetch(`${apiUrl}/v1/metadata/flap`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ logo: imageData, creatorWallet: walletAddress, description: $("#description").value, website: $("#flapWebsite").value || "", x: $("#flapX").value || "", telegram: $("#flapTelegram").value || "" }) });
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

async function launchEmber() {
  if (!imageData) throw new Error("Add a token image first.");
  if (walletType !== "solana") await connectWallet();
  await ensureSolanaTools();
  const wallet = window.phantom?.solana || window.solana;
  $("#intentMessage").textContent = "Uploading artwork to Ember…";
  const upload = await fetch(`${apiUrl}/v1/metadata/ember`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ logo: imageData, name: $("#marketName").value.trim(), ticker: $("#ticker").value.trim().toUpperCase(), description: $("#description").value, website: $("#emberWebsite").value || "", x: $("#emberX").value || "", telegram: $("#emberTelegram").value || "" }) });
  const metadata = await upload.json(); if (!upload.ok || !metadata.uri) throw new Error(metadata.error || "Ember metadata upload failed.");
  const prepare = await fetch(`${apiUrl}/v1/launches/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "ember", creatorWallet: walletAddress, name: $("#marketName").value, ticker: $("#ticker").value, description: $("#description").value, uri: metadata.uri, image: metadata.image, links: { website: $("#emberWebsite").value || "", x: $("#emberX").value || "", telegram: $("#emberTelegram").value || "" }, quoteMint: $("#pairSelect").value, feeBps: Number($("#emberFee").value), graduateUsd: Number($("#emberGraduate").value), mode: $("#emberMode").value, payout: $("#emberPayout").value, addons: { shield: $("#emberShield").checked, volatilityFee: $("#emberVolatility").checked, airdropPct: $("#emberAirdrop").checked ? 5 : 0 } }) });
  const prepared = await prepare.json(); if (!prepare.ok) throw new Error(prepared.error || "Ember launch preparation failed.");
  const transaction = Transaction.from(base64ToBytes(prepared.transaction));
  const signed = await wallet.signTransaction(transaction);
  const submit = await fetch(`${apiUrl}/v1/launches/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "ember", launchId: prepared.launchId, signedTransaction: bytesToBase64(signed.serialize()) }) });
  const result = await submit.json(); if (!submit.ok) throw new Error(result.error || "Ember launch submission failed.");
  return { message: `Ember token live${result.mint ? ` · ${shortAddress(result.mint)}` : ""}.`, url: result.mint || result.pool ? `https://embercurve.fun/t/${result.mint || result.pool}` : undefined };
}

async function launchCurrentProvider() {
  return selected.dataset.provider === "stonkfun" ? launchStonk() : selected.dataset.provider === "pumpfun" ? launchPump() : selected.dataset.provider === "pons" ? launchPons() : selected.dataset.provider === "flap" ? launchFlap() : launchEmber();
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
        const result = await launchProviderById(id); multiResults.set(id, { ok: true, result }); successCount++; updateQueueStatus(id, "success", result.message);
      } catch (error) {
        const message = readableError(error); multiResults.set(id, { ok: false, message }); failures.push(`${providerButton.dataset.name}: ${message}`); updateQueueStatus(id, "failed", message);
      }
    }
    if (successCount === activeMultiIds.length) {
      $("#intentMessage").textContent = "All four launches were submitted successfully."; button.textContent = "4 launches submitted"; showToast("All four launches submitted.");
    } else {
      $("#intentMessage").textContent = `${successCount} of ${activeMultiIds.length} succeeded. ${failures.join(" ")}`;
      button.textContent = "Retry failed launches"; button.disabled = false; showToast(`${successCount} of ${activeMultiIds.length} launches succeeded.`);
    }
    return;
  }
  button.textContent = "Waiting for wallet…"; $("#intentMessage").textContent = "Do not close this window while the provider prepares your transaction.";
  try {
    const result = await launchCurrentProvider();
    $("#intentMessage").innerHTML = result.url ? `${result.message} <a href="${result.url}" target="_blank" rel="noopener">View transaction ↗</a>` : result.message;
    button.textContent = "Launch submitted"; showToast("Launch submitted successfully.");
  } catch (error) { $("#intentMessage").textContent = readableError(error); button.textContent = "Try launch again"; button.disabled = false; }
});

checkApi(); loadQuote(); loadPairs();
