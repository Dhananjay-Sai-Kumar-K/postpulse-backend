import RSSParser from "rss-parser";
import { config } from "../config";
import { cache } from "../utils/cache";

const parser = new RSSParser({
  timeout: 10000,
  headers: { "User-Agent": "PostPulse/1.0" },
});

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceIcon: string;
  category: string;
  imageUrl: string | null;
  link: string;
  publishedAt: string;
  isRead: boolean;
  provider: string;
}

interface NewsProvider {
  name: string;
  fetch(limit: number): Promise<NewsArticle[]>;
}

interface XquikTweet {
  id: string;
  text?: string;
  url?: string;
  createdAt?: string;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  quoteCount?: number;
  viewCount?: number;
  author?: {
    username?: string;
    name?: string;
    profilePicture?: string;
  };
}

interface XquikSearchResponse {
  tweets?: XquikTweet[];
}

/**
 * Provider for curated RSS feeds.
 */
class RssProvider implements NewsProvider {
  name = "rss";

  async fetch(limit: number): Promise<NewsArticle[]> {
    const allArticles: NewsArticle[] = [];
    const feedResults = await Promise.allSettled(
      config.rssFeeds.map(async (feed) => {
        try {
          const parsed = await parser.parseURL(feed.url);
          return { feed, items: parsed.items || [] };
        } catch (err: any) {
          console.warn(`[RssProvider] Failed to fetch ${feed.name}: ${err.message}`);
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
          publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
          isRead: false,
          provider: this.name,
        });
      }
    }
    return allArticles;
  }
}

/**
 * Provider for live X discussions through Xquik.
 */
class XquikProvider implements NewsProvider {
  name = "xquik";

  async fetch(limit: number): Promise<NewsArticle[]> {
    if (!config.xquikApiKey || config.xquikApiKey === "your_xquik_api_key") {
      return [];
    }

    const url = new URL(`${config.xquikApiBaseUrl}/x/tweets/search`);
    url.searchParams.set("q", config.xquikSearchQuery);
    url.searchParams.set("queryType", "Top");
    url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 50)));

    try {
      const response = await fetch(url, {
        headers: {
          "accept": "application/json",
          "x-api-key": config.xquikApiKey,
          "xquik-api-contract": "2026-04-29",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json() as XquikSearchResponse;
      return (data.tweets || [])
        .filter((tweet) => tweet.id && tweet.text)
        .map((tweet) => toXquikArticle(tweet));
    } catch (err: any) {
      console.warn(`[XquikProvider] Failed: ${err.message}`);
      return [];
    }
  }
}

/**
 * Provider for NewsData.io API.
 */
class NewsDataIoProvider implements NewsProvider {
  name = "newsdata.io";

  async fetch(limit: number): Promise<NewsArticle[]> {
    if (!config.newsDataIoKey || config.newsDataIoKey === "your_newsdata_io_key") {
      return [];
    }

    try {
      const url = `https://newsdata.io/api/1/news?apikey=${config.newsDataIoKey}&q=artificial%20intelligence%20OR%20machine%20learning&language=en&category=technology`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json() as any;
      const results = data.results || [];

      return results.map((item: any) => ({
        id: generateId(item.link),
        title: item.title,
        summary: cleanText(item.description || item.content, 250),
        source: item.source_id || "NewsData.io",
        sourceIcon: `https://www.google.com/s2/favicons?domain=${new URL(item.link).hostname}&sz=64`,
        category: "AI & Tech",
        imageUrl: item.image_url,
        link: item.link,
        publishedAt: item.pubDate || new Date().toISOString(),
        isRead: false,
        provider: this.name,
      }));
    } catch (err: any) {
      console.warn(`[NewsDataIoProvider] Failed: ${err.message}`);
      return [];
    }
  }
}

/**
 * Orchestrates multiple news providers with deduplication.
 */
export async function fetchNewsFeed(limit: number = 20): Promise<NewsArticle[]> {
  const cacheKey = `news_feed_${limit}`;
  const cached = cache.get<NewsArticle[]>(cacheKey);
  if (cached) return cached;

  const providers: NewsProvider[] = [
    new RssProvider(),
    new XquikProvider(),
    new NewsDataIoProvider(),
    // Future providers (GNews, WorldNews, etc.) can be added here
  ];

  console.log(`[NewsService] Fetching from ${providers.length} providers...`);

  const results = await Promise.allSettled(providers.map(p => p.fetch(limit)));
  let allArticles: NewsArticle[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      allArticles = [...allArticles, ...result.value];
    }
  }

  // Sort by date (newest first)
  allArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // Deduplicate by normalized title
  const seen = new Set<string>();
  const deduplicated = allArticles.filter((article) => {
    const key = article.title.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const finalResult = deduplicated.slice(0, limit);
  cache.set(cacheKey, finalResult, config.cacheTtlMinutes);
  
  return finalResult;
}

// ─── Helper Functions ─────────────────────────────────────

function extractImage(item: any): string | null {
  if (item.enclosure?.url) return item.enclosure.url;
  if (item["media:content"]?.["$"]?.url) return item["media:content"]["$"].url;
  if (item["media:thumbnail"]?.["$"]?.url) return item["media:thumbnail"]["$"].url;
  const content = item["content:encoded"] || item.content || item.description || "";
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  return imgMatch ? imgMatch[1] : null;
}

function toXquikArticle(tweet: XquikTweet): NewsArticle {
  const author = tweet.author?.username ? `@${tweet.author.username}` : "Xquik";
  const metrics = [
    tweet.viewCount ? `${tweet.viewCount} views` : "",
    tweet.likeCount ? `${tweet.likeCount} likes` : "",
    tweet.retweetCount ? `${tweet.retweetCount} reposts` : "",
    tweet.replyCount ? `${tweet.replyCount} replies` : "",
  ].filter(Boolean).join(" · ");

  return {
    id: `xquik-${tweet.id}`,
    title: trimTitle(tweet.text || ""),
    summary: cleanText(`${tweet.text || ""}${metrics ? ` ${metrics}` : ""}`, 250),
    source: `Xquik: ${author}`,
    sourceIcon: tweet.author?.profilePicture || "https://www.google.com/s2/favicons?domain=xquik.com&sz=64",
    category: "Social Signals",
    imageUrl: null,
    link: tweet.url || `https://x.com/i/web/status/${tweet.id}`,
    publishedAt: tweet.createdAt || new Date().toISOString(),
    isRead: false,
    provider: "xquik",
  };
}

function trimTitle(text: string): string {
  const normalized = cleanText(text, 120);
  return normalized || "X discussion";
}

function generateId(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getSourceIcon(feedUrl: string): string {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(feedUrl).hostname}&sz=64`;
  } catch {
    return "https://www.google.com/s2/favicons?domain=news.google.com&sz=64";
  }
}

function cleanText(html: string | undefined, maxLength: number = 200): string {
  if (!html) return "";
  const text = html.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}
