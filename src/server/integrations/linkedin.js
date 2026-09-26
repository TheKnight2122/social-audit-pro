import { expiryFromSeconds, numeric, requestJson, scopesAsString } from "./provider-http.js";

const LINKEDIN_SCOPES = ["openid", "profile", "rw_organization_admin", "r_organization_social"];

function localizedName(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  const first = Object.values(value.localized || {})[0];
  return first || value.preferredLocale?.language || null;
}

function linkedinDate(value, fallback) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return fallback;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export function createLinkedInProvider({
  clientId,
  clientSecret,
  redirectUri,
  apiVersion = "202606",
  fetchImpl = globalThis.fetch
}) {
  const configured = Boolean(clientId && clientSecret && redirectUri);

  function headers(accessToken) {
    return {
      Authorization: "Bearer " + accessToken,
      "LinkedIn-Version": apiVersion,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json"
    };
  }

  return {
    slug: "linkedin",
    configured,
    pkce: false,
    getAuthorizationUrl(state) {
      if (!configured) throw new Error("LinkedIn OAuth no esta configurado.");
      const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
      return url.toString();
    },
    async exchangeCode(code) {
      const payload = await requestJson(fetchImpl, "https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret
        })
      });
      return {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        token_type: "Bearer",
        scope: scopesAsString(payload.scope || LINKEDIN_SCOPES),
        expiry_date: expiryFromSeconds(payload.expires_in)
      };
    },
    async fetchData(tokens) {
      const requestHeaders = headers(tokens.access_token);
      const aclUrl = new URL("https://api.linkedin.com/rest/organizationAcls");
      aclUrl.searchParams.set("q", "roleAssignee");
      aclUrl.searchParams.set("role", "ADMINISTRATOR");
      aclUrl.searchParams.set("state", "APPROVED");
      aclUrl.searchParams.set("count", "10");
      const acls = await requestJson(fetchImpl, aclUrl, { headers: requestHeaders });
      const organizationUrn = acls.elements?.[0]?.organization;
      if (!organizationUrn) {
        throw Object.assign(
          new Error("LinkedIn no devolvio una pagina administrada. La aplicacion necesita acceso a Community Management."),
          { statusCode: 400 }
        );
      }
      const organizationId = String(organizationUrn).split(":").pop();
      const organization = await requestJson(
        fetchImpl,
        "https://api.linkedin.com/rest/organizations/" + encodeURIComponent(organizationId),
        { headers: requestHeaders }
      );
      const networkSize = await requestJson(
        fetchImpl,
        "https://api.linkedin.com/rest/networkSizes/" + encodeURIComponent(organizationUrn) + "?edgeType=COMPANY_FOLLOWED_BY_MEMBER",
        { headers: requestHeaders }
      );
      const postsUrl = new URL("https://api.linkedin.com/rest/posts");
      postsUrl.searchParams.set("author", organizationUrn);
      postsUrl.searchParams.set("q", "author");
      postsUrl.searchParams.set("count", "50");
      postsUrl.searchParams.set("sortBy", "LAST_MODIFIED");
      const postsPayload = await requestJson(fetchImpl, postsUrl, { headers: requestHeaders });
      const statisticsUrl = new URL("https://api.linkedin.com/rest/organizationalEntityShareStatistics");
      statisticsUrl.searchParams.set("q", "organizationalEntity");
      statisticsUrl.searchParams.set("organizationalEntity", organizationUrn);
      const statisticsPayload = await requestJson(fetchImpl, statisticsUrl, { headers: requestHeaders });
      const totals = statisticsPayload.elements?.[0]?.totalShareStatistics || {};
      const syncedAt = new Date().toISOString();
      const metricValues = {
        followers: numeric(networkSize.firstDegreeSize),
        impressions: numeric(totals.impressionCount),
        unique_impressions: numeric(totals.uniqueImpressionsCount),
        clicks: numeric(totals.clickCount),
        likes: numeric(totals.likeCount),
        comments: numeric(totals.commentCount),
        shares: numeric(totals.shareCount),
        engagement_rate: numeric(totals.engagement)
      };
      return {
        account: {
          externalId: organizationId,
          name: localizedName(organization.localizedName || organization.name) || "Pagina de LinkedIn",
          handle: organization.vanityName ? "@" + organization.vanityName : null,
          metadata: { organizationUrn, apiVersion }
        },
        metrics: Object.entries(metricValues)
          .filter(([, value]) => value !== null)
          .map(([key, value]) => ({ key, value, recordedAt: syncedAt })),
        posts: (postsPayload.elements || []).map((post) => ({
          externalId: String(post.id),
          publishedAt: linkedinDate(post.publishedAt || post.createdAt, syncedAt),
          contentType: post.content ? Object.keys(post.content)[0] || "post" : "text",
          description: post.commentary || "Publicacion de LinkedIn",
          metrics: { reach: null, impressions: null },
          raw: { lifecycleState: post.lifecycleState || null, visibility: post.visibility || null }
        })),
        tokens,
        syncedAt
      };
    }
  };
}
