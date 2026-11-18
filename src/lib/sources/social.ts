// Social, video and livestream sources.

import { env, envList, getJson, type Source } from './core';
import { metricool } from './metricool';

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

export const facebook: Source = {
  id: 'facebook',
  name: 'Facebook page',
  category: 'social',
  placeholder: 'No direct connector. Connect the Facebook page to your Metricool brand (the Metricool source then reports it), or log a monthly export in data/manual/facebook-export.csv.',
};

const social: Source[] = [youtube, metricool, facebook];
export default social;
export { metricool };
