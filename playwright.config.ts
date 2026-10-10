import { defineConfig, devices } from "@playwright/test";

// End-to-end tests of the built site, served under /ez.Regex/ as on GitHub Pages (`npm run preview`: a broken
// asset path or worker URL shows here, before the site is published). Python is served with the site, so
// they need no network. WebKit stands in for Safari, which this project's machines cannot run.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 60_000 }, // the first answer waits for Python to load and start
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4173/ez.Regex/", trace: "retain-on-failure" },
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173/ez.Regex/",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
