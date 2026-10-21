import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const serverEnv = loadEnv(mode, process.cwd(), "AITEACHER_");
  const target = env.VITE_BACKEND === "dotnet" ? (serverEnv.AITEACHER_BACKEND_URL ?? "http://127.0.0.1:5080") : "http://127.0.0.1:8000";
  return {
  base: "/",
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: {
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": {
        target,
        changeOrigin: false,
        ws: true,
      },
      "/static": {
        target,
        changeOrigin: false,
      },
      "/ws": {
        target: "ws://127.0.0.1:8000",
        ws: true,
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    environmentOptions: {
      jsdom: { url: "http://localhost:4173/" },
    },
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    restoreMocks: true,
  },
};
});
