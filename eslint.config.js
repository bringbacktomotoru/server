export default [
  {
    ignores: ["node_modules/**", "public/**"],
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        console: "readonly",
        crypto: "readonly",
        fetch: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        URL: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        atob: "readonly",
        btoa: "readonly",
        Uint8Array: "readonly",
        Uint32Array: "readonly",
        DataView: "readonly",
        ArrayBuffer: "readonly",
        structuredClone: "readonly",
        FormData: "readonly",
        process: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-constant-condition": "error",
      eqeqeq: ["error", "always"],
    },
  },
];
