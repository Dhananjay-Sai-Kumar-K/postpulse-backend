import assert from "node:assert/strict";
import test from "node:test";

import { config } from "../src/config";
import { XquikProvider } from "../src/services/newsService";

test("requests and maps the default Xquik response contract", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = config.xquikApiKey;
  const originalBaseUrl = config.xquikApiBaseUrl;
  const originalQuery = config.xquikSearchQuery;
  let requestUrl = "";
  let requestHeaders = new Headers();

  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({
      tweets: [{
        id: "123",
        text: "A useful discussion",
        createdAt: "2026-07-18T12:00:00.000Z",
        likeCount: 4,
        author: { username: "alice" },
      }],
    }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };
  config.xquikApiKey = "test-key";
  config.xquikApiBaseUrl = "https://xquik.com/api/v1";
  config.xquikSearchQuery = "AI news";

  try {
    const articles = await new XquikProvider().fetch(20);
    const url = new URL(requestUrl);

    assert.equal(url.pathname, "/api/v1/x/tweets/search");
    assert.equal(url.searchParams.get("q"), "AI news");
    assert.equal(url.searchParams.get("queryType"), "Top");
    assert.equal(url.searchParams.get("limit"), "20");
    assert.equal(requestHeaders.get("x-api-key"), "test-key");
    assert.equal(requestHeaders.has("xquik-api-contract"), false);
    assert.equal(articles.length, 1);
    assert.equal(articles[0]?.id, "xquik-123");
    assert.equal(articles[0]?.source, "Xquik: @alice");
    assert.equal(articles[0]?.publishedAt, "2026-07-18T12:00:00.000Z");
  } finally {
    globalThis.fetch = originalFetch;
    config.xquikApiKey = originalApiKey;
    config.xquikApiBaseUrl = originalBaseUrl;
    config.xquikSearchQuery = originalQuery;
  }
});
