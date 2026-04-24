import RSSParser from "rss-parser";
import { config } from "../config";
import { cache } from "../utils/cache";

const parser = new RSSParser({
  timeout: 10000, // 10s timeout per feed
  headers: {
    "User-Agent": "PostPulse/1.0 (News Aggregator)",
  },
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
}

/**
 * Extract image URL from RSS item.
 * Tries multiple common locations: enclosure, media:content, media:thumbnail, og:image in content.
 */
function extractImage(item: any): string | null {
  // 1. Enclosure (most common for images)
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }

  // 2. Media content / thumbnail
  if (item["media:content"] && item["media:content"]["$"] && item["media:content"]["$"].url) {
    return item["media:content"]["$"].url;
  }
  if (item["media:thumbnail"] && item["media:thumbnail"]["$"] && item["media:thumbnail"]["$"].url) {
    return item["media:thumbnail"]["$"].url;
  }

  // 3. Try to find an image in the content/description HTML
  const content = item["content:encoded"] || item.content || item.contentSnippet || "";
  const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1];
  }

  return null;
}

/**
 * Generate a simple hash-based ID from a URL string.
 */
function generateId(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get a favicon URL for a given source domain.
 */
function getSourceIcon(feedUrl: string): string {
  try {
    const url = new URL(feedUrl);
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
  } catch {
    return "https://www.google.com/s2/favicons?domain=news.google.com&sz=64";
  }
}

/**
 * Clean HTML tags from a string and truncate to maxLength.
 */
function cleanText(html: string | undefined, maxLength: number = 200): string {
  if (!html) return "";
  const text = html
    .replace(/<[^>]*>/g, "")      // Strip HTML
    .replace(/&[a-z]+;/gi, " ")   // Strip HTML entities
    .replace(/\s+/g, " ")         // Normalize whitespace
    .trim();
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}

/**
 * Fetch articles from all configured RSS feeds.
 * Results are cached for the configured TTL.
 */
export async function fetchNewsFeed(limit: number = 20): Promise<NewsArticle[]> {
  const cacheKey = `news_feed_${limit}`;
  const cached = cache.get<NewsArticle[]>(cacheKey);
  if (cached) {
    console.log(`[NewsService] Serving ${cached.length} articles from cache`);
    return cached;
  }

  console.log(`[NewsService] Fetching from ${config.rssFeeds.length} RSS feeds...`);

  const allArticles: NewsArticle[] = [];

  // Fetch all feeds concurrently
  const feedResults = await Promise.allSettled(
    config.rssFeeds.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        return { feed, items: parsed.items || [] };
      } catch (err: any) {
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
        publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
        isRead: false,
      });
    }
  }

  // Sort by published date (newest first)
  allArticles.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  // Deduplicate by title similarity (simple exact match)
  const seen = new Set<string>();
  const deduplicated = allArticles.filter((article) => {
    const key = article.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Limit results
  const limited = deduplicated.slice(0, limit);

  // Cache the results
  cache.set(cacheKey, limited, config.cacheTtlMinutes);
  console.log(`[NewsService] Cached ${limited.length} articles (TTL: ${config.cacheTtlMinutes}min)`);

  return limited;
}
