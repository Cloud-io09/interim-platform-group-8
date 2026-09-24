import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Bibliothèques tierces copiées telles quelles, minifiées : le moteur de
    // reconnaissance de caractères et le lecteur PDF, servis au navigateur. Ce n'est
    // pas notre code, et le linter y relevait des milliers d'avertissements.
    "public/ocr/**",
    "public/pdf/**",
    "coverage/**",
  ]),
  {
    rules: {
      // Liens `<a>` plutôt que `<Link>`, délibérément : chaque navigation recharge la
      // page et relit la session côté serveur. Après une déconnexion, un changement
      // de rôle ou un déblocage, aucun écran ne reste servi depuis un état périmé.
      "@next/next/no-html-link-for-pages": "off",
      // Règle récente de React 19 : elle signale le motif « réinitialiser l'état
      // puis charger » dans un effet, que les formulaires emploient sciemment.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Les tests lisent des réponses JSON dont la forme est vérifiée par les
    // assertions elles-mêmes.
    files: ["test/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);

export default eslintConfig;
