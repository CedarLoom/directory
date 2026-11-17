import { join } from 'node:path';
import { lingui } from '@lingui/vite-plugin';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The site's own config adds TanStack Start, which builds a whole app; stories need React and the catalog only.
export default defineConfig({
  plugins: [
    viteReact(),
    lingui({ configPath: join(import.meta.dirname, '../lingui.config.ts'), failOnMissing: true, macroTransform: true }),
  ],
});
