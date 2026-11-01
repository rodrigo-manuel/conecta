import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "html"],
      // El caso exige al menos 70 % en el módulo de liquidación (D5).
      thresholds: {
        "src/liquidacion/**": { statements: 70, branches: 70, functions: 70, lines: 70 },
      },
    },
  },
});
