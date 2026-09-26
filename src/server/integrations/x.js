import {
  bearerHeaders,
  expiryFromSeconds,
  isExpiring,
  numeric,
  requestJson,
  scopesAsString
} from "./provider-http.js";

const X_SCOPES = ["tweet.read", "users.read", "offline.access"];

function basicAuthorization(clientId, clientSecret) {
  return "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64");
}

function tokenPayload(payload, previous = {}) {
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || previous.refresh_token,
    token_type: payload.token_type || "Bearer",
    scope: scopesAsString(payload.scope || previous.scope),
    expiry_date: expiryFromSeconds(payload.expires_in)
  };
}

export function createXProvider({
  clientId,
  clientSecret,
  redirectUri,
  fetchImpl = globalThis.fetch,
  apiBaseUrl = "https://api.x.com"
}) {
  const configured = Boolean(clientId && clientSecret && redirectUri);

  async function tokenRequest(body) {
    return requestJson(fetchImpl, apiBaseUrl + "/2/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: basicAuthorization(clientId, clientSecret),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
  }

  async function refresh(tokens) {
    if (!isExpiring(tokens) || !tokens.refresh_token) return tokens;
    const payload = await tokenRequest(new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId
    }));
    return tokenPayload(payload, tokens);
  }

  return {
    slug: "x",
    configured,
    pkce: true,
    getAuthorizationUrl(state, { codeChallenge } = {}) {
      if (!configured) throw new Error("X OAuth no esta configurado.");
      const url = new URL("https://x.com/i/oauth2/authorize");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", X_SCOPES.join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      return url.toString();
    },
    async exchangeCode(code, { codeVerifier } = {}) {
      const payload = await tokenRequest(new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        client_id: clientId
      }));
      return tokenPayload(payload);
    },
    async fetchData(inputTokens) {
      const tokens = await refresh(inputTokens);
      const userPayload = await requestJson(
        fetchImpl,
        apiBaseUrl + "/2/users/me?user.fields=id,name,username,description,profile_image_url,verified,public_metrics",
        { headers: bearerHeaders(tokens.access_token) }
      );
      const user = userPayload.data;
      if (!user?.id) throw new Error("X no devolvio el perfil autorizado.");
      const tweetsUrl = new URL(apiBaseUrl + "/2/users/" + encodeURIComponent(user.id) + "/tweets");
      tweetsUrl.searchParams.set("max_results", "100");
      tweetsUrl.searchParams.set("exclude", "retweets,replies");
      tweetsUrl.searchParams.set("tweet.fields", "id,text,created_at,public_metrics,attachments");
      const tweetsPayload = await requestJson(fetchImpl, tweetsUrl, {
        headers: bearerHeaders(tokens.access_token)
      });
      const syncedAt = new Date().toISOString();
      const metricValues = {
        followers: numeric(user.public_metrics?.followers_count),
        following: numeric(user.public_metrics?.following_count),
        post_count: numeric(user.public_metrics?.tweet_count),
        listed_count: numeric(user.public_metrics?.listed_count)
      };
      return {
        account: {
          externalId: String(user.id),
          name: user.name || user.username || "Cuenta de X",
          handle: user.username ? "@" + user.username : null,
          metadata: {
            description: user.description || "",
            avatar: user.profile_image_url || null,
            verified: Boolean(user.verified)
          }
        },
        metrics: Object.entries(metricValues)
          .filter(([, value]) => value !== null)
          .map(([key, value]) => ({ key, value, recordedAt: syncedAt })),
        posts: (tweetsPayload.data || []).map((tweet) => ({
          externalId: String(tweet.id),
          publishedAt: tweet.created_at || syncedAt,
          contentType: tweet.attachments?.media_keys?.length ? "media" : "text",
          description: tweet.text || "Publicacion de X",
          metrics: {
            views: numeric(tweet.public_metrics?.impression_count),
            impressions: numeric(tweet.public_metrics?.impression_count),
            likes: numeric(tweet.public_metrics?.like_count),
            comments: numeric(tweet.public_metrics?.reply_count),
            shares: numeric(tweet.public_metrics?.retweet_count),
            quotes: numeric(tweet.public_metrics?.quote_count),
            bookmarks: numeric(tweet.public_metrics?.bookmark_count),
            reach: null
          },
          raw: {}
        })),
        tokens,
        syncedAt
      };
    }
  };
}
