import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/serveur.ts"],
    // Les parcours partagent la base et les compteurs Redis : les jouer en
    // parallèle rendrait la limitation de tentatives non déterministe.
    fileParallelism: false,
    // La suite fonctionnelle parle à une base et à un cache hébergés au loin : un
    // parcours enchaîne facilement quinze allers-retours réseau. À 20 s, deux tests
    // échouaient un jour sur deux sans que le code ait changé — un test qui tombe
    // au hasard ne protège plus de rien, il apprend seulement à ignorer le rouge.
    testTimeout: 45_000,
    hookTimeout: 60_000,
  },
});
