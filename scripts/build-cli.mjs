import { chmod, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repository = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(repository, "packages/cli/dist/signal.mjs");
const manifest = JSON.parse(
  await readFile(path.join(repository, "packages/cli/package.json"), "utf8"),
);

await mkdir(path.dirname(output), { recursive: true });
await build({
  entryPoints: [path.join(repository, "src/cli/entry.ts")],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  define: { SIGNAL_BUILD_VERSION: JSON.stringify(manifest.version) },
  packages: "bundle",
  legalComments: "none",
  sourcemap: false,
});
await chmod(output, 0o755);
