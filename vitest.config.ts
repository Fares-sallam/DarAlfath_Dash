import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      // Report periods are calendar days in the store's own timezone.
      env: { TZ: 'Africa/Cairo' },
    },
  })
);
