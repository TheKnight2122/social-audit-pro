import { expiryFromSeconds, numeric, requestJson, scopesAsString } from "./provider-http.js";

const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "read_insights"
];

function graphUrl(graphBaseUrl, path, parameters = {}) {
  const url = new URL(graphBaseUrl + path);
  for (const [key, value] of Object.entries(parameters)) {
    if (value != null) url.searchParams.set(key, value);
  }
  return url;
}

export function createFacebookProvider({
  clientId,
  clientSecret,
  redirectUri,
  graphVersion = "v26.0",
  fetchImpl = globalThis.fetch
}) {
  const configured = Boolean(clientId && clientSecret && redirectUri);
  const graphBaseUrl = "https://graph.facebook.com/" + graphVersion;

  return {
    slug: "facebook",
    configured,
    pkce: false,
    getAuthorizationUrl(state) {
      if (!configured) throw new Error("Facebook OAuth no esta configurado.");
      const url = new URL("https://www.facebook.com/" + graphVersion + "/dialog/oauth");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("scope", FACEBOOK_SCOPES.join(","));
      url.searchParams.set("response_type", "code");
      return url.toString();
    },
    async exchangeCode(code) {
      const shortToken = await requestJson(fetchImpl, graphUrl(graphBaseUrl, "/oauth/access_token", {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code
      }));
      const longToken = await requestJson(fetchImpl, graphUrl(graphBaseUrl, "/oauth/access_token", {
        grant_type: "fb_exchange_token",
        client_id: clientId,
        client_secret: clientSecret,
        fb_exchange_token: shortToken.access_token
      }));
      return {
        access_token: longToken.access_token,
        token_type: longToken.token_type || "Bearer",
        scope: FACEBOOK_SCOPES.join(" "),
        expiry_date: expiryFromSeconds(longToken.expires_in)
      };
    },
    async fetchData(inputTokens) {
      let page;
      try {
        const pages = await requestJson(fetchImpl, graphUrl(graphBaseUrl, "/me/accounts", {
          fields: "id,name,username,access_token,fan_count,followers_count,picture,link",
          limit: "100",
          access_token: inputTokens.access_token
        }));
        page = pages.data?.[0];
      } catch {
        page = null;
      }
      if (!page) {
        page = await requestJson(fetchImpl, graphUrl(graphBaseUrl, "/me", {
          fields: "id,name,username,fan_count,followers_count,picture,link",
          access_token: inputTokens.access_token
        }));
      }
      if (!page?.id) throw new Error("Facebook no devolvio una pagina administrada.");
      const pageToken = page.access_token || inputTokens.access_token;
      const postsPayload = await requestJson(fetchImpl, graphUrl(graphBaseUrl, "/" + page.id + "/posts", {
        fields: "id,message,created_time,permalink_url,shares,reactions.limit(0).summary(true),comments.limit(0).summary(true)",
        limit: "50",
        access_token: pageToken
      }));
      const syncedAt = new Date().toISOString();
      const followers = numeric(page.followers_count ?? page.fan_count);
      const metrics = [];
      if (followers !== null) metrics.push({ key: "followers", value: followers, recordedAt: syncedAt });
      const fanCount = numeric(page.fan_count);
      if (fanCount !== null) metrics.push({ key: "page_likes", value: fanCount, recordedAt: syncedAt });
      return {
        account: {
          externalId: String(page.id),
          name: page.name || "Pagina de Facebook",
          handle: page.username ? "@" + page.username : null,
          metadata: {
            avatar: page.picture?.data?.url || null,
            pageUrl: page.link || null
          }
        },
        metrics,
        posts: (postsPayload.data || []).map((post) => ({
          externalId: String(post.id),
          publishedAt: post.created_time || syncedAt,
          contentType: "post",
          description: post.message || "Publicacion de Facebook",
          metrics: {
            likes: numeric(post.reactions?.summary?.total_count),
            comments: numeric(post.comments?.summary?.total_count),
            shares: numeric(post.shares?.count),
            reach: null,
            impressions: null
          },
          raw: { permalink: post.permalink_url || null }
        })),
        tokens: {
          ...inputTokens,
          access_token: pageToken,
          scope: scopesAsString(inputTokens.scope || FACEBOOK_SCOPES),
          expiry_date: inputTokens.expiry_date
        },
        syncedAt
      };
    }
  };
}
