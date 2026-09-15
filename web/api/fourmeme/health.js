module.exports = function handler(_request, response) {
  response.setHeader("cache-control", "public, max-age=30, stale-while-revalidate=60");
  return response.status(200).json({ ok: true, provider: "fourmeme", network: "BSC" });
}
