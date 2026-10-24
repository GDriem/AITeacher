import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "backend.spec.ts",
  workers: 1,
  timeout: 120_000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4183", trace: "retain-on-failure", permissions: ["microphone"],
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } },
  webServer: [
    { command: "dotnet run --project ../backend/tests/AITeacher.BrowserHost --no-launch-profile", url: "http://127.0.0.1:5088/health/ready", timeout: 120_000, reuseExistingServer: false },
    { command: "VITE_BACKEND=dotnet VITE_BETA_FEEDBACK_URL=mailto:beta@example.org AITEACHER_BACKEND_URL=http://127.0.0.1:5088 node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4183 --strictPort", url: "http://127.0.0.1:4183", timeout: 30_000, reuseExistingServer: false },
  ],
});
