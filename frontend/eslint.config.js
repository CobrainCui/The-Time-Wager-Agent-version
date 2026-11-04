import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
    { ignores: ["dist/**", "scripts/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...Object.fromEntries(
        // 棘轮：先阻断 warning 增长（package.json --max-warnings 27），
        // 再分批把 react-hooks 规则从 warn 提升为 error。
        Object.entries(reactHooks.configs.recommended.rules ?? {}).map(([key]) => [key, "warn"])
      ),
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "no-unused-vars": "off",
      "no-control-regex": "warn",
    },
  }
);
