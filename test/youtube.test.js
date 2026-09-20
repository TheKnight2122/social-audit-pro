import test from "node:test";
import assert from "node:assert/strict";
import { normalizeYouTubeData } from "../src/server/integrations/youtube.js";

test("normaliza YouTube sin inventar alcance, impresiones ni suscriptores ocultos", () => {
  const result = normalizeYouTubeData({
    channel: {
      id: "channel-1",
      snippet: { title: "Canal", customUrl: "@canal" },
      statistics: { hiddenSubscriberCount: true, subscriberCount: "999", viewCount: "1200", videoCount: "4" },
      contentDetails: { relatedPlaylists: { uploads: "uploads-1" } }
    },
    videos: [{
      id: "video-1",
      snippet: { title: "Video", publishedAt: "2026-09-19T12:00:00Z" },
      statistics: { viewCount: "300", likeCount: "25", commentCount: "4" }
    }],
    analytics: {
      columnHeaders: [{ name: "day" }, { name: "views" }, { name: "likes" }],
      rows: [["2026-09-19", 300, 25]]
    },
    syncedAt: "2026-09-20T10:00:00.000Z"
  });

  assert.equal(result.metrics.some((metric) => metric.key === "subscribers"), false);
  assert.equal(result.metrics.find((metric) => metric.key === "total_views").value, 1200);
  assert.equal(result.metrics.find((metric) => metric.key === "analytics_views").value, 300);
  assert.equal(result.posts[0].metrics.views, 300);
  assert.equal(result.posts[0].metrics.reach, null);
  assert.equal(result.posts[0].metrics.impressions, null);
});
