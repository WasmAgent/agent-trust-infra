// Minimal ESLint flat config — used only by the level:4 no-explicit-any probe.
// Production linting uses biome; this config exists solely to probe for explicit `any` usage.
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: false,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // Probe rule — the only signal we care about at level:4
      "@typescript-eslint/no-explicit-any": "error",
      // Suppress default ESLint noise so only no-explicit-any fires
      "no-warning-comments": "off",
      "no-unused-private-class-members": "off",
      "no-empty": "off",
      "no-constant-condition": "off",
      "no-await-in-loop": "off",
    },
  },
];
