import { Router, Request, Response } from "express";
import { generatePost, regeneratePost } from "../services/aiService";

const router = Router();

/**
 * POST /api/v1/post/generate
 * Generate an SEO-optimized social media post for a given news article.
 *
 * Body: { title, summary, source, link, imageUrl?, platform?, tone? }
 */
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { title, summary, source, link, imageUrl, platform, tone } = req.body;

    // Validate required fields
    if (!title || !summary || !source || !link) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: title, summary, source, link",
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
      tone: tone || "professional",
    });

    res.json({
      success: true,
      data: post,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[POST] Generation error:", err.message);

    // Special handling for missing API key
    if (err.message.includes("GEMINI_API_KEY")) {
      res.status(503).json({
        success: false,
        error: "AI service not configured",
        message: err.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: "Failed to generate post",
      message: err.message,
    });
  }
});

/**
 * POST /api/v1/post/regenerate
 * Regenerate a post with a different tone.
 *
 * Body: { title, summary, source, link, imageUrl?, platform?, tone }
 */
router.post("/regenerate", async (req: Request, res: Response) => {
  try {
    const { title, summary, source, link, imageUrl, platform, tone } = req.body;

    if (!title || !summary || !source || !link || !tone) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: title, summary, source, link, tone",
      });
      return;
    }

    const validTones = ["professional", "casual", "humorous", "short_punchy"];
    if (!validTones.includes(tone)) {
      res.status(400).json({
        success: false,
        error: `Invalid tone. Must be one of: ${validTones.join(", ")}`,
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
      tone,
    });

    res.json({
      success: true,
      data: post,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[POST] Regeneration error:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to regenerate post",
      message: err.message,
    });
  }
});

export default router;
