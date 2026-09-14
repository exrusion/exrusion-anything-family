import { Transaction } from "https://esm.sh/@solana/web3.js@1.98.4";
import { createPublicClient, createWalletClient, custom, decodeEventLog, defineChain, getContractAddress, http, keccak256, parseUnits, toBytes, toHex } from "https://esm.sh/viem@2.37.3";

const config = window.ANYTHING_CONFIG || {};
const apiUrl = String(config.apiUrl || "").replace(/\/$/, "");
const providers = [...document.querySelectorAll(".provider")];
const $ = (selector) => document.querySelector(selector);
let selected = providers[0];
let imageData = "";
let walletAddress = "";
let walletType = "";

const providerContent = {
  stonkfun: {
    headline: "Pair a coin with the market.",
    description: "Use StonkFun’s stock, commodity and custom pairs with creator or holder rewards.",
    mechanic: "Wallet-signed API",
    hint: "Built for paired markets",
    logo: "S",
  },
  pumpfun: {
    headline: "Make the meme. Launch the coin.",
    description: "Route a culture coin through the secured Pump.fun custom-pair launch adapter.",
    mechanic: "Secured launch adapter",
    hint: "Fast meme launch",
    logo: "P",
  },
  pons: {
    headline: "Creators meet onchain markets.",
    description: "Launch a paired market on Robinhood Chain and direct creator fees to your connected wallet.",
    mechanic: "Direct factory contract",
    hint: "Creator-first market",
    logo: "P",
  },
  flap: {
    headline: "Program the token. Ship on BNB.",
    description: "Create a Flap Tax Token V3 with selectable buy and sell tax plus a live BNB or RWA pair.",
    mechanic: "BNB Portal V6",
    hint: "Programmable tax token",
    logo: "✣",
  },
  ember: {
    headline: "Send every fee somewhere useful.",
    description: "Launch on a Meteora curve and distribute the creator side to holders in the selected pair token.",
    mechanic: "Meteora DBC route",
    hint: "Fee-powered market",
    logo: "●",
  },
};

const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const ZERO = "0x0000000000000000000000000000000000000000";
const RH_RPC = "https://rpc.mainnet.chain.robinhood.com";
const FLAP_PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const FLAP_TAX_IMPL = "0x024f18294970B5c76c0691b87f138A0317156422";
const BSC_RPC = "https://bsc-dataseed.binance.org/";
const robinhoodChain = defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RH_RPC] } }, blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } } });
const bnbChain = defineChain({ id: 56, name: "BNB Smart Chain", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }, rpcUrls: { default: { http: [BSC_RPC] } }, blockExplorers: { default: { name: "BscScan", url: "https://bscscan.com" } } });
const factoryAbi = [
  { type: "function", name: "launchFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "launchConfigCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "canLaunch", stateMutability: "view", inputs: [{ name: "launcher", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "approvedPairTokens", stateMutability: "view", inputs: [{ name: "pairToken", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "previewLaunchEconomics", stateMutability: "view", inputs: [{ name: "launchConfigId", type: "uint256" }, { name: "pairToken", type: "address" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "getLaunchConfig", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "supply", type: "uint256" }, { name: "curveFeeBps", type: "uint256" }, { name: "phantomQuote", type: "uint256" }, { name: "graduationThreshold", type: "uint256" }, { name: "poolFee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "enabled", type: "bool" }] }] },
  { type: "function", name: "launchToken", stateMutability: "payable", inputs: [{ name: "params", type: "tuple", components: [{ name: "name", type: "string" }, { name: "symbol", type: "string" }, { name: "logo", type: "string" }, { name: "description", type: "string" }, { name: "socials", type: "tuple", components: [{ name: "twitter", type: "string" }, { name: "telegram", type: "string" }, { name: "discord", type: "string" }, { name: "website", type: "string" }, { name: "farcaster", type: "string" }] }, { name: "creatorFeeRecipient", type: "address" }, { name: "creatorTaxBps", type: "uint16" }, { name: "buybackEnabled", type: "bool" }, { name: "expectedEconomics", type: "bytes32" }, { name: "salt", type: "bytes32" }] }, { name: "launchConfigId", type: "uint256" }, { name: "pairToken", type: "address" }], outputs: [{ name: "token", type: "address" }, { name: "curve", type: "address" }] },
  { type: "event", name: "TokenLaunched", anonymous: false, inputs: [{ name: "token", type: "address", indexed: true }, { name: "curve", type: "address", indexed: true }, { name: "deployer", type: "address", indexed: true }, { name: "pairToken", type: "address", indexed: false }, { name: "launchConfigId", type: "uint256", indexed: false }, { name: "graduationThreshold", type: "uint256", indexed: false }] },
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

async function connectWallet() {
  if (["pons", "flap"].includes(selected.dataset.provider)) {
    if (!window.ethereum) throw new Error("Install an EVM wallet such as MetaMask.");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    walletAddress = accounts[0]; walletType = "evm";
  } else {
    const wallet = window.phantom?.solana || window.solana;
    if (!wallet?.isPhantom) throw new Error("Install Phantom to sign Solana launches.");
    const result = await wallet.connect();
    walletAddress = result.publicKey.toString(); walletType = "solana";
  }
  document.querySelectorAll("[data-wallet]").forEach((button) => { button.textContent = shortAddress(walletAddress); });
  showToast("Wallet connected.");
  return walletAddress;
}

function selectProvider(button) {
  providers.forEach((item) => item.classList.remove("active")); button.classList.add("active"); selected = button;
  const providerId = button.dataset.provider;
  const content = providerContent[providerId];
  document.body.dataset.theme = providerId;
  walletAddress = ""; walletType = ""; document.querySelectorAll("[data-wallet]").forEach((item) => { item.textContent = "Connect wallet"; });
  const providerFee = Number(button.dataset.fee);
  $("#networkName").textContent = button.dataset.chain; $("#routeName").textContent = button.dataset.name; $("#settlement").textContent = button.dataset.chain + " settlement";
  $("#routeTone").textContent = button.dataset.tone;
  $("#routeHeadline").textContent = content.headline;
  $("#routeDescription").textContent = content.description;
  $("#heroNetwork").textContent = button.dataset.chain;
  $("#heroMechanic").textContent = content.mechanic;
  $("#formHint").textContent = content.hint;
  $("#sideLogo").textContent = content.logo;
  $("#providerFee").textContent = moneyBps(providerFee); $("#totalFee").textContent = moneyBps(providerFee);
  $("#stonkOptions").hidden = button.dataset.provider !== "stonkfun";
  $("#pumpOptions").hidden = button.dataset.provider !== "pumpfun";
  $("#ponsOptions").hidden = button.dataset.provider !== "pons";
  $("#flapOptions").hidden = button.dataset.provider !== "flap";
  $("#emberOptions").hidden = button.dataset.provider !== "ember";
  $("#initialBuyLabel").querySelector("span").textContent = providerId === "stonkfun" ? "Dev buy %" : providerId === "pons" ? "Creator tax %" : providerId === "flap" ? "Initial buy" : providerId === "ember" ? "Initial buy unavailable" : "First buy unavailable";
  $("#initialBuy").removeAttribute("max");
  if (providerId === "stonkfun") $("#initialBuy").max = "50";
  $("#initialBuy").value = providerId === "pons" ? "0.75" : "0";
  $("#initialBuy").disabled = ["pumpfun", "ember"].includes(providerId);
  loadQuote(); loadPairs();
}

async function loadQuote() {
  if (!apiUrl) return;
  try {
    const response = await fetch(`${apiUrl}/v1/quote?provider=${selected.dataset.provider}`); if (!response.ok) return;
    const quote = await response.json();
    $("#providerFee").textContent = moneyBps(quote.providerFeeBps); $("#platformFee").textContent = moneyBps(quote.platformFeeBps); $("#totalFee").textContent = moneyBps(quote.totalFeeBps);
    $("#feeDisclosure").textContent = selected.dataset.provider === "flap" ? "Flap charges BNB network gas and any selected token tax; Anything currently adds 0%." : selected.dataset.provider === "ember" ? "Ember’s selected trade tax follows its live fee split; Anything currently adds 0%." : quote.platformRecipientConfigured ? "The Anything fee is shown before signing; creator proceeds follow the selected provider." : "Anything fee is currently 0% until a treasury wallet is configured. Provider fees still apply.";
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
  const select = $("#pairSelect"); select.innerHTML = '<option value="">Loading launch pairs…</option>';
  try {
    const response = await fetch(`${apiUrl}/v1/pairs?provider=${selected.dataset.provider}`); const data = await response.json(); if (!response.ok) throw new Error(data.error);
    const pairs = normalizePairs(data); select.innerHTML = pairs.map((pair) => `<option value="${String(pair.value).replaceAll('"', '&quot;')}" data-decimals="${pair.decimals}">${pair.label}</option>`).join("") || '<option value="">Default provider pair</option>';
  } catch { select.innerHTML = '<option value="">Provider default</option>'; }
}

async function checkApi() {
  try { const response = await fetch(`${apiUrl}/health`); if (!response.ok) throw new Error(); $("#apiStatus").textContent = "Launch routing online"; $("#apiStatus").parentElement.classList.add("online"); }
  catch { $("#apiStatus").textContent = "Interface mode"; }
}

providers.forEach((button) => button.addEventListener("click", () => selectProvider(button)));
document.querySelectorAll("[data-wallet]").forEach((button) => button.addEventListener("click", async () => { try { await connectWallet(); } catch (error) { showToast(error.message); } }));
$("#emberFee").addEventListener("change", (event) => { const fee = Number(event.target.value); $("#providerFee").textContent = moneyBps(fee); $("#totalFee").textContent = moneyBps(fee); selected.dataset.fee = String(fee); });

$("#assetImage").addEventListener("change", (event) => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 4_000_000) { showToast("Use an image smaller than 4 MB."); event.target.value = ""; return; }
  const reader = new FileReader(); reader.onload = () => { imageData = String(reader.result); $("#imagePreview").src = imageData; $("#imagePreview").style.display = "block"; $("#uploadText").style.display = "none"; }; reader.readAsDataURL(file);
});

$("#launchForm").addEventListener("submit", (event) => {
  event.preventDefault(); const ticker = $("#ticker").value.trim().toUpperCase();
  $("#summaryName").textContent = $("#marketName").value.trim(); $("#summaryTicker").textContent = "$" + ticker; $("#summaryIcon").textContent = ticker[0] || "A";
  $("#summaryProvider").textContent = selected.dataset.name; $("#summaryRoute").textContent = selected.dataset.name; $("#summaryNetwork").textContent = selected.dataset.chain;
  $("#summaryBuy").textContent = $("#initialBuy").value || "0"; $("#summaryFee").textContent = $("#totalFee").textContent;
  $("#launchNow").textContent = `Connect & launch on ${selected.dataset.name}`; $("#intentMessage").textContent = "Your wallet will show the final network transaction before anything is submitted.";
  $("#drawer").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false");
});
function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); }
$("#closeDrawer").addEventListener("click", closeDrawer); $("#backdrop").addEventListener("click", closeDrawer);

async function launchStonk() {
  if (!imageData) throw new Error("Add a token image first.");
  if (walletType !== "solana") await connectWallet();
  const wallet = window.phantom?.solana || window.solana;
  const response = await fetch(`${apiUrl}/v1/launches/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "stonkfun", creatorWallet: walletAddress, quoteMint: $("#pairSelect").value, name: $("#marketName").value, ticker: $("#ticker").value, mode: $("#stonkMode").value, logo: imageData, devBuyPercent: Number($("#initialBuy").value || 0) }) });
  const prepared = await response.json(); if (!response.ok) throw new Error(prepared.details?.join(" ") || prepared.error || "Could not prepare launch.");
  const transaction = Transaction.from(base64ToBytes(prepared.paymentTransaction));
  const signed = await wallet.signTransaction(transaction);
  const submit = await fetch(`${apiUrl}/v1/launches/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "stonkfun", signedQuote: prepared.signedQuote, signedTransaction: bytesToBase64(signed.serialize()), logo: imageData }) });
  const result = await submit.json(); if (!submit.ok) throw new Error(result.error || result.message || "Launch submission failed.");
  return { message: `StonkFun launch submitted${result.paymentSignature ? ` · ${shortAddress(result.paymentSignature)}` : ""}.`, url: result.url || result.explorerUrl };
}

async function launchPump() {
  const body = { provider: "pumpfun", name: $("#marketName").value, ticker: $("#ticker").value, description: $("#description").value || "Launch from Anything", imageUrl: $("#pumpImageUrl").value, xUrl: $("#xUrl").value, pairSymbol: $("#pairSelect").value, creatorFeeBps: Number($("#pumpCreatorFee").value || 0) };
  if (!body.imageUrl || !body.xUrl || !body.pairSymbol) throw new Error("Pump.fun requires an X image URL, X post URL, and launch pair.");
  const response = await fetch(`${apiUrl}/v1/launches/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || "Pump.fun launch failed.");
  return { message: `Pump.fun launch submitted${result.mint ? ` · ${shortAddress(result.mint)}` : ""}.`, url: result.url || result.explorerUrl };
}

async function launchPons() {
  if (walletType !== "evm") await connectWallet();
  const logo = $("#publicLogoUrl").value.trim(); if (!logo) throw new Error("Pons requires a public HTTPS logo URL.");
  const provider = window.ethereum;
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
  const params = { name: $("#marketName").value, symbol: $("#ticker").value.toUpperCase(), logo, description: $("#description").value, socials: { twitter: $("#xUrl").value, telegram: "", discord: "", website: $("#websiteUrl").value, farcaster: "" }, creatorFeeRecipient: walletAddress, creatorTaxBps: Math.round(Number($("#initialBuy").value || 0) * 100), buybackEnabled: true, expectedEconomics: economics, salt: keccak256(toHex(`anything:${walletAddress}:${Date.now()}`)) };
  const hash = await walletClient.writeContract({ address: PONS_FACTORY, abi: factoryAbi, functionName: "launchToken", args: [params, configId, pairToken], value: launchFee });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 180000 }); if (receipt.status !== "success") throw new Error("Pons transaction reverted.");
  let token = ""; for (const log of receipt.logs) { if (log.address.toLowerCase() !== PONS_FACTORY.toLowerCase()) continue; try { token = String(decodeEventLog({ abi: factoryAbi, eventName: "TokenLaunched", data: log.data, topics: log.topics }).args.token); break; } catch {} }
  return { message: `Pons launch confirmed${token ? ` · ${shortAddress(token)}` : ""}.`, url: `https://robinhoodchain.blockscout.com/tx/${hash}` };
}

async function switchToBnb() {
  try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] }); }
  catch (error) { if (error?.code !== 4902) throw error; await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x38", chainName: "BNB Smart Chain", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }, rpcUrls: [BSC_RPC], blockExplorerUrls: ["https://bscscan.com"] }] }); }
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
  await switchToBnb();
  const publicClient = createPublicClient({ chain: bnbChain, transport: http(BSC_RPC) });
  const walletClient = createWalletClient({ account: walletAddress, chain: bnbChain, transport: custom(window.ethereum) });
  const balance = await publicClient.getBalance({ address: walletAddress });
  const option = $("#pairSelect").selectedOptions[0];
  const quoteToken = $("#pairSelect").value || ZERO; const quoteDecimals = Number(option?.dataset.decimals || 18);
  const quoteAmt = parseUnits(String($("#initialBuy").value || "0"), quoteDecimals);
  const minimumGas = parseUnits("0.01", 18);
  if (balance < minimumGas + (quoteToken === ZERO ? quoteAmt : 0n)) throw new Error("This wallet needs more BNB for launch gas and the selected initial buy.");
  $("#intentMessage").textContent = "Uploading artwork to Flap IPFS…";
  const upload = await fetch(`${apiUrl}/v1/metadata/flap`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ logo: imageData, creatorWallet: walletAddress, description: $("#description").value, website: $("#flapWebsite").value || "", x: $("#flapX").value || "" }) });
  const metadata = await upload.json(); if (!upload.ok || !metadata.cid) throw new Error(metadata.error || "Flap metadata upload failed.");
  $("#intentMessage").textContent = "Reserving a Flap 7777 token address…";
  const vanity = findFlapSalt();
  if (quoteToken !== ZERO && quoteAmt > 0n) {
    const allowance = await publicClient.readContract({ address: quoteToken, abi: erc20Abi, functionName: "allowance", args: [walletAddress, FLAP_PORTAL] });
    if (allowance < quoteAmt) { $("#intentMessage").textContent = "Approve the selected Flap quote token…"; const approval = await walletClient.writeContract({ address: quoteToken, abi: erc20Abi, functionName: "approve", args: [FLAP_PORTAL, quoteAmt] }); await publicClient.waitForTransactionReceipt({ hash: approval }); }
  }
  const params = { name: $("#marketName").value.trim(), symbol: $("#ticker").value.trim().toUpperCase(), meta: metadata.cid, dexThresh: 1, salt: vanity.salt, migratorType: 1, quoteToken, quoteAmt, beneficiary: walletAddress, permitData: "0x", extensionID: `0x${"0".repeat(64)}`, extensionData: "0x", dexId: 0, lpFeeProfile: 0, buyTaxRate: Number($("#flapBuyTax").value), sellTaxRate: Number($("#flapSellTax").value), taxDuration: 31536000n, antiFarmerDuration: 259200n, mktBps: 10000, deflationBps: 0, dividendBps: 0, lpBps: 0, minimumShareBalance: 0n, dividendToken: ZERO, commissionReceiver: ZERO, tokenVersion: 6 };
  $("#intentMessage").textContent = "Confirm the Flap launch in your wallet…";
  const hash = await walletClient.writeContract({ address: FLAP_PORTAL, abi: flapPortalAbi, functionName: "newTokenV6", args: [params], value: quoteToken === ZERO ? quoteAmt : 0n });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 180000 }); if (receipt.status !== "success") throw new Error("Flap launch transaction reverted.");
  return { message: `Flap token live · ${shortAddress(vanity.address)}.`, url: `https://flap.sh/bnb/${vanity.address}` };
}

async function launchEmber() {
  if (!imageData) throw new Error("Add a token image first.");
  if (walletType !== "solana") await connectWallet();
  const wallet = window.phantom?.solana || window.solana;
  $("#intentMessage").textContent = "Uploading artwork to Ember…";
  const upload = await fetch(`${apiUrl}/v1/metadata/ember`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ logo: imageData, name: $("#marketName").value.trim(), ticker: $("#ticker").value.trim().toUpperCase(), description: $("#description").value, website: $("#emberWebsite").value || "", x: $("#emberX").value || "" }) });
  const metadata = await upload.json(); if (!upload.ok || !metadata.uri) throw new Error(metadata.error || "Ember metadata upload failed.");
  const prepare = await fetch(`${apiUrl}/v1/launches/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "ember", creatorWallet: walletAddress, name: $("#marketName").value, ticker: $("#ticker").value, description: $("#description").value, uri: metadata.uri, image: metadata.image, links: { website: $("#emberWebsite").value || "", x: $("#emberX").value || "", telegram: "" }, quoteMint: $("#pairSelect").value, feeBps: Number($("#emberFee").value), graduateUsd: Number($("#emberGraduate").value) }) });
  const prepared = await prepare.json(); if (!prepare.ok) throw new Error(prepared.error || "Ember launch preparation failed.");
  const transaction = Transaction.from(base64ToBytes(prepared.transaction));
  const signed = await wallet.signTransaction(transaction);
  const submit = await fetch(`${apiUrl}/v1/launches/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "ember", launchId: prepared.launchId, signedTransaction: bytesToBase64(signed.serialize()) }) });
  const result = await submit.json(); if (!submit.ok) throw new Error(result.error || "Ember launch submission failed.");
  return { message: `Ember token live${result.mint ? ` · ${shortAddress(result.mint)}` : ""}.`, url: result.mint || result.pool ? `https://embercurve.fun/t/${result.mint || result.pool}` : undefined };
}

$("#launchNow").addEventListener("click", async () => {
  const button = $("#launchNow"); button.disabled = true; button.textContent = "Waiting for wallet…"; $("#intentMessage").textContent = "Do not close this window while the provider prepares your transaction.";
  try {
    const result = selected.dataset.provider === "stonkfun" ? await launchStonk() : selected.dataset.provider === "pumpfun" ? await launchPump() : selected.dataset.provider === "pons" ? await launchPons() : selected.dataset.provider === "flap" ? await launchFlap() : await launchEmber();
    $("#intentMessage").innerHTML = result.url ? `${result.message} <a href="${result.url}" target="_blank" rel="noopener">View transaction ↗</a>` : result.message;
    button.textContent = "Launch submitted"; showToast("Launch submitted successfully.");
  } catch (error) { $("#intentMessage").textContent = error.message || "Launch failed."; button.textContent = "Try launch again"; button.disabled = false; }
});

checkApi(); loadQuote(); loadPairs();
