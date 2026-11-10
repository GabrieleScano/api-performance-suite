import { defineConfig } from '@playwright/test';

/**
 * API testing configuration.
 *
 * Targets restful-booker, an open-source REST API built for test practice.
 * No browser is launched — tests use Playwright's request fixture.
 *
 * BASE_URL selects the instance: CI runs the official Docker image as a service
 * container on http://localhost:3001; locally it defaults to the public sandbox.
 *
 * @see https://restful-booker.herokuapp.com/apidoc/index.html
 */
const BASE_URL = process.env.BASE_URL ?? 'https://restful-booker.herokuapp.com';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  },
  timeout: 30_000,
});
