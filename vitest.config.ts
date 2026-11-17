import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests are added with the code they cover, so a package may have none yet.
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'packages/*/src/**/*.test.ts',
            'apps/*/src/**/*.test.ts',
            'apps/*/scripts/**/*.test.ts',
            'scripts/**/*.test.ts',
          ],
        },
      },
    ],
  },
});
