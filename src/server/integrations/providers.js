import { createFacebookProvider } from "./facebook.js";
import { createInstagramProvider } from "./instagram.js";
import { createLinkedInProvider } from "./linkedin.js";
import { createTikTokProvider } from "./tiktok.js";
import { createXProvider } from "./x.js";
import { createYouTubeProvider } from "./youtube.js";

function callbackUrl(appBaseUrl, platform, explicitValue) {
  if (explicitValue) return explicitValue;
  return new URL("/api/v1/integrations/" + platform + "/oauth/callback", appBaseUrl).toString();
}

export function createProviderRegistry({
  appBaseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:4173",
  fetchImpl = globalThis.fetch
} = {}) {
  const graphVersion = process.env.META_GRAPH_VERSION || "v26.0";
  return {
    youtube: createYouTubeProvider({
      clientId: process.env.YOUTUBE_OAUTH_CLIENT_ID,
      clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
      redirectUri: callbackUrl(appBaseUrl, "youtube", process.env.YOUTUBE_OAUTH_REDIRECT_URI)
    }),
    instagram: createInstagramProvider({
      clientId: process.env.INSTAGRAM_CLIENT_ID || process.env.META_CLIENT_ID,
      clientSecret: process.env.INSTAGRAM_CLIENT_SECRET || process.env.META_CLIENT_SECRET,
      redirectUri: callbackUrl(appBaseUrl, "instagram", process.env.INSTAGRAM_OAUTH_REDIRECT_URI),
      graphVersion,
      fetchImpl
    }),
    facebook: createFacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID || process.env.META_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || process.env.META_CLIENT_SECRET,
      redirectUri: callbackUrl(appBaseUrl, "facebook", process.env.FACEBOOK_OAUTH_REDIRECT_URI),
      graphVersion,
      fetchImpl
    }),
    tiktok: createTikTokProvider({
      clientId: process.env.TIKTOK_CLIENT_ID,
      clientSecret: process.env.TIKTOK_CLIENT_SECRET,
      redirectUri: callbackUrl(appBaseUrl, "tiktok", process.env.TIKTOK_OAUTH_REDIRECT_URI),
      fetchImpl
    }),
    linkedin: createLinkedInProvider({
      clientId: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      redirectUri: callbackUrl(appBaseUrl, "linkedin", process.env.LINKEDIN_OAUTH_REDIRECT_URI),
      apiVersion: process.env.LINKEDIN_API_VERSION || "202606",
      fetchImpl
    }),
    x: createXProvider({
      clientId: process.env.X_CLIENT_ID,
      clientSecret: process.env.X_CLIENT_SECRET,
      redirectUri: callbackUrl(appBaseUrl, "x", process.env.X_OAUTH_REDIRECT_URI),
      apiBaseUrl: process.env.X_API_BASE_URL || "https://api.x.com",
      fetchImpl
    })
  };
}
