import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("trust pages use the shared header and keep informational navigation in the footer", async () => {
  const [layout, trustPage, siteHeader, siteFooter] = await Promise.all([
    read("app/layout.tsx"),
    read("app/components/TrustPage.tsx"),
    read("app/components/SiteHeader.tsx"),
    read("app/components/SiteFooter.tsx"),
  ]);

  assert.doesNotMatch(trustPage, /aria-label="Primary"/u);
  assert.doesNotMatch(trustPage, /trust-navigation/u);
  assert.doesNotMatch(trustPage, /className="trust-eyebrow"/u);
  assert.doesNotMatch(trustPage, /<header\b/u);
  assert.match(layout, /<SiteHeader\s*\/>/u);
  assert.match(siteHeader, /aria-label="Side Glance home"/u);
  assert.match(siteHeader, /<InstallButton/u);
  assert.match(siteHeader, /<GitHubAction\s*\/>/u);

  assert.match(siteFooter, /aria-label="Footer"/u);
  assert.match(siteFooter, /href: "\/about"/u);
  assert.match(siteFooter, /href: "\/contact"/u);
  assert.match(siteFooter, /href: "\/privacy"/u);
});
