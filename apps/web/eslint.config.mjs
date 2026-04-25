import nextVitals from "eslint-config-next/core-web-vitals.js";

/** @type {import("eslint").Linter.Config[]} */
const config = Array.isArray(nextVitals) ? nextVitals : [nextVitals];

export default config;
