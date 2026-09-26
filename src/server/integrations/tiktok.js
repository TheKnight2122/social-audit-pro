import {
  bearerHeaders,
  expiryFromSeconds,
  isExpiring,
  numeric,
  requestJson,
  scopesAsString
} from "./provider-http.js";

const DEFAULT_SCOPES = ["user.info.basic", "user.info.profile", "user.info.stats", "video.list"];

function tokenPayload(payload, previous = {}) {
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || previous.refresh_token,
    token_type: payload.token_type || "Bearer",
    scope: scopesAsString(payload.scope || previous.scope),
    expiry_date: expiryFromSeconds(payload.expires_in)
  };
}

export function createTikTokProvider({
  clientId,
  clientSecret,
  redirectUri,
  fetchImpl = globalThis.fetch
}) {
  const configured = Boolean(clientId && clientSecret && redirectUri);

  async function refresh(tokens) {
    if (!isExpiring(tokens) || !tokens.refresh_token) return tokens;
    const body = new URLSearchParams({
      client_key: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token
    });
    const payload = await requestJson(fetchImpl, "https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    return tokenPayload(payload, tokens);
  }

  return {
    slug: "tiktok",
    configured,
    pkce: true,
    getAuthorizationUrl(state, { codeChallenge } = {}) {
      if (!configured) throw new Error("TikTok OAuth no esta configurado.");
      const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
      url.searchParams.set("client_key", clientId);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", DEFAULT_SCOPES.join(","));
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      if (codeChallenge) {
        url.searchParams.set("code_challenge", codeChallenge);
        url.searchParams.set("code_challenge_method", "S256");
      }
      return url.toString();
    },
    async exchangeCode(code, { codeVerifier } = {}) {
      const body = new URLSearchParams({
        client_key: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri
      });
      if (codeVerifier) body.set("code_verifier", codeVerifier);
      const payload = await requestJson(fetchImpl, "https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      return tokenPayload(payload);
    },
    async fetchData(inputTokens) {
      const tokens = await refresh(inputTokens);
      const userFields = [
        "open_id", "union_id", "avatar_url", "display_name", "bio_description",
        "profile_deep_link", "username", "is_verified", "follower_count",
        "following_count", "likes_count", "video_count"
      ].join(",");
      const userPayload = await requestJson(
        fetchImpl,
        "https://open.tiktokapis.com/v2/user/info/?fields=" + userFields,
        { headers: bearerHeaders(tokens.access_token) }
      );
      const videoFields = [
        "id", "title", "video_description", "duration", "cover_image_url",
        "share_url", "create_time", "like_count", "comment_count", "share_count", "view_count"
      ].join(",");
      const videoPayload = await requestJson(
        fetchImpl,
        "https://open.tiktokapis.com/v2/video/list/?fields=" + videoFields,
        {
          method: "POST",
          headers: bearerHeaders(tokens.access_token, { "Content-Type": "application/json" }),
          body: JSON.stringify({ max_count: 20 })
        }
      );
      const user = userPayload.data?.user;
      if (!user?.open_id) throw new Error("TikTok no devolvio un perfil autorizado.");
      const syncedAt = new Date().toISOString();
      const metricValues = {
        followers: numeric(user.follower_count),
        following: numeric(user.following_count),
        total_likes: numeric(user.likes_count),
        video_count: numeric(user.video_count)
      };
      return {
        account: {
          externalId: user.open_id,
          name: user.display_name || user.username || "Cuenta de TikTok",
          handle: user.username ? "@" + user.username : null,
          metadata: {
            avatar: user.avatar_url || null,
            bio: user.bio_description || "",
            profileUrl: user.profile_deep_link || null,
            verified: Boolean(user.is_verified),
            unionId: user.union_id || null
          }
        },
        metrics: Object.entries(metricValues)
          .filter(([, value]) => value !== null)
          .map(([key, value]) => ({ key, value, recordedAt: syncedAt })),
        posts: (videoPayload.data?.videos || []).map((video) => ({
          externalId: String(video.id),
          publishedAt: video.create_time
            ? new Date(Number(video.create_time) * 1000).toISOString()
            : syncedAt,
          contentType: "video",
          description: video.video_description || video.title || "Video de TikTok",
          metrics: {
            views: numeric(video.view_count),
            likes: numeric(video.like_count),
            comments: numeric(video.comment_count),
            shares: numeric(video.share_count),
            reach: null,
            impressions: null
          },
          raw: { shareUrl: video.share_url || null, duration: numeric(video.duration) }
        })),
        tokens,
        syncedAt
      };
    }
  };
}
