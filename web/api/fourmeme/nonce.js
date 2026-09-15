const apiBase = String(process.env.FOURMEME_API_BASE || "https://four.meme/meme-api/v1").replace(/\/$/, "");

function providerError(payload, fallback) {
  if (typeof payload === "string") return payload || fallback;
  return payload?.message || payload?.msg || payload?.error || fallback;
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed." });
  const accountAddress = String(request.body?.accountAddress || "");
  if (!/^0x[a-fA-F0-9]{40}$/.test(accountAddress)) return response.status(422).json({ error: "A valid BNB wallet address is required." });
  try {
    const upstream = await fetch(`${apiBase}/private/user/nonce/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountAddress, verifyType: "LOGIN", networkCode: "BSC" }),
    });
    const payload = await upstream.json();
    if (!upstream.ok || ![0, "0"].includes(payload?.code) || !payload?.data) {
      return response.status(502).json({ error: providerError(payload, "Four.meme login could not start.") });
    }
    response.setHeader("cache-control", "no-store");
    return response.status(200).json({ nonce: payload.data });
  } catch (error) {
    return response.status(502).json({ error: error instanceof Error ? error.message : "Four.meme login could not start." });
  }
}
