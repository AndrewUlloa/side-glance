import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const manifest = JSON.parse(
  await readFile(path.join(repository, "packages/cli/package.json"), "utf8"),
);
const expectedNodeVersion = process.env.SIDE_GLANCE_RELEASE_NODE_VERSION;
if (expectedNodeVersion && process.version !== `v${expectedNodeVersion}`) {
  throw new Error(`Node runtime ${process.version} does not match pinned release runtime v${expectedNodeVersion}`);
}
const target = platformTarget();
const expectedTarget = process.env.SIDE_GLANCE_RELEASE_TARGET;
if (expectedTarget && expectedTarget !== target) {
  throw new Error(`Requested release target ${expectedTarget} does not match native runtime ${target}`);
}
const workDirectory = path.join(repository, "work/release");
const archiveDirectory = path.join(workDirectory, "archive");
const outputDirectory = path.join(repository, "outputs");
const cjsBundle = path.join(workDirectory, "side-glance.cjs");
const seaBlob = path.join(workDirectory, "side-glance.blob");
const executable = path.join(workDirectory, "side-glance");
const seaConfiguration = path.join(workDirectory, "sea-config.json");
const archiveName = `side-glance-v${manifest.version}-${target}.tar.gz`;
const archivePath = path.join(outputDirectory, archiveName);

await rm(workDirectory, { recursive: true, force: true });
await mkdir(path.join(archiveDirectory, "LICENSES"), { recursive: true });
await mkdir(outputDirectory, { recursive: true });

await build({
  entryPoints: [path.join(repository, "src/cli/entry.ts")],
  outfile: cjsBundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  packages: "bundle",
  define: { SIDE_GLANCE_BUILD_VERSION: JSON.stringify(manifest.version) },
  legalComments: "none",
  sourcemap: false,
});

await writeFile(
  seaConfiguration,
  `${JSON.stringify(
    {
      main: cjsBundle,
      output: seaBlob,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
      execArgvExtension: "none",
    },
    null,
    2,
  )}\n`,
  "utf8",
);
await command(process.execPath, ["--experimental-sea-config", seaConfiguration]);
await copyFile(process.execPath, executable);
await chmod(executable, 0o755);

if (process.platform === "darwin") {
  await command("/usr/bin/codesign", ["--remove-signature", executable]);
}

const postject = path.join(
  repository,
  "node_modules/.bin",
  process.platform === "win32" ? "postject.cmd" : "postject",
);
const postjectArguments = [
  executable,
  "NODE_SEA_BLOB",
  seaBlob,
  "--sentinel-fuse",
  "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
];
if (process.platform === "darwin") {
  postjectArguments.push("--macho-segment-name", "NODE_SEA");
}
await command(postject, postjectArguments);

if (process.platform === "darwin") {
  await command("/usr/bin/codesign", ["--sign", "-", executable]);
  await command("/usr/bin/codesign", ["--verify", "--strict", executable]);
}

await copyFile(executable, path.join(archiveDirectory, "side-glance"));
await chmod(path.join(archiveDirectory, "side-glance"), 0o755);
await copyFile(path.join(repository, "README.md"), path.join(archiveDirectory, "README.md"));
await copyFile(path.join(repository, "LICENSE"), path.join(archiveDirectory, "LICENSE"));
const nodeLicense = process.env.SIDE_GLANCE_NODE_LICENSE
  ?? path.resolve(path.dirname(process.execPath), "../LICENSE");
await copyFile(nodeLicense, path.join(archiveDirectory, "LICENSES/node.txt"));
await writeFile(path.join(archiveDirectory, "VERSION"), `${manifest.version}\n`, "utf8");

await rm(archivePath, { force: true });
await command("/usr/bin/tar", [
  "-czf",
  archivePath,
  "-C",
  archiveDirectory,
  "side-glance",
  "README.md",
  "LICENSE",
  "LICENSES/node.txt",
  "VERSION",
]);
const digest = createHash("sha256")
  .update(await readFile(archivePath))
  .digest("hex");
await writeFile(
  path.join(outputDirectory, `${archiveName}.artifact.json`),
  `${JSON.stringify({
    schemaVersion: 1,
    version: manifest.version,
    target,
    filename: archiveName,
    sha256: digest,
    size: (await readFile(archivePath)).byteLength,
  }, null, 2)}\n`,
  "utf8",
);

process.stdout.write(
  `${JSON.stringify({ version: manifest.version, target, executable, archive: archivePath, sha256: digest })}\n`,
);

function platformTarget() {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "darwin-arm64";
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return "darwin-x64.experimental";
  }
  if (process.platform === "linux" && process.arch === "arm64") {
    return "linux-arm64-gnu";
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return "linux-x64-gnu";
  }
  throw new Error(`Unsupported standalone target: ${process.platform}-${process.arch}`);
}

function command(executablePath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, {
      cwd: repository,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(
        new Error(
          `${executablePath} ${args.join(" ")} failed (${signal ?? code}):\n${stderr || stdout}`,
        ),
      );
    });
  });
}
