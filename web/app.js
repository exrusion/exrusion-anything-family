import { Transaction } from "https://esm.sh/@solana/web3.js@1.98.4";
import { createPublicClient, createWalletClient, custom, decodeEventLog, defineChain, http, keccak256, toHex } from "https://esm.sh/viem@2.37.3";

const config = window.ANYTHING_CONFIG || {};
const apiUrl = String(config.apiUrl || "").replace(/\/$/, "");
const providers = [...document.querySelectorAll(".provider")];
const $ = (selector) => document.querySelector(selector);
let selected = providers[0];
let imageData = "";
let walletAddress = "";
let walletType = "";

const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const ZERO = "0x0000000000000000000000000000000000000000";
const RH_RPC = "https://rpc.mainnet.chain.robinhood.com";
const robinhoodChain = defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RH_RPC] } }, blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } } });
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

function moneyBps(value) { return (Number(value) / 100).toFixed(2) + "%"; }
function shortAddress(value) { return value ? `${value.slice(0, 5)}…${value.slice(-4)}` : "Connect wallet"; }
function showToast(message) { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 3600); }
function bytesToBase64(bytes) { let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); }
function base64ToBytes(value) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }

async function connectWallet() {
  if (selected.dataset.provider === "pons") {
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
  walletAddress = ""; walletType = ""; document.querySelectorAll("[data-wallet]").forEach((item) => { item.textContent = "Connect wallet"; });
  const providerFee = Number(button.dataset.fee);
  $("#networkName").textContent = button.dataset.chain; $("#routeName").textContent = button.dataset.name + " selected"; $("#settlement").textContent = button.dataset.chain + " settlement";
  $("#providerFee").textContent = moneyBps(providerFee); $("#totalFee").textContent = moneyBps(providerFee);
  $("#stonkOptions").hidden = button.dataset.provider !== "stonkfun";
  $("#pumpOptions").hidden = button.dataset.provider !== "pumpfun";
  $("#ponsOptions").hidden = button.dataset.provider !== "pons";
  $("#initialBuyLabel").querySelector("span").textContent = button.dataset.provider === "stonkfun" ? "Dev buy %" : button.dataset.provider === "pons" ? "Creator tax %" : "First buy";
  $("#initialBuy").value = button.dataset.provider === "stonkfun" ? "0" : button.dataset.provider === "pons" ? "0.75" : "0";
  loadQuote(); loadPairs();
}

async function loadQuote() {
  if (!apiUrl) return;
  try {
    const response = await fetch(`${apiUrl}/v1/quote?provider=${selected.dataset.provider}`); if (!response.ok) return;
    const quote = await response.json();
    $("#providerFee").textContent = moneyBps(quote.providerFeeBps); $("#platformFee").textContent = moneyBps(quote.platformFeeBps); $("#totalFee").textContent = moneyBps(quote.totalFeeBps);
    $("#feeDisclosure").textContent = quote.platformRecipientConfigured ? "The Anything fee is shown before signing; creator proceeds follow the selected provider." : "Anything fee is currently 0% until a treasury wallet is configured. Provider fees still apply.";
  } catch {}
}

function normalizePairs(data) {
  const list = data.pairs || data.data || [];
  return Array.isArray(list) ? list.map((item) => ({
    label: item.ticker ? `${item.ticker} — ${item.symbol || item.name || "Launch pair"}` : item.displayName || item.name || item.symbol || "Pair",
    value: selected.dataset.provider === "pumpfun" ? item.ticker || item.symbol : item.quoteMint || item.mint || item.address || item.id,
  })) : [];
}
async function loadPairs() {
  const select = $("#pairSelect"); select.innerHTML = '<option value="">Loading launch pairs…</option>';
  try {
    const response = await fetch(`${apiUrl}/v1/pairs?provider=${selected.dataset.provider}`); const data = await response.json(); if (!response.ok) throw new Error(data.error);
    const pairs = normalizePairs(data); select.innerHTML = pairs.map((pair) => `<option value="${String(pair.value).replaceAll('"', '&quot;')}">${pair.label}</option>`).join("") || '<option value="">Default provider pair</option>';
  } catch { select.innerHTML = '<option value="">Provider default</option>'; }
}

async function checkApi() {
  try { const response = await fetch(`${apiUrl}/health`); if (!response.ok) throw new Error(); $("#apiStatus").textContent = "Launch routing online"; $("#apiStatus").parentElement.classList.add("online"); }
  catch { $("#apiStatus").textContent = "Interface mode"; }
}

providers.forEach((button) => button.addEventListener("click", () => selectProvider(button)));
document.querySelectorAll("[data-wallet]").forEach((button) => button.addEventListener("click", async () => { try { await connectWallet(); } catch (error) { showToast(error.message); } }));

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

$("#launchNow").addEventListener("click", async () => {
  const button = $("#launchNow"); button.disabled = true; button.textContent = "Waiting for wallet…"; $("#intentMessage").textContent = "Do not close this window while the provider prepares your transaction.";
  try {
    const result = selected.dataset.provider === "stonkfun" ? await launchStonk() : selected.dataset.provider === "pumpfun" ? await launchPump() : await launchPons();
    $("#intentMessage").innerHTML = result.url ? `${result.message} <a href="${result.url}" target="_blank" rel="noopener">View transaction ↗</a>` : result.message;
    button.textContent = "Launch submitted"; showToast("Launch submitted successfully.");
  } catch (error) { $("#intentMessage").textContent = error.message || "Launch failed."; button.textContent = "Try launch again"; button.disabled = false; }
});

checkApi(); loadQuote(); loadPairs();
