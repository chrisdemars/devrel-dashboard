// CLI install metrics from public package registries. None of these need
// credentials; each one stays "not_configured" until you add the package name
// to .env, so you can switch channels on once distribution is decided.

import { env, envList, getJson } from '../lib/source.js';

export const npm = {
  id: 'npm',
  name: 'npm downloads',
  category: 'cli',
  env: [{ name: 'CLI_NPM_PACKAGES', required: true, help: 'Comma-separated npm package names, e.g. @acme/cli' }],
  async collect() {
    const packages = {};
    for (const pkg of envList('CLI_NPM_PACKAGES')) {
      const [week, month] = await Promise.all([
        getJson(`https://api.npmjs.org/downloads/point/last-week/${pkg}`),
        getJson(`https://api.npmjs.org/downloads/range/last-month/${pkg}`),
      ]);
      packages[pkg] = {
        lastWeek: week.downloads,
        lastMonth: month.downloads.reduce((t, d) => t + d.downloads, 0),
        daily: month.downloads,
      };
    }
    return { metrics: { packages } };
  },
};

export const homebrew = {
  id: 'homebrew',
  name: 'Homebrew installs',
  category: 'cli',
  requireAny: ['CLI_HOMEBREW_FORMULAE', 'CLI_HOMEBREW_CASKS'],
  env: [
    { name: 'CLI_HOMEBREW_FORMULAE', required: false, help: 'Comma-separated formula names in homebrew-core' },
    { name: 'CLI_HOMEBREW_CASKS', required: false, help: 'Comma-separated cask names in homebrew-cask' },
  ],
  async collect() {
    const items = {};
    const fetchOne = async (kind, name) => {
      const data = await getJson(`https://formulae.brew.sh/api/${kind}/${name}.json`);
      const installs = data.analytics?.install ?? {};
      items[`${kind}:${name}`] = Object.fromEntries(
        ['30d', '90d', '365d'].map((p) => [p, Object.values(installs[p] ?? {}).reduce((a, b) => a + b, 0)]),
      );
    };
    for (const name of envList('CLI_HOMEBREW_FORMULAE')) await fetchOne('formula', name);
    for (const name of envList('CLI_HOMEBREW_CASKS')) await fetchOne('cask', name);
    return {
      metrics: { items },
      note: 'Only homebrew-core and homebrew-cask publish analytics. A private tap (acme/tap) has no install stats; use GitHub release downloads or the manual installs log instead.',
    };
  },
};

export const pypi = {
  id: 'pypi',
  name: 'PyPI downloads',
  category: 'cli',
  env: [{ name: 'CLI_PYPI_PACKAGES', required: true, help: 'Comma-separated PyPI package names' }],
  async collect() {
    const packages = {};
    for (const pkg of envList('CLI_PYPI_PACKAGES')) {
      const { data } = await getJson(`https://pypistats.org/api/packages/${pkg.toLowerCase()}/recent`);
      packages[pkg] = { lastDay: data.last_day, lastWeek: data.last_week, lastMonth: data.last_month };
    }
    return { metrics: { packages } };
  },
};

export const dockerHub = {
  id: 'docker-hub',
  name: 'Docker Hub pulls',
  category: 'cli',
  env: [{ name: 'CLI_DOCKER_IMAGES', required: true, help: 'Comma-separated namespace/repo, e.g. acme/cli' }],
  async collect() {
    const images = {};
    for (const image of envList('CLI_DOCKER_IMAGES')) {
      const data = await getJson(`https://hub.docker.com/v2/repositories/${image}/`);
      images[image] = { pullsAllTime: data.pull_count, stars: data.star_count };
    }
    return { metrics: { images }, note: 'Docker Hub only reports all-time pulls; compare snapshots to get pulls per period.' };
  },
};

export const github = {
  id: 'github',
  name: 'GitHub repo and release downloads',
  category: 'cli',
  env: [
    { name: 'CLI_GITHUB_REPOS', required: true, help: 'Comma-separated owner/repo for the CLI (and portal, samples, etc.)' },
    { name: 'GITHUB_TOKEN', required: false, help: 'Optional read-only token; needed for private repos and higher rate limits' },
  ],
  async collect() {
    const token = env('GITHUB_TOKEN');
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    const repos = {};
    for (const repo of envList('CLI_GITHUB_REPOS')) {
      const [info, releases] = await Promise.all([
        getJson(`https://api.github.com/repos/${repo}`, headers),
        getJson(`https://api.github.com/repos/${repo}/releases?per_page=100`, headers),
      ]);
      repos[repo] = {
        stars: info.stargazers_count,
        forks: info.forks_count,
        watchers: info.subscribers_count,
        openIssues: info.open_issues_count,
        releaseDownloadsAllTime: releases.reduce(
          (t, r) => t + r.assets.reduce((a, asset) => a + asset.download_count, 0), 0),
        releases: releases.slice(0, 10).map((r) => ({
          tag: r.tag_name,
          publishedAt: r.published_at,
          downloads: r.assets.reduce((a, asset) => a + asset.download_count, 0),
        })),
      };
    }
    return { metrics: { repos }, note: 'Stars and release downloads are all-time totals; compare snapshots for growth.' };
  },
};

export default [npm, homebrew, pypi, dockerHub, github];
