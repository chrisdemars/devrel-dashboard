// Social, video and livestream sources.

import { env, envList, getJson, STATUS, type Source } from './core';

interface YoutubeChannels {
  items?: {
    id: string;
    snippet: { title: string };
    statistics: { subscriberCount: string; viewCount: string; videoCount: string };
  }[];
}

export const youtube: Source = {
  id: 'youtube',
  name: 'YouTube channel stats',
  category: 'social',
  env: [
    { name: 'YOUTUBE_API_KEY', required: true, help: 'API key from Google Cloud with "YouTube Data API v3" enabled (public stats only, no OAuth)' },
    { name: 'YOUTUBE_CHANNEL_IDS', required: true, help: 'Comma-separated channel IDs (the UC... ID, not the @handle)' },
  ],
  async collect() {
    const ids = envList('YOUTUBE_CHANNEL_IDS').join(',');
    const data = await getJson<YoutubeChannels>(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${ids}&key=${env('YOUTUBE_API_KEY')}`,
    );
    const channels = Object.fromEntries(
      (data.items ?? []).map((c) => [
        c.id,
        {
          title: c.snippet.title,
          subscribers: Number(c.statistics.subscriberCount),
          views: Number(c.statistics.viewCount),
          videos: Number(c.statistics.videoCount),
        },
      ]),
    );
    return { metrics: { channels } };
  },
};

// Metricool covers X, LinkedIn, YouTube, Twitch and Facebook.
// Its API needs the Advanced plan or above.
export const metricool: Source = {
  id: 'metricool',
  name: 'Metricool (X, LinkedIn, YouTube, Twitch, Facebook)',
  category: 'social',
  env: [
    { name: 'METRICOOL_API_TOKEN', required: true, help: 'Metricool > Settings > API: user token' },
    { name: 'METRICOOL_USER_ID', required: true, help: 'Metricool user ID (shown with the API token)' },
    { name: 'METRICOOL_BLOG_ID', required: true, help: 'Metricool brand ID ("blogId") for your brand' },
  ],
  async collect() {
    // TODO: confirm the endpoints in Metricool's API docs and pull per-network
    // followers, reach, engagement and per-stream viewers.
    return {
      status: STATUS.PLACEHOLDER,
      note: "Credentials found, but the Metricool connector is not written yet. Confirm the API endpoints in Metricool's docs, then implement collect() in src/lib/sources/social.ts.",
    };
  },
};

export const facebook: Source = {
  id: 'facebook',
  name: 'Facebook page',
  category: 'social',
  placeholder: 'No access yet. Connect Facebook to Metricool, or log a monthly export in data/manual/facebook-export.csv.',
};

const social: Source[] = [youtube, metricool, facebook];
export default social;
