import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Cover kommen von vielen externen Quellen – bewusst normales <img>
    rules: { "@next/next/no-img-element": "off" },
  },
  {
    // Test- und Prüfskripte sind CommonJS und laden Module bewusst per require()
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Gesicherte Builds des Update-Ablaufs auf dem Server
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Arbeitsordner paralleler Agenten (Orca-Worktrees)
    "nq-*/**",
  ]),
]);

export default eslintConfig;
