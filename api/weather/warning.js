// Server-side proxy for GET https://api.data.gov.my/weather/warning

export default async function handler(req, res) {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const upstreamUrl = `https://api.data.gov.my/weather/warning${qs ? "?" + qs : ""}`;

    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
    });

    const text = await upstream.text();

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: "Warning data is temporarily unavailable." });
  }
}
