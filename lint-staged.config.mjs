const runBiome = (files) => [
  `biome check --write --no-errors-on-unmatched --files-ignore-unknown=true ${files.map((file) => JSON.stringify(file)).join(" ")}`,
];

export default {
  "app/**/*.{js,jsx,ts,tsx,json,jsonc,css,scss}": runBiome,
  "tests/site/**/*.{js,jsx,ts,tsx,json,jsonc}": runBiome,
  "tests/rendered-html.test.mjs": runBiome,
  "{next.config.ts,postcss.config.mjs}": runBiome,
};
