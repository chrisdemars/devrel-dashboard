import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const orgConfig = path('./config/devrel.config.ts');

export default defineConfig({
  resolve: {
    alias: {
      // Same fallback as the "paths" entry in tsconfig.json.
      '@devrel/config': existsSync(orgConfig) ? orgConfig : path('./devrel.config.example.ts'),
      '@': path('./src'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
  },
});
