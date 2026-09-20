import { google } from "googleapis";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly"
];

const MAX_UPLOAD_PAGES = 4;

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function dateDaysAgo(days) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  return value;
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

export function normalizeYouTubeData({ channel, videos, analytics, syncedAt }) {
  const accountMetrics = [];
  const statistics = channel.statistics || {};
  const currentMetrics = {
    subscribers: statistics.hiddenSubscriberCount ? null : numeric(statistics.subscriberCount),
    total_views: numeric(statistics.viewCount),
    video_count: numeric(statistics.videoCount)
  };
  for (const [key, value] of Object.entries(currentMetrics)) {
    if (value !== null) accountMetrics.push({ key, value, recordedAt: syncedAt });
  }

  const headers = (analytics.columnHeaders || []).map((header) => header.name);
  for (const row of analytics.rows || []) {
    const values = Object.fromEntries(headers.map((header, index) => [header, row[index]]));
    const recordedAt = values.day ? values.day + "T00:00:00.000Z" : syncedAt;
    for (const key of ["views", "estimatedMinutesWatched", "subscribersGained", "subscribersLost", "likes", "comments", "shares"]) {
      const value = numeric(values[key]);
      if (value !== null) accountMetrics.push({ key: "analytics_" + key, value, recordedAt });
    }
  }

  return {
    account: {
      externalId: channel.id,
      name: channel.snippet?.title || "Canal de YouTube",
      handle: channel.snippet?.customUrl || null,
      metadata: {
        description: channel.snippet?.description || "",
        country: channel.snippet?.country || null,
        thumbnail: channel.snippet?.thumbnails?.medium?.url || channel.snippet?.thumbnails?.default?.url || null,
        uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads || null,
        hiddenSubscriberCount: Boolean(statistics.hiddenSubscriberCount),
        source: "youtube_api"
      }
    },
    metrics: accountMetrics,
    posts: videos.map((video) => ({
      externalId: video.id,
      publishedAt: video.snippet?.publishedAt,
      contentType: "video",
      description: video.snippet?.title || "Video de YouTube",
      metrics: {
        views: numeric(video.statistics?.viewCount),
        likes: numeric(video.statistics?.likeCount),
        comments: numeric(video.statistics?.commentCount),
        reach: null,
        impressions: null
      },
      raw: video
    })).filter((video) => video.externalId && video.publishedAt)
  };
}

export function createYouTubeProvider({ clientId, clientSecret, redirectUri }) {
  const configured = Boolean(clientId && clientSecret && redirectUri);

  function oauthClient() {
    if (!configured) throw Object.assign(new Error("La integracion de YouTube no esta configurada."), { code: "youtube_not_configured" });
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  return {
    platform: "youtube",
    configured,
    scopes: YOUTUBE_SCOPES,
    getAuthorizationUrl(state) {
      return oauthClient().generateAuthUrl({
        access_type: "offline",
        include_granted_scopes: true,
        prompt: "consent",
        scope: YOUTUBE_SCOPES,
        state
      });
    },
    async exchangeCode(code) {
      const client = oauthClient();
      const { tokens } = await client.getToken(code);
      return tokens;
    },
    async fetchData(credentials) {
      const client = oauthClient();
      client.setCredentials(credentials);
      let refreshedTokens = { ...credentials };
      client.on("tokens", (tokens) => {
        refreshedTokens = { ...refreshedTokens, ...tokens };
      });

      const youtube = google.youtube({ version: "v3", auth: client });
      const channelResponse = await youtube.channels.list({
        mine: true,
        part: ["snippet", "statistics", "contentDetails"]
      });
      const channel = channelResponse.data.items?.[0];
      if (!channel) throw Object.assign(new Error("La cuenta autorizada no tiene un canal de YouTube disponible."), { code: "youtube_channel_missing" });

      const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
      const videoIds = [];
      if (uploadsPlaylistId) {
        let pageToken;
        for (let page = 0; page < MAX_UPLOAD_PAGES; page += 1) {
          const playlistResponse = await youtube.playlistItems.list({
            playlistId: uploadsPlaylistId,
            part: ["contentDetails"],
            maxResults: 50,
            pageToken
          });
          for (const item of playlistResponse.data.items || []) {
            if (item.contentDetails?.videoId) videoIds.push(item.contentDetails.videoId);
          }
          pageToken = playlistResponse.data.nextPageToken;
          if (!pageToken) break;
        }
      }

      const videos = [];
      for (const ids of chunk(videoIds, 50)) {
        const videoResponse = await youtube.videos.list({
          id: ids,
          part: ["snippet", "statistics", "contentDetails"]
        });
        videos.push(...(videoResponse.data.items || []));
      }

      let analytics = { columnHeaders: [], rows: [] };
      try {
        const analyticsApi = google.youtubeAnalytics({ version: "v2", auth: client });
        const analyticsResponse = await analyticsApi.reports.query({
          ids: "channel==MINE",
          startDate: isoDate(dateDaysAgo(30)),
          endDate: isoDate(dateDaysAgo(1)),
          dimensions: "day",
          metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost,likes,comments,shares",
          sort: "day"
        });
        analytics = analyticsResponse.data;
      } catch (error) {
        if (![400, 403].includes(Number(error?.response?.status))) throw error;
      }

      const syncedAt = new Date().toISOString();
      return {
        ...normalizeYouTubeData({ channel, videos, analytics, syncedAt }),
        tokens: { ...client.credentials, ...refreshedTokens },
        syncedAt
      };
    }
  };
}
