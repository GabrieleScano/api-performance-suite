import { defineConfig } from '@playwright/test';

/**
 * API testing configuration.
 *
 * Targets restful-booker, a public REST API designed for test practice.
 * No browser is launched — tests use Playwright's request fixture.
 *
 * @see https://restful-booker.herokuapp.com/apidoc/index.html
 */
export default defineConfig({
  testDir: './tests/api',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'https://restful-booker.herokuapp.com',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  },
  timeout: 30_000,
});
