import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("serves substantial site media from immutable R2 URLs without the Vercel image proxy", async () => {
  const [
    layout,
    loadingSequence,
    globals,
    ogStyles,
    siteAssets,
    manifestSource,
    uploadScript,
    packageSource,
  ] = await Promise.all([
    readFile("app/layout.tsx", "utf8"),
    readFile("app/components/LoadingSequence.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
    readFile("app/og-image/og-image.css", "utf8"),
    readFile("app/lib/site-assets.ts", "utf8"),
    readFile("assets/r2-manifest.json", "utf8"),
    readFile("scripts/assets/upload-r2.mjs", "utf8"),
    readFile("package.json", "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource) as {
    assets: Record<
      string,
      {
        bytes: number;
        contentType: string;
        key: string;
        sha256: string;
        sourceBytes: number;
      }
    >;
    bucket: string;
    cacheControl: string;
    defaultOrigin: string;
  };
  const packageManifest = JSON.parse(packageSource) as {
    scripts: Record<string, string>;
  };

  assert.match(siteAssets, /https:\/\/sideglance\.ai/u);
  assert.match(siteAssets, /NEXT_PUBLIC_ASSET_ORIGIN/u);
  assert.match(siteAssets, /r2-manifest\.json/u);
  assert.match(layout, /SITE_ASSETS\.openGraph/u);
  assert.match(layout, /--side-glance-hero-surface/u);
  assert.match(loadingSequence, /SITE_ASSETS\.loadingLife/u);
  assert.match(loadingSequence, /unoptimized/u);
  assert.doesNotMatch(loadingSequence, /\/loading-life-0[1-4]\.png/u);
  assert.match(globals, /var\(--side-glance-hero-surface\)/u);
  assert.doesNotMatch(globals, /url\("\/hero-surface\.png"\)/u);
  assert.match(ogStyles, /var\(--side-glance-hero-surface\)/u);
  assert.doesNotMatch(ogStyles, /url\("\/hero-surface\.png"\)/u);
  assert.equal(manifest.bucket, "side-glance-assets-prod");
  assert.equal(manifest.defaultOrigin, "https://assets.sideglance.ai");
  assert.equal(manifest.cacheControl, "public, max-age=31536000, immutable");
  assert.equal(Object.keys(manifest.assets).length, 6);
  let totalBytes = 0;
  let totalSourceBytes = 0;
  for (const asset of Object.values(manifest.assets)) {
    assert.equal(
      asset.key.match(/\.([a-f\d]{12})\.[a-z\d]+$/u)?.[1],
      asset.sha256.slice(0, 12)
    );
    assert.match(asset.contentType, /^image\/(?:png|webp)$/u);
    assert.ok(asset.bytes <= asset.sourceBytes);
    totalBytes += asset.bytes;
    totalSourceBytes += asset.sourceBytes;
  }
  assert.ok(totalBytes < 1_100_000, `R2 media budget exceeded: ${totalBytes}`);
  assert.ok(totalBytes / totalSourceBytes < 0.11);
  assert.equal(
    packageManifest.scripts["assets:upload:r2"],
    "node scripts/assets/upload-r2.mjs"
  );
  assert.match(uploadScript, /createHash\("sha256"\)/u);
  assert.match(uploadScript, /--cache-control/u);
  assert.match(uploadScript, /shell:\s*false/u);
  assert.match(layout, /NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN/u);
  assert.match(layout, /static\.cloudflareinsights\.com\/beacon\.min\.js/u);

  for (const localAsset of [
    "public/hero-surface.png",
    "public/hero-terminal.png",
    "public/loading-life-01.png",
    "public/loading-life-02.png",
    "public/loading-life-03.png",
    "public/loading-life-04.png",
    "public/og-image.png",
  ]) {
    await assert.rejects(access(localAsset));
  }
});
