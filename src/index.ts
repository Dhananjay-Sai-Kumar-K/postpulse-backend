import express from "express";
import cors from "cors";
import { config } from "./config";
import newsRouter from "./routes/news";
import postRouter from "./routes/post";
import imageRouter from "./routes/image";

const app = express();

// ─── Middleware ───────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Request logging
app.use((req, _res, next) => {
  const timestamp = new Date().toISOString().substring(11, 19);
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// ─── Routes ──────────────────────────────────────────────
app.use("/api/v1/news", newsRouter);
app.use("/api/v1/post", postRouter);
app.use("/api/v1/image", imageRouter);

// Root redirect/health for Vercel debugging
app.get("/", (_req, res) => {
  res.json({
    message: "PostPulse API is running",
    healthCheck: "/api/v1/health",
    version: "1.0.0"
  });
});

// Health check
app.get("/api/v1/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "PostPulse API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    config: {
      geminiConfigured: config.geminiApiKey !== "" && config.geminiApiKey !== "your_gemini_api_key_here",
      unsplashConfigured: config.unsplashAccessKey !== "" && config.unsplashAccessKey !== "your_unsplash_access_key_here",
      feedCount: config.rssFeeds.length,
      cacheTtl: `${config.cacheTtlMinutes}min`,
    },
  });
});

// 404 handler
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
      "GET  /api/v1/image/search?query=...",
    ],
  });
});

// ─── Start Server (Only in local development) ─────────────
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  app.listen(config.port, "0.0.0.0", () => {
    console.log(`
  ╔══════════════════════════════════════════════════╗
  ║                                                  ║
  ║   ⚡ PostPulse API v1.0.0                        ║
  ║   🌐 http://localhost:${config.port}                    ║
  ║                                                  ║
  ║   Endpoints:                                     ║
  ║     GET  /api/v1/health                          ║
  ║     GET  /api/v1/news/feed?limit=20              ║
  ║     POST /api/v1/post/generate                   ║
  ║     POST /api/v1/post/regenerate                 ║
  ║     GET  /api/v1/image/search?query=...          ║
  ║                                                  ║
  ║   RSS Feeds: ${String(config.rssFeeds.length).padEnd(2)} sources configured             ║
  ║   Cache TTL: ${String(config.cacheTtlMinutes).padEnd(2)} minutes                        ║
  ║   Gemini:    ${(config.geminiApiKey && config.geminiApiKey !== "your_gemini_api_key_here" ? "✅ Configured" : "❌ Not set").padEnd(16)}               ║
  ║   Unsplash:  ${(config.unsplashAccessKey && config.unsplashAccessKey !== "your_unsplash_access_key_here" ? "✅ Configured" : "❌ Not set").padEnd(16)}               ║
  ║                                                  ║
  ╚══════════════════════════════════════════════════╝
    `);
  });
}

export default app;
