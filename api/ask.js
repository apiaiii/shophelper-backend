// api/ask.js
module.exports = async (req, res) => {
  // CORS for testing (lock down later)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { brandName, faqUrl, messages } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Missing messages array" });
    }

    // Optional: pull FAQ page for context
    let faqText = "";
    if (faqUrl) {
      try {
        const r = await fetch(faqUrl, { headers: { "User-Agent": "ShopHelperBot/1.0" } });
        const html = await r.text();
        faqText = html.replace(/<script[\s\S]*?<\/script>/gi, "")
                      .replace(/<style[\s\S]*?<\/style>/gi, "")
                      .replace(/<[^>]+>/g, " ")
                      .replace(/\s+/g, " ")
                      .slice(0, 10000);
      } catch {}
    }

    const system = [
      `You are a concise e-commerce support agent for ${brandName || "our store"}.`,
      `If the user asks about an order, request their order number.`,
      faqText ? `Store FAQ/policy:\n${faqText}` : ``,
    ].join("\n");

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [{ role: "system", content: system }, ...(messages || [])],
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: "LLM error", detail: err });
    }

    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content?.trim()
      || "Sorry, I couldn’t generate a response right now.";

    return res.status(200).json({ reply });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
};
