import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      // db.ts et env.ts ne sont que du câblage d'infrastructure : les couvrir
      // demanderait une base démarrée sans rien prouver sur le métier.
      exclude: ["src/db.ts", "src/env.ts", "src/index.ts"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
