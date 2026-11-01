import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pruebas unitarias: no necesitan base de datos. Las de API tienen su propia configuración.
    include: ["test/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/liquidacion/**/*.ts"],
      reporter: ["text", "html"],
      // El caso exige al menos 70 % en el módulo de liquidación (D5).
      thresholds: { statements: 70, branches: 70, functions: 70, lines: 70 },
    },
  },
});
