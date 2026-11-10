// Example org config, used until you create your own.
//
// To set up your organization, copy this file to config/devrel.config.ts and
// edit the copy. It is picked up automatically. Only `org.name` is required;
// everything else has a default (see src/lib/config/schema.ts).
//
// Keep secrets (API keys, tokens) out of this file. They belong in .env.

import { defineConfig } from '@/lib/config/schema';

export default defineConfig({
  org: {
    name: 'Acme',
    url: 'https://example.com',
    // logo: { src: '/logo.svg', alt: 'Acme' },
  },

  theme: {
    // 'default', or a preset you added (see src/theme/default.css).
    preset: 'default',
    // Fonts are optional; the system font is used for anything left out.
    // fonts: {
    //   heading: 'Inter',
    //   body: 'Inter',
    //   mono: 'JetBrains Mono',
    //   stylesheets: ['https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=JetBrains+Mono:wght@400..700&display=swap'],
    // },
  },

  sources: {
    // 'all', or a list of source ids from `npm run status`,
    // e.g. ['npm', 'github', 'ga4', 'youtube', 'conferences'].
    enabled: 'all',
  },

  // Public package and repo names to track. A source stays "not_configured"
  // until it has at least one name.
  packages: {
    npm: [], // e.g. ['@acme/cli']
    homebrewFormulae: [],
    homebrewCasks: [],
    pypi: [],
    docker: [], // e.g. ['acme/cli']
    github: [], // e.g. ['acme/cli', 'acme/sdk']
  },

  ga4: {
    // e.g. ['product_click', 'demo_request', 'install_click'].
    // Leave empty to report every event marked as a key event.
    keyEvents: [],
  },

  launch: {
    date: '2026-12-15',
    label: 'Acme CLI launch',
  },

  // Rename any page. Pages you leave out keep their default label.
  pages: {
    launch: 'Product launch',
  },

  tags: {
    // builtIn: the activity types. The defaults cover most teams.
    suggested: ['launch', 'npm', 'docs'],
  },
});
