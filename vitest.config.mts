import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  test: {
    // env.ts valida process.env ao ser importado; este valor só serve para o import não falhar
    env: {
      DATABASE_URL: "postgresql://localhost:5432/test",
      LOG_LEVEL: "silent",
    },
  },
});
