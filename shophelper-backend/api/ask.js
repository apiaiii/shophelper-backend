// api/ask.js  — Vercel Serverless Function
// Handles POST { brandName, faqUrl, messages } and returns { reply }

export default async function handler(req, res) {
  // --- CORS for browser calls from your store ---
  res.setHeader("Access-Control-Allow-Origin", "*"); // change to your domain later
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { brandName, faqUrl, messages } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Missing messages array" });
    }

    // (Optional) Pull FAQ page so the AI can answer with store policies
    let faqText = "";
    if (faqUrl) {
      try {
        const r = await fetch(faqUrl, { headers: { "User-Agent": "ShopHelperBot/1.0" } });
        const html = await r.text();
        faqText = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 10000);
      } catch {/* ignore */}
    }

    const systemPrompt = [
      `You are a helpful, concise e-commerce support agent for ${brandName || "our store"}.`,
      `If the user asks about orders, request their order number if you don't have it.`,
      `Use the store's policy text when available (below). Be clear and friendly.`,
      faqText ? `\nStore FAQ/policy:\n${faqText}` : ``,
    ].join("\n");

    // --- Call OpenAI (server-side; never expose this key in the theme) ---
    const openai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!openai.ok) {
      const errText = await openai.text();
      return res.status(500).json({ error: "LLM error", detail: errText });
    }

    const data = await openai.json();
    const reply = data?.choices?.[0]?.message?.content?.trim()
      || "Sorry, I couldn’t generate a response right now.";

    return res.status(200).json({ reply });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
}
