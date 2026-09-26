import test from "node:test";
import assert from "node:assert/strict";
import { createFacebookProvider } from "../src/server/integrations/facebook.js";
import { createInstagramProvider } from "../src/server/integrations/instagram.js";
import { createLinkedInProvider } from "../src/server/integrations/linkedin.js";
import { createTikTokProvider } from "../src/server/integrations/tiktok.js";
import { createXProvider } from "../src/server/integrations/x.js";
import { numeric, requestJson } from "../src/server/integrations/provider-http.js";

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; }
  };
}

test("normaliza datos oficiales de TikTok con PKCE", async () => {
  assert.equal(numeric(null), null);
  assert.equal(numeric(undefined), null);
  assert.equal(numeric(""), null);
  assert.equal(numeric(0), 0);
  await assert.rejects(
    requestJson(async () => response({ error: { code: "access_token_invalid", message: "Token invalido" } }), "https://example.test"),
    /Token invalido/
  );
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.includes("/oauth/token")) {
      return response({ access_token: "tt-access", refresh_token: "tt-refresh", expires_in: 3600, scope: "user.info.basic,video.list" });
    }
    if (url.includes("/user/info")) {
      return response({ data: { user: { open_id: "tt-1", display_name: "TikTok Demo", username: "demo", follower_count: 120, following_count: 15, likes_count: 800, video_count: 3 } } });
    }
    return response({ data: { videos: [{ id: "video-1", create_time: 1789900000, video_description: "Video", view_count: 900, like_count: 80, comment_count: 7, share_count: 4 }] } });
  };
  const provider = createTikTokProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.test/callback", fetchImpl });
  const authorization = new URL(provider.getAuthorizationUrl("state", { codeChallenge: "challenge" }));
  assert.equal(authorization.searchParams.get("code_challenge"), "challenge");
  const tokens = await provider.exchangeCode("code", { codeVerifier: "verifier" });
  const data = await provider.fetchData(tokens);
  assert.equal(data.account.handle, "@demo");
  assert.equal(data.metrics.find((item) => item.key === "followers").value, 120);
  assert.equal(data.posts[0].metrics.views, 900);
  assert.equal(data.posts[0].metrics.reach, null);
});

test("normaliza perfil y publicaciones de X con OAuth 2 PKCE", async () => {
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.includes("/oauth2/token")) return response({ access_token: "x-access", refresh_token: "x-refresh", expires_in: 7200, scope: "tweet.read users.read offline.access" });
    if (url.includes("/users/me")) return response({ data: { id: "x-1", name: "X Demo", username: "xdemo", public_metrics: { followers_count: 40, following_count: 5, tweet_count: 10 } } });
    return response({ data: [{ id: "tweet-1", text: "Publicacion", created_at: "2026-09-25T10:00:00Z", public_metrics: { impression_count: 200, like_count: 12, reply_count: 2, retweet_count: 3 } }] });
  };
  const provider = createXProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.test/callback", apiBaseUrl: "https://api.x.test", fetchImpl });
  assert.equal(new URL(provider.getAuthorizationUrl("state", { codeChallenge: "pkce" })).searchParams.get("scope"), "tweet.read users.read offline.access");
  const data = await provider.fetchData(await provider.exchangeCode("code", { codeVerifier: "verifier" }));
  assert.equal(data.account.handle, "@xdemo");
  assert.equal(data.posts[0].metrics.impressions, 200);
});

test("normaliza paginas de Facebook e Instagram profesional", async () => {
  const facebookFetch = async (input) => {
    const url = String(input);
    if (url.includes("/oauth/access_token") && url.includes("fb_exchange_token")) return response({ access_token: "fb-long", expires_in: 3600 });
    if (url.includes("/oauth/access_token")) return response({ access_token: "fb-short" });
    if (url.includes("/me/accounts")) return response({ data: [{ id: "page-1", name: "Pagina Demo", username: "pagina", access_token: "page-token", followers_count: 500, fan_count: 480 }] });
    return response({ data: [{ id: "post-1", message: "Post", created_time: "2026-09-25T10:00:00Z", reactions: { summary: { total_count: 30 } }, comments: { summary: { total_count: 4 } }, shares: { count: 2 } }] });
  };
  const facebook = createFacebookProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.test/facebook", fetchImpl: facebookFetch });
  const facebookData = await facebook.fetchData(await facebook.exchangeCode("code"));
  assert.equal(facebookData.account.externalId, "page-1");
  assert.equal(facebookData.metrics.find((item) => item.key === "followers").value, 500);
  assert.equal(facebookData.tokens.access_token, "page-token");

  const instagramFetch = async (input) => {
    const url = String(input);
    if (url.includes("api.instagram.com/oauth")) return response({ access_token: "ig-short", user_id: "ig-1" });
    if (url.includes("/access_token")) return response({ access_token: "ig-long", expires_in: 3600 });
    if (url.includes("/me/media")) return response({ data: [{ id: "ig-post", caption: "Foto", media_type: "IMAGE", timestamp: "2026-09-25T10:00:00Z", like_count: 44, comments_count: 6 }] });
    return response({ user_id: "ig-1", name: "Instagram Demo", username: "igdemo", followers_count: 650, follows_count: 80, media_count: 20 });
  };
  const instagram = createInstagramProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.test/instagram", fetchImpl: instagramFetch });
  const instagramData = await instagram.fetchData(await instagram.exchangeCode("code"));
  assert.equal(instagramData.account.handle, "@igdemo");
  assert.equal(instagramData.posts[0].metrics.likes, 44);
});

test("normaliza pagina, seguidores y estadisticas de LinkedIn", async () => {
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.includes("oauth/v2/accessToken")) return response({ access_token: "li-access", expires_in: 3600 });
    if (url.includes("organizationAcls")) return response({ elements: [{ organization: "urn:li:organization:123" }] });
    if (url.includes("/organizations/123")) return response({ localizedName: "Empresa LinkedIn", vanityName: "empresa" });
    if (url.includes("/networkSizes/")) return response({ firstDegreeSize: 1200 });
    if (url.includes("/organizationalEntityShareStatistics")) return response({ elements: [{ totalShareStatistics: { impressionCount: 9000, likeCount: 400, commentCount: 35, shareCount: 22 } }] });
    return response({ elements: [{ id: "urn:li:share:1", commentary: "Actualizacion", publishedAt: 1789900000000 }] });
  };
  const provider = createLinkedInProvider({ clientId: "client", clientSecret: "secret", redirectUri: "https://app.test/linkedin", fetchImpl });
  const data = await provider.fetchData(await provider.exchangeCode("code"));
  assert.equal(data.account.name, "Empresa LinkedIn");
  assert.equal(data.metrics.find((item) => item.key === "followers").value, 1200);
  assert.equal(data.metrics.find((item) => item.key === "impressions").value, 9000);
  assert.equal(data.posts[0].description, "Actualizacion");
});
