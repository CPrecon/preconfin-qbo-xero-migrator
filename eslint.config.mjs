import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

const globals = Object.fromEntries(
  [
    "Buffer",
    "FormData",
    "Headers",
    "HTMLFormElement",
    "ReadableStream",
    "React",
    "Request",
    "Response",
    "URL",
    "URLSearchParams",
    "WebAssembly",
    "__dirname",
    "__filename",
    "clearTimeout",
    "console",
    "document",
    "exports",
    "fetch",
    "module",
    "process",
    "require",
    "self",
    "setTimeout",
    "window",
  ].map((name) => [name, "readonly"]),
);

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.open-next/**",
      "**/.vercel/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: false,
        sourceType: "module",
      },
      globals,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-console": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
