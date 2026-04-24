import { Router, Request, Response } from "express";
import { searchImages } from "../services/imageService";

const router = Router();

/**
 * GET /api/v1/image/search?query=...&count=1
 * Search for relevant images via Unsplash (or fallback).
 */
router.get("/search", async (req: Request, res: Response) => {
  try {
    const query = req.query.query as string;
    const count = Math.min(Math.max(parseInt(req.query.count as string) || 1, 1), 10);

    if (!query || query.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Missing required query parameter: query",
      });
      return;
    }

    console.log(`[IMAGE] Searching for "${query}" (count: ${count})`);
    const images = await searchImages(query.trim(), count);

    res.json({
      success: true,
      count: images.length,
      data: images,
    });
  } catch (err: any) {
    console.error("[IMAGE] Search error:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to search images",
      message: err.message,
    });
  }
});

export default router;
