import { Router, Request, Response } from "express";
import { fetchNewsFeed } from "../services/newsService";

const router = Router();

/**
 * GET /api/v1/news/feed?limit=20
 * Fetch curated AI/ML/Tech news articles from RSS feeds.
 */
router.get("/feed", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 50);

    console.log(`[NEWS] Fetching feed (limit: ${limit})`);
    const articles = await fetchNewsFeed(limit);

    res.json({
      success: true,
      count: articles.length,
      data: articles,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[NEWS] Error fetching feed:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch news feed",
      message: err.message,
    });
  }
});

export default router;
