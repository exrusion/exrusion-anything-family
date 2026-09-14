const config = window.ANYTHING_CONFIG || {};
const apiUrl = String(config.apiUrl || "").replace(/\/$/, "");
const providers = [...document.querySelectorAll(".provider")];
let selected = providers[0];
const $ = (selector) => document.querySelector(selector);

function moneyBps(value) {
  return (Number(value) / 100).toFixed(2) + "%";
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function selectProvider(button) {
  providers.forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  selected = button;
  const providerFee = Number(button.dataset.fee);
  $("#networkName").textContent = button.dataset.chain;
  $("#routeName").textContent = button.dataset.name + " selected";
  $("#settlement").textContent = button.dataset.chain + " settlement";
  $("#providerFee").textContent = moneyBps(providerFee);
  $("#totalFee").textContent = moneyBps(providerFee + 75);
  loadQuote();
}

async function loadQuote() {
  if (!apiUrl) return;
  try {
    const response = await fetch(`${apiUrl}/v1/quote?provider=${selected.dataset.provider}`);
    if (!response.ok) return;
    const quote = await response.json();
    $("#providerFee").textContent = moneyBps(quote.providerFeeBps);
    $("#platformFee").textContent = moneyBps(quote.platformFeeBps);
    $("#totalFee").textContent = moneyBps(quote.totalFeeBps);
    selected.dataset.fee = String(quote.providerFeeBps);
  } catch {}
}

async function checkApi() {
  const status = $("#apiStatus");
  if (!apiUrl) {
    status.textContent = "Interface mode";
    return;
  }
  try {
    const response = await fetch(`${apiUrl}/health`);
    if (!response.ok) throw new Error();
    const health = await response.json();
    status.textContent = health.executionMode === "live" ? "Live execution" : "Intent routing online";
    status.parentElement.classList.add("online");
  } catch {
    status.textContent = "Interface mode";
  }
}

providers.forEach((button) => button.addEventListener("click", () => selectProvider(button)));

$("#assetImage").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const image = $("#imagePreview");
  image.src = URL.createObjectURL(file);
  image.style.display = "block";
  $("#uploadText").style.display = "none";
});

$("#launchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const ticker = $("#ticker").value.trim().toUpperCase();
  $("#summaryName").textContent = $("#marketName").value.trim();
  $("#summaryTicker").textContent = "$" + ticker;
  $("#summaryIcon").textContent = ticker[0] || "A";
  $("#summaryProvider").textContent = selected.dataset.name;
  $("#summaryRoute").textContent = selected.dataset.name;
  $("#summaryNetwork").textContent = selected.dataset.chain;
  $("#summaryBuy").textContent = $("#initialBuy").value || "0";
  $("#summaryFee").textContent = $("#totalFee").textContent;
  $("#drawer").classList.add("open");
  $("#drawer").setAttribute("aria-hidden", "false");
});

function closeDrawer() {
  $("#drawer").classList.remove("open");
  $("#drawer").setAttribute("aria-hidden", "true");
}

$("#closeDrawer").addEventListener("click", closeDrawer);
$("#backdrop").addEventListener("click", closeDrawer);
document.querySelectorAll("[data-wallet]").forEach((button) => button.addEventListener("click", () => showToast("Wallet connectors are added after provider adapters are verified.")));

$("#createIntent").addEventListener("click", async () => {
  const button = $("#createIntent");
  button.disabled = true;
  button.textContent = "Creating intent…";
  try {
    const response = await fetch(`${apiUrl}/v1/launch-intents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: selected.dataset.provider,
        name: $("#marketName").value,
        ticker: $("#ticker").value,
        description: $("#description").value,
        initialBuy: Number($("#initialBuy").value || 0),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.details?.join(" ") || result.error);
    $("#intentMessage").textContent = `Intent ${result.data.id} created. Verified adapter configuration is required before signing.`;
    button.textContent = "Intent created";
    showToast("Launch intent created safely.");
  } catch (error) {
    $("#intentMessage").textContent = error.message || "Could not create launch intent.";
    button.textContent = "Try again";
    button.disabled = false;
  }
});

checkApi();
loadQuote();

