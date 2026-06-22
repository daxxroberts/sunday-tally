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
    // Mirrored Tremor v4 reference library (Apache-2.0) — copy FROM it into src/
    // when adopting a component; not part of the app build (targets recharts v2).
    "tremor-library/**",
  ]),
]);

export default eslintConfig;
