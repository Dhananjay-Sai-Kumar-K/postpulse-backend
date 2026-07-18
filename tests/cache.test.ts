import assert from "node:assert/strict";
import test from "node:test";

import { cache } from "../src/utils/cache";

test("expires cached values at the TTL boundary", () => {
  const originalNow = Date.now;
  Date.now = () => 1_000;

  try {
    cache.clear();
    cache.set("expired", "value", 0);

    assert.equal(cache.get("expired"), null);
    assert.equal(cache.stats().size, 0);
  } finally {
    cache.clear();
    Date.now = originalNow;
  }
});
