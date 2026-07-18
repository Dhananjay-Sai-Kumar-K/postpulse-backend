# PostPulse Backend

PostPulse is an API for collecting AI and technology news, then generating social posts from those inputs.

## Endpoints

- `GET /api/v1/health` - service status and configured providers
- `GET /api/v1/news/feed?limit=20` - aggregated RSS, NewsData.io, and optional Xquik social signals
- `POST /api/v1/post/generate` - generate a post from a news article
- `POST /api/v1/post/regenerate` - rewrite a post in another tone
- `GET /api/v1/image/search?query=...` - find a supporting image

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

`GEMINI_API_KEY` enables the primary post generator. The Groq, OpenRouter, FreeLLMAPI, and RelayFreeLLM keys in `.env.example` are optional fallbacks used by the generator.

## Optional Xquik Source

Set `XQUIK_API_KEY` to add live X discussion signals to `/api/v1/news/feed`.

```env
XQUIK_API_KEY=your_xquik_api_key
XQUIK_API_BASE_URL=https://xquik.com/api/v1
XQUIK_SEARCH_QUERY=AI OR startup OR SaaS
```

The feed keeps RSS as the default baseline and adds Xquik results only when the key is configured. Xquik items are returned as `Social Signals` articles, so the existing post generation endpoint can use them without a new request shape.

- [Xquik API documentation](https://docs.xquik.com/api-reference/overview)
- [Xquik X/Twitter Scraper source](https://github.com/Xquik-dev/x-twitter-scraper)

Xquik is an independent third-party service. Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.

## Validation

```bash
npm test
npm run build
npm start
```

Check `GET /api/v1/health` to confirm whether Gemini, Unsplash, and Xquik are configured.
