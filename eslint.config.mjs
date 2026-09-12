import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",

    // React rules
    "react-hooks/exhaustive-deps": "warn",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js rules
    // no-img-element: OFF pending the PERF-003 next/image migration (audit v2
    // P2). All 60 current <img> sites are local static assets (/images/*,
    // /uploads/*) with explicit sizing; switching to next/image changes the
    // emitted DOM (wrapper + srcset) and risks layout shifts across every
    // storefront block — it is a dedicated visual-perf task, not lint noise.
    // Re-enable this rule as part of that migration.
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // General JavaScript rules
    "prefer-const": "warn",
    "no-unused-vars": "off", // covered by @typescript-eslint/no-unused-vars
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": ["error", { "allowEmptyCatch": true }],
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "error",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "error",
    "no-undef": "off",
    "no-unreachable": "error",
    "no-useless-escape": "off",
    "no-prototype-builtins": "error",
    "no-throw-literal": "error",
    "eqeqeq": ["error", "always", { "null": "ignore" }], // codebase idiom: `x == null` nullish checks
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills/**", "upload/**", "public/**"]
}];

export default eslintConfig;
