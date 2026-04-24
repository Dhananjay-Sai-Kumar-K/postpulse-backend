// src/index.ts
import express from "express";
import cors from "cors";

// src/config.ts
import dotenv from "dotenv";
dotenv.config();
var config = {
  port: parseInt(process.env.PORT || "3000", 10),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY || "",
  cacheTtlMinutes: parseInt(process.env.CACHE_TTL_MINUTES || "5", 10),
  // Curated RSS feeds — AI, ML, Tech Companies, Future Tech
  rssFeeds: [
    {
      name: "TechCrunch AI",
      url: "https://techcrunch.com/category/artificial-intelligence/feed/",
      category: "AI & ML"
    },
    {
      name: "The Verge AI",
      url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
      category: "AI & ML"
    },
    {
      name: "MIT Technology Review",
      url: "https://www.technologyreview.com/feed/",
      category: "Science & Tech"
    },
    {
      name: "Ars Technica",
      url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
      category: "Tech Industry"
    },
    {
      name: "VentureBeat AI",
      url: "https://venturebeat.com/category/ai/feed/",
      category: "AI & ML"
    },
    {
      name: "Wired Science",
      url: "https://www.wired.com/feed/category/science/latest/rss",
      category: "Science & Tech"
    },
    {
      name: "Google AI Blog",
      url: "https://blog.google/technology/ai/rss/",
      category: "AI & ML"
    },
    {
      name: "OpenAI Blog",
      url: "https://openai.com/blog/rss.xml",
      category: "AI & ML"
    },
    {
      name: "NVIDIA AI Blog",
      url: "https://blogs.nvidia.com/feed/",
      category: "AI Hardware & Infra"
    },
    {
      name: "IEEE Spectrum Tech",
      url: "https://spectrum.ieee.org/feeds/feed.rss",
      category: "Engineering & Future Tech"
    }
  ],
  // Tone presets for post generation
  tones: {
    professional: "Write in a professional, authoritative tone suitable for LinkedIn. Use industry terminology.",
    casual: "Write in a casual, conversational tone like a tech enthusiast sharing news with friends. Use emojis sparingly.",
    humorous: "Write in a witty, slightly humorous tone with clever wordplay. Make it engaging and shareable.",
    short_punchy: "Write ultra-concise. Punchy sentences. Maximum impact in minimum words. Like a tech insider's hot take."
  }
};

// src/routes/news.ts
import { Router } from "express";

// src/services/newsService.ts
import RSSParser from "rss-parser";

// src/utils/cache.ts
var MemoryCache = class {
  store = /* @__PURE__ */ new Map();
  /**
   * Get a cached value by key.
   * Returns null if expired or not found.
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }
  /**
   * Store a value with TTL in minutes.
   */
  set(key, data, ttlMinutes) {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMinutes * 60 * 1e3
    });
  }
  /**
   * Invalidate a specific key.
   */
  delete(key) {
    this.store.delete(key);
  }
  /**
   * Clear all cached data.
   */
  clear() {
    this.store.clear();
  }
  /**
   * Get cache stats for debugging.
   */
  stats() {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys())
    };
  }
};
var cache = new MemoryCache();

// src/services/newsService.ts
var parser = new RSSParser({
  timeout: 1e4,
  // 10s timeout per feed
  headers: {
    "User-Agent": "PostPulse/1.0 (News Aggregator)"
  }
});
function extractImage(item) {
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }
  if (item["media:content"] && item["media:content"]["$"] && item["media:content"]["$"].url) {
    return item["media:content"]["$"].url;
  }
  if (item["media:thumbnail"] && item["media:thumbnail"]["$"] && item["media:thumbnail"]["$"].url) {
    return item["media:thumbnail"]["$"].url;
  }
  const content = item["content:encoded"] || item.content || item.contentSnippet || "";
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1];
  }
  return null;
}
function generateId(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
function getSourceIcon(feedUrl) {
  try {
    const url = new URL(feedUrl);
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
  } catch {
    return "https://www.google.com/s2/favicons?domain=news.google.com&sz=64";
  }
}
function cleanText(html, maxLength = 200) {
  if (!html) return "";
  const text = html.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}
async function fetchNewsFeed(limit = 20) {
  const cacheKey = `news_feed_${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`[NewsService] Serving ${cached.length} articles from cache`);
    return cached;
  }
  console.log(`[NewsService] Fetching from ${config.rssFeeds.length} RSS feeds...`);
  const allArticles = [];
  const feedResults = await Promise.allSettled(
    config.rssFeeds.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        return { feed, items: parsed.items || [] };
      } catch (err) {
        console.warn(`[NewsService] Failed to fetch ${feed.name}: ${err.message}`);
        return { feed, items: [] };
      }
    })
  );
  for (const result of feedResults) {
    if (result.status === "rejected") continue;
    const { feed, items } = result.value;
    for (const item of items) {
      if (!item.title || !item.link) continue;
      allArticles.push({
        id: generateId(item.link),
        title: item.title.trim(),
        summary: cleanText(item.contentSnippet || item.content || item.description, 250),
        source: feed.name,
        sourceIcon: getSourceIcon(feed.url),
        category: feed.category,
        imageUrl: extractImage(item),
        link: item.link,
        publishedAt: item.isoDate || item.pubDate || (/* @__PURE__ */ new Date()).toISOString(),
        isRead: false
      });
    }
  }
  allArticles.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  const seen = /* @__PURE__ */ new Set();
  const deduplicated = allArticles.filter((article) => {
    const key = article.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const limited = deduplicated.slice(0, limit);
  cache.set(cacheKey, limited, config.cacheTtlMinutes);
  console.log(`[NewsService] Cached ${limited.length} articles (TTL: ${config.cacheTtlMinutes}min)`);
  return limited;
}

// src/routes/news.ts
var router = Router();
router.get("/feed", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    console.log(`[NEWS] Fetching feed (limit: ${limit})`);
    const articles = await fetchNewsFeed(limit);
    res.json({
      success: true,
      count: articles.length,
      data: articles,
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    console.error("[NEWS] Error fetching feed:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch news feed",
      message: err.message
    });
  }
});
var news_default = router;

// src/routes/post.ts
import { Router as Router2 } from "express";

// src/services/aiService.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

// src/services/groqService.ts
import Groq from "groq-sdk";
var groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});
async function generatePostWithGroq(prompt, model = "llama-3.3-70b-versatile") {
  const chatCompletion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model
  });
  return chatCompletion.choices[0]?.message?.content || "";
}

// src/services/openaiCompatibleService.ts
async function generatePostWithOpenAICompatible(baseUrl, apiKey, model, prompt) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // Optional headers recommended for OpenRouter specifically
      "HTTP-Referer": "https://postpulse.app",
      "X-Title": "PostPulse"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// src/services/aiService.ts
var genAI = null;
function getClient() {
  if (!genAI) {
    if (!config.geminiApiKey || config.geminiApiKey === "your_gemini_api_key_here") {
      throw new Error(
        "GEMINI_API_KEY not configured. Get one at https://aistudio.google.com/apikey"
      );
    }
    genAI = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return genAI;
}
async function generatePost(params) {
  const platform = params.platform || "twitter";
  const toneName = params.tone || "professional";
  const toneInstruction = config.tones[toneName] || config.tones.professional;
  const charLimit = platform === "twitter" ? 270 : 2800;
  const platformName = platform === "twitter" ? "X (Twitter)" : "LinkedIn";
  const prompt = `You are an expert social media content creator specializing in AI, Machine Learning, and technology news.

TASK: Create an engaging, SEO-optimized social media post for ${platformName}.

NEWS ARTICLE:
Title: ${params.title}
Summary: ${params.summary}
Source: ${params.source}
Link: ${params.link}

INSTRUCTIONS:
- ${toneInstruction}
- Maximum ${charLimit} characters for the post text (NOT counting hashtags).
- Include the article link naturally in the post.
- Make it attention-grabbing \u2014 the first line should hook the reader.
- For ${platformName}, optimize for engagement (${platform === "twitter" ? "retweets and likes" : "comments and shares"}).
- DO NOT use markdown formatting. Plain text only.
${platform === "linkedin" ? "- For LinkedIn, you can use line breaks for readability. Include a compelling opening hook and a call-to-action." : "- For X, be concise and punchy. Every word matters."}

RESPOND IN EXACTLY THIS JSON FORMAT (no markdown, no code blocks):
{
  "text": "Your generated post text here",
  "suggestedHashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"]
}

Generate 5 relevant, trending hashtags related to the article topic. Do NOT include the # symbol in the hashtags array.`;
  const providers = [
    { provider: "gemini", model: "gemini-2.0-flash" },
    { provider: "gemini", model: "gemini-1.5-flash-latest" },
    { provider: "groq", model: "llama-3.3-70b-versatile" },
    { provider: "groq", model: "mixtral-8x7b-32768" },
    // OpenRouter integration
    { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" },
    // FreeLLMAPI integration
    { provider: "freellmapi", model: "gpt-3.5-turbo", baseUrl: process.env.FREELLMAPI_BASE_URL || "https://api.freellmapi.com/v1", envKey: "FREELLMAPI_API_KEY" },
    // RelayFreeLLM integration (Self-hosted or proxy URL)
    { provider: "relayfreellm", model: "llama-3", baseUrl: process.env.RELAYFREELLM_BASE_URL || "http://localhost:8080/v1", envKey: "RELAYFREELLM_API_KEY" }
  ];
  let responseText = "";
  let lastError = null;
  for (const p of providers) {
    try {
      console.log(`[AIService] Routing request to ${p.provider} (${p.model})...`);
      if (p.provider === "gemini") {
        const client = getClient();
        const model = client.getGenerativeModel({
          model: p.model,
          generationConfig: { temperature: 0.8, topP: 0.9, maxOutputTokens: 1024 }
        });
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
        break;
      } else if (p.provider === "groq") {
        if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
        responseText = await generatePostWithGroq(prompt, p.model);
        break;
      } else if (["openrouter", "freellmapi", "relayfreellm"].includes(p.provider)) {
        const apiKey = process.env[p.envKey];
        if (!apiKey) throw new Error(`${p.envKey} not configured`);
        responseText = await generatePostWithOpenAICompatible(
          p.baseUrl,
          apiKey,
          p.model,
          prompt
        );
        break;
      }
    } catch (error) {
      console.warn(`[AIService] \u26A0\uFE0F ${p.provider} (${p.model}) failed: ${error.message}`);
      lastError = error;
    }
  }
  if (!responseText) {
    throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
  }
  let parsed;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.error("[AIService] Failed to parse Gemini response:", responseText);
    parsed = {
      text: responseText.substring(0, charLimit),
      suggestedHashtags: ["AI", "MachineLearning", "Tech", "Innovation", "FutureTech"]
    };
  }
  const hashtags = parsed.suggestedHashtags.map((tag) => tag.replace(/^#/, ""));
  return {
    text: parsed.text,
    characterCount: parsed.text.length,
    suggestedHashtags: hashtags,
    platform,
    tone: toneName,
    imageUrl: params.imageUrl || null
  };
}
async function regeneratePost(params) {
  return generatePost(params);
}

// src/routes/post.ts
var router2 = Router2();
router2.post("/generate", async (req, res) => {
  try {
    const { title, summary, source, link, imageUrl, platform, tone } = req.body;
    if (!title || !summary || !source || !link) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: title, summary, source, link"
      });
      return;
    }
    console.log(`[POST] Generating ${platform || "twitter"} post for: "${title.substring(0, 50)}..."`);
    const post = await generatePost({
      title,
      summary,
      source,
      link,
      imageUrl,
      platform: platform || "twitter",
      tone: tone || "professional"
    });
    res.json({
      success: true,
      data: post,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    console.error("[POST] Generation error:", err.message);
    if (err.message.includes("GEMINI_API_KEY")) {
      res.status(503).json({
        success: false,
        error: "AI service not configured",
        message: err.message
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: "Failed to generate post",
      message: err.message
    });
  }
});
router2.post("/regenerate", async (req, res) => {
  try {
    const { title, summary, source, link, imageUrl, platform, tone } = req.body;
    if (!title || !summary || !source || !link || !tone) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: title, summary, source, link, tone"
      });
      return;
    }
    const validTones = ["professional", "casual", "humorous", "short_punchy"];
    if (!validTones.includes(tone)) {
      res.status(400).json({
        success: false,
        error: `Invalid tone. Must be one of: ${validTones.join(", ")}`
      });
      return;
    }
    console.log(`[POST] Regenerating with tone "${tone}" for: "${title.substring(0, 50)}..."`);
    const post = await regeneratePost({
      title,
      summary,
      source,
      link,
      imageUrl,
      platform: platform || "twitter",
      tone
    });
    res.json({
      success: true,
      data: post,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    console.error("[POST] Regeneration error:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to regenerate post",
      message: err.message
    });
  }
});
var post_default = router2;

// src/routes/image.ts
import { Router as Router3 } from "express";

// src/services/imageService.ts
async function searchImages(query, count = 1) {
  const cacheKey = `img_${query}_${count}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  if (!config.unsplashAccessKey || config.unsplashAccessKey === "your_unsplash_access_key_here") {
    console.warn("[ImageService] No Unsplash API key configured. Using placeholders.");
    const placeholders = Array.from({ length: count }, (_, i) => ({
      imageUrl: `https://picsum.photos/seed/${encodeURIComponent(query + i)}/800/600`,
      thumbnailUrl: `https://picsum.photos/seed/${encodeURIComponent(query + i)}/200/150`,
      photographer: "Lorem Picsum",
      photographerUrl: "https://picsum.photos",
      unsplashId: `placeholder-${i}`,
      downloadUrl: `https://picsum.photos/seed/${encodeURIComponent(query + i)}/1200/900`,
      altDescription: query
    }));
    return placeholders;
  }
  try {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", count.toString());
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("content_filter", "high");
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${config.unsplashAccessKey}`,
        "Accept-Version": "v1"
      }
    });
    if (!response.ok) {
      throw new Error(`Unsplash API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const results = (data.results || []).map((photo) => ({
      imageUrl: photo.urls?.regular || photo.urls?.small,
      thumbnailUrl: photo.urls?.thumb || photo.urls?.small,
      photographer: photo.user?.name || "Unknown",
      photographerUrl: photo.user?.links?.html || "https://unsplash.com",
      unsplashId: photo.id,
      downloadUrl: photo.urls?.full || photo.urls?.regular,
      altDescription: photo.alt_description || query
    }));
    cache.set(cacheKey, results, 30);
    return results;
  } catch (err) {
    console.error(`[ImageService] Unsplash search failed: ${err.message}`);
    return [
      {
        imageUrl: `https://picsum.photos/seed/${encodeURIComponent(query)}/800/600`,
        thumbnailUrl: `https://picsum.photos/seed/${encodeURIComponent(query)}/200/150`,
        photographer: "Lorem Picsum (fallback)",
        photographerUrl: "https://picsum.photos",
        unsplashId: "fallback",
        downloadUrl: `https://picsum.photos/seed/${encodeURIComponent(query)}/1200/900`,
        altDescription: query
      }
    ];
  }
}

// src/routes/image.ts
var router3 = Router3();
router3.get("/search", async (req, res) => {
  try {
    const query = req.query.query;
    const count = Math.min(Math.max(parseInt(req.query.count) || 1, 1), 10);
    if (!query || query.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Missing required query parameter: query"
      });
      return;
    }
    console.log(`[IMAGE] Searching for "${query}" (count: ${count})`);
    const images = await searchImages(query.trim(), count);
    res.json({
      success: true,
      count: images.length,
      data: images
    });
  } catch (err) {
    console.error("[IMAGE] Search error:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to search images",
      message: err.message
    });
  }
});
var image_default = router3;

// src/index.ts
var app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use((req, _res, next) => {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().substring(11, 19);
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});
app.use("/api/v1/news", news_default);
app.use("/api/v1/post", post_default);
app.use("/api/v1/image", image_default);
app.get("/", (_req, res) => {
  res.json({
    message: "PostPulse API is running",
    healthCheck: "/api/v1/health",
    version: "1.0.0"
  });
});
app.get("/api/v1/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "PostPulse API",
    version: "1.0.0",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    config: {
      geminiConfigured: config.geminiApiKey !== "" && config.geminiApiKey !== "your_gemini_api_key_here",
      unsplashConfigured: config.unsplashAccessKey !== "" && config.unsplashAccessKey !== "your_unsplash_access_key_here",
      feedCount: config.rssFeeds.length,
      cacheTtl: `${config.cacheTtlMinutes}min`
    }
  });
});
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "Not Found",
    message: "The requested endpoint does not exist.",
    availableEndpoints: [
      "GET  /api/v1/health",
      "GET  /api/v1/news/feed?limit=20",
      "POST /api/v1/post/generate",
      "POST /api/v1/post/regenerate",
      "GET  /api/v1/image/search?query=..."
    ]
  });
});
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  app.listen(config.port, "0.0.0.0", () => {
    console.log(`
  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
  \u2551                                                  \u2551
  \u2551   \u26A1 PostPulse API v1.0.0                        \u2551
  \u2551   \u{1F310} http://localhost:${config.port}                    \u2551
  \u2551                                                  \u2551
  \u2551   Endpoints:                                     \u2551
  \u2551     GET  /api/v1/health                          \u2551
  \u2551     GET  /api/v1/news/feed?limit=20              \u2551
  \u2551     POST /api/v1/post/generate                   \u2551
  \u2551     POST /api/v1/post/regenerate                 \u2551
  \u2551     GET  /api/v1/image/search?query=...          \u2551
  \u2551                                                  \u2551
  \u2551   RSS Feeds: ${String(config.rssFeeds.length).padEnd(2)} sources configured             \u2551
  \u2551   Cache TTL: ${String(config.cacheTtlMinutes).padEnd(2)} minutes                        \u2551
  \u2551   Gemini:    ${(config.geminiApiKey && config.geminiApiKey !== "your_gemini_api_key_here" ? "\u2705 Configured" : "\u274C Not set").padEnd(16)}               \u2551
  \u2551   Unsplash:  ${(config.unsplashAccessKey && config.unsplashAccessKey !== "your_unsplash_access_key_here" ? "\u2705 Configured" : "\u274C Not set").padEnd(16)}               \u2551
  \u2551                                                  \u2551
  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
    `);
  });
}
var index_default = app;
export {
  index_default as default
};
