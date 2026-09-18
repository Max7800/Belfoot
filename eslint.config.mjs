import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    // Dette historique relevée par l'audit : ces règles React Compiler seront
    // réactivées progressivement pendant le refactor des gros composants.
    rules: {
      "react/no-unescaped-entities": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**"]),
]);
