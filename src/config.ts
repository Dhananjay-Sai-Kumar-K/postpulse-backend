import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY || "",
  cacheTtlMinutes: parseInt(process.env.CACHE_TTL_MINUTES || "5", 10),

  // Curated RSS feeds — AI, ML, Tech Companies, Future Tech
  rssFeeds: [
    {
      name: "TechCrunch AI",
      url: "https://techcrunch.com/category/artificial-intelligence/feed/",
      category: "AI & ML",
    },
    {
      name: "The Verge AI",
      url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
      category: "AI & ML",
    },
    {
      name: "MIT Technology Review",
      url: "https://www.technologyreview.com/feed/",
      category: "Science & Tech",
    },
    {
      name: "Ars Technica",
      url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
      category: "Tech Industry",
    },
    {
      name: "VentureBeat AI",
      url: "https://venturebeat.com/category/ai/feed/",
      category: "AI & ML",
    },
    {
      name: "Wired Science",
      url: "https://www.wired.com/feed/category/science/latest/rss",
      category: "Science & Tech",
    },
    {
      name: "Google AI Blog",
      url: "https://blog.google/technology/ai/rss/",
      category: "AI & ML",
    },
    {
      name: "OpenAI Blog",
      url: "https://openai.com/blog/rss.xml",
      category: "AI & ML",
    },
    {
      name: "NVIDIA AI Blog",
      url: "https://blogs.nvidia.com/feed/",
      category: "AI Hardware & Infra",
    },
    {
      name: "IEEE Spectrum Tech",
      url: "https://spectrum.ieee.org/feeds/feed.rss",
      category: "Engineering & Future Tech",
    },
  ],

  // Tone presets for post generation
  tones: {
    professional: "Write in a professional, authoritative tone suitable for LinkedIn. Use industry terminology.",
    casual: "Write in a casual, conversational tone like a tech enthusiast sharing news with friends. Use emojis sparingly.",
    humorous: "Write in a witty, slightly humorous tone with clever wordplay. Make it engaging and shareable.",
    short_punchy: "Write ultra-concise. Punchy sentences. Maximum impact in minimum words. Like a tech insider's hot take.",
  } as Record<string, string>,
};
