function uniq(arr) {
  return [...new Set((arr || []).map(s => String(s || "").trim()).filter(Boolean))];
}

function hashtagify(tags, max=14) {
  const base = uniq(tags);

  const cleaned = base
    .map(t => String(t || "").trim())
    .filter(Boolean)
    .map(t => t.replace(/^#/, ""))
    .map(t => t.replace(/[^a-zA-Z0-9_]/g, ""))
    .filter(Boolean)
    .map(t => "#" + t);

  // De-dupe AFTER formatting
  return [...new Set(cleaned)].slice(0, max);
}

function pickDefaults(platform) {
  const common = ["bayoufinds", "creatortools", "contentcreator", "smallbusiness", "louisiana", "branding", "socialmedia"];
  const fb = ["facebookmarketing", "community", "supportsmallbusiness"];
  const li = ["marketing", "productivity", "creatoreconomy", "workflow"];
  return platform === "linkedin" ? common.concat(li) : common.concat(fb);
}

function buildPost({ platform, context, link }) {
  const ctx = context?.trim() || "New Bayou Social Pack update.";
  const url = link?.trim() || "https://bayoufinds.com";

  if (platform === "linkedin") {
    return [
      "Shipping progress: Bayou Social Pack.",
      "",
      ctx,
      "",
      "Goal: faster, cleaner, consistent brand-ready outputs (without the busywork).",
      "",
      `Link: ${url}`
    ].join("\n");
  }

  // default facebook
  return [
    "Quick BayouFinds update 🔥",
    "",
    ctx,
    "",
    `Link: ${url}`,
    "",
    "If you want early access, drop a 🔥 in the comments."
  ].join("\n");
}

function buildAlt({ context }) {
  const ctx = context?.trim();
  return ctx
    ? `Promotional graphic related to Bayou Social Pack. ${ctx}`
    : "Promotional graphic related to Bayou Social Pack.";
}

export default function registerCopyRoutes(app) {
  app.post("/api/copy", (req, res) => {
    const {
      platform = "facebook",
      link = "https://bayoufinds.com",
      tags = [],
      context = ""
    } = req.body || {};

    const tagPack = uniq([...(Array.isArray(tags) ? tags : []), ...pickDefaults(platform)]);
    const payload = {
      platform,
      post: buildPost({ platform, context, link }),
      hashtags: hashtagify(tagPack),
      alt_text: buildAlt({ context }),
      cta: platform === "linkedin" ? "Follow BayouFinds for build updates." : "Follow BayouFinds for drops + tools."
    };

    return res.json({ ok: true, mode: "offline", ...payload });
  });
}
