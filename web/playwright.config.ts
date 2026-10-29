import { defineConfig, devices } from "@playwright/test";

const all = {
  chromium: devices["Desktop Chrome"],
  firefox: devices["Desktop Firefox"],
  webkit: devices["Desktop Safari"],
};

// All three browsers by default. E2E_BROWSERS=chromium,webkit leaves one out, for a machine where it cannot launch.
const wanted = process.env["E2E_BROWSERS"]?.split(",").map((name) => name.trim());
const browsers = Object.entries(all).filter(([name]) => wanted === undefined || wanted.includes(name));

// Frame-budget tests are tagged @budget in their title. They measure frame gaps, and a worker that
// shares the machine with other parallel workers makes those gaps longer. So they run in their own
// projects, one worker each, one project at a time, after every functional project has finished.
// A failing functional project, or an earlier budget project, stops the later budget projects.
const functional = browsers.map(([name]) => name);
const budget = browsers.map(([name, device], i) => ({
  name: `${name}-budget`,
  use: { ...device },
  grep: /@budget/,
  workers: 1,
  fullyParallel: false,
  dependencies: [...functional, ...browsers.slice(0, i).map(([earlier]) => `${earlier}-budget`)],
}));

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:5173", trace: "on-first-retry" },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env["CI"],
  },
  projects: [
    ...browsers.map(([name, device]) => ({ name, use: { ...device }, grepInvert: /@budget/ })),
    ...budget,
  ],
});
