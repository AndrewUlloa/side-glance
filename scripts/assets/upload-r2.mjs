import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const sourceDirectory = process.argv[2];

if (!sourceDirectory) {
  throw new Error(
    "Usage: npm run assets:upload:r2 -- /absolute/path/to/optimized-assets"
  );
}

const manifest = JSON.parse(
  await readFile(
    new URL("../../assets/r2-manifest.json", import.meta.url),
    "utf8"
  )
);

const runWrangler = (arguments_) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("wrangler", arguments_, {
      shell: false,
      stdio: "inherit",
    });

    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `wrangler exited with ${code ?? `signal ${signal ?? "unknown"}`}`
        )
      );
    });
  });

for (const asset of Object.values(manifest.assets)) {
  const sourcePath = resolve(sourceDirectory, asset.source);
  const file = await readFile(sourcePath);
  const sha256 = createHash("sha256").update(file).digest("hex");
  const keyHash = asset.key.match(/\.([a-f\d]{12})\.[a-z\d]+$/u)?.[1];

  if (file.byteLength !== asset.bytes) {
    throw new Error(
      `${asset.source} is ${file.byteLength} bytes; expected ${asset.bytes}`
    );
  }

  if (sha256 !== asset.sha256) {
    throw new Error(
      `${asset.source} has SHA-256 ${sha256}; expected ${asset.sha256}`
    );
  }

  if (keyHash !== sha256.slice(0, 12)) {
    throw new Error(
      `${asset.key} must contain the first 12 characters of its SHA-256 digest`
    );
  }

  await runWrangler([
    "r2",
    "object",
    "put",
    `${manifest.bucket}/${asset.key}`,
    "--remote",
    "--file",
    sourcePath,
    "--content-type",
    asset.contentType,
    "--cache-control",
    manifest.cacheControl,
  ]);
}
