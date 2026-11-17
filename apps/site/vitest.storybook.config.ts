import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';
import storybookVite from './.storybook/vite.config.ts';

// Every story renders in Chromium as a test, with its accessibility check.
export default mergeConfig(
  storybookVite,
  defineConfig({
    plugins: [storybookTest({ configDir: '.storybook' })],
    test: {
      name: 'storybook',
      browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] },
    },
  }),
);
