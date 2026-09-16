import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/serveur.ts"],
    // Les parcours partagent la base et les compteurs Redis : les jouer en
    // parallèle rendrait la limitation de tentatives non déterministe.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
