import { expiryFromSeconds, numeric, requestJson, scopesAsString } from "./provider-http.js";

const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"];

function graphUrl(baseUrl, path, parameters = {}) {
  const url = new URL(baseUrl + path);
  for (const [key, value] of Object.entries(parameters)) {
    if (value != null) url.searchParams.set(key, value);
  }
  return url;
}

export function createInstagramProvider({
  clientId,
  clientSecret,
  redirectUri,
  graphVersion = "v26.0",
  fetchImpl = globalThis.fetch
}) {
  const configured = Boolean(clientId && clientSecret && redirectUri);
  const graphBaseUrl = "https://graph.instagram.com/" + graphVersion;

  return {
    slug: "instagram",
    configured,
    pkce: false,
    getAuthorizationUrl(state) {
      if (!configured) throw new Error("Instagram OAuth no esta configurado.");
      const url = new URL("https://www.instagram.com/oauth/authorize");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
      url.searchParams.set("state", state);
      url.searchParams.set("enable_fb_login", "0");
      url.searchParams.set("force_authentication", "1");
      return url.toString();
    },
    async exchangeCode(code) {
      const form = new FormData();
      form.set("client_id", clientId);
      form.set("client_secret", clientSecret);
      form.set("grant_type", "authorization_code");
      form.set("redirect_uri", redirectUri);
      form.set("code", code);
      const shortToken = await requestJson(fetchImpl, "https://api.instagram.com/oauth/access_token", {
        method: "POST",
        body: form
      });
      const longToken = await requestJson(fetchImpl, graphUrl(graphBaseUrl, "/access_token", {
        grant_type: "ig_exchange_token",
        client_secret: clientSecret,
        access_token: shortToken.access_token
      }));
      return {
        access_token: longToken.access_token,
        token_type: longToken.token_type || "Bearer",
        scope: INSTAGRAM_SCOPES.join(" "),
        expiry_date: expiryFromSeconds(longToken.expires_in)
      };
    },
    async fetchData(tokens) {
      const profile = await requestJson(fetchImpl, graphUrl(graphBaseUrl, "/me", {
        fields: "user_id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website",
        access_token: tokens.access_token
      }));
      if (!profile?.user_id && !profile?.id) throw new Error("Instagram no devolvio un perfil profesional.");
      const mediaPayload = await requestJson(fetchImpl, graphUrl(graphBaseUrl, "/me/media", {
        fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count",
        limit: "50",
        access_token: tokens.access_token
      }));
      const syncedAt = new Date().toISOString();
      const metricValues = {
        followers: numeric(profile.followers_count),
        following: numeric(profile.follows_count),
        media_count: numeric(profile.media_count)
      };
      return {
        account: {
          externalId: String(profile.user_id || profile.id),
          name: profile.name || profile.username || "Cuenta de Instagram",
          handle: profile.username ? "@" + profile.username : null,
          metadata: {
            avatar: profile.profile_picture_url || null,
            biography: profile.biography || "",
            website: profile.website || null
          }
        },
        metrics: Object.entries(metricValues)
          .filter(([, value]) => value !== null)
          .map(([key, value]) => ({ key, value, recordedAt: syncedAt })),
        posts: (mediaPayload.data || []).map((media) => ({
          externalId: String(media.id),
          publishedAt: media.timestamp || syncedAt,
          contentType: String(media.media_product_type || media.media_type || "media").toLowerCase(),
          description: media.caption || "Publicacion de Instagram",
          metrics: {
            likes: numeric(media.like_count),
            comments: numeric(media.comments_count),
            reach: null,
            impressions: null
          },
          raw: { permalink: media.permalink || null }
        })),
        tokens: { ...tokens, scope: scopesAsString(tokens.scope || INSTAGRAM_SCOPES) },
        syncedAt
      };
    }
  };
}
