import { defineConfig } from "vitest/config";

// Pruebas de API contra PostgreSQL real, en una base de datos temporal (conecta_test).
export default defineConfig({
  test: {
    include: ["test/integracion/*.test.ts"],
    globalSetup: ["test/integracion/preparar.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://conecta:cambie_esta_clave@localhost:5432/conecta_test",
      JWT_SECRET: "secreto-solo-para-pruebas",
      NODE_ENV: "test",
    },
  },
});
