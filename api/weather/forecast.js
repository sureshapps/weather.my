// Server-side proxy for GET https://api.data.gov.my/weather/forecast
// Runs on Vercel's servers, so it is NOT subject to browser CORS rules.
// The client always calls our own origin at /api/weather/forecast.

export default async function handler(req, res) {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const upstreamUrl = `https://api.data.gov.my/weather/forecast${qs ? "?" + qs : ""}`;

    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
    });

    const text = await upstream.text();

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: "Forecast data is temporarily unavailable." });
  }
}
