let _clientPromise = null;

function getClient() {
  if (_clientPromise) return _clientPromise;
  _clientPromise = import("openai").then(({ default: OpenAI }) => {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  });
  return _clientPromise;
}

function mustEnv() {
  if (!process.env.OPENAI_API_KEY) {
    const err = new Error("OPENAI_API_KEY is missing on the server.");
    err.status = 500;
    throw err;
  }
}

function buildPrompt({ platform, vibe, link, tags, context }) {
  return `
You are Bayou Social Pack's copy engine.
Return ONLY valid JSON. No markdown. No commentary.

TASK:
Create a ${platform} post that fits the vibe: "${vibe}".

CONTEXT:
${context || "(none)"}

LINK (include once):
${link || "(none)"}

HASHTAG THEMES:
${Array.isArray(tags) ? tags.join(", ") : "(none)"}

OUTPUT JSON:
{
  "platform": "${platform}",
  "post": "string",
  "hashtags": ["string"],
  "alt_text": "string",
  "cta": "string"
}
`.trim();
}

module.exports = function registerCopyRoutes(app) {
  app.post("/api/copy", async (req, res) => {
    try {
      mustEnv();
      const client = await getClient();

      const {
        platform = "facebook",
        vibe = "clean, helpful, bayou creator tone",
        link = "https://bayoufinds.com",
        tags = ["bayoufinds", "creator-tools"],
        context = ""
      } = req.body || {};

      const response = await client.responses.create({
        model: "gpt-5",
        input: buildPrompt({ platform, vibe, link, tags, context })
      });

      const text = response.output_text || "";

      let data;
      try { data = JSON.parse(text); }
      catch { return res.status(502).json({ ok: false, error: "Invalid JSON returned by model", raw: text }); }

      return res.json({ ok: true, ...data });
    } catch (err) {
      return res.status(err.status || 500).json({ ok: false, error: err.message || "Unknown error" });
    }
  });
};
