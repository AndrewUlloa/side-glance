import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("trust pages keep informational navigation in the shared footer", async () => {
  const [trustPage, siteFooter] = await Promise.all([
    read("app/components/TrustPage.tsx"),
    read("app/components/SiteFooter.tsx"),
  ]);

  assert.doesNotMatch(trustPage, /aria-label="Primary"/u);
  assert.doesNotMatch(trustPage, /trust-navigation/u);
  assert.doesNotMatch(trustPage, /className="trust-eyebrow"/u);
  assert.match(trustPage, /aria-label="Side Glance home"/u);

  assert.match(siteFooter, /aria-label="Footer"/u);
  assert.match(siteFooter, /href: "\/about"/u);
  assert.match(siteFooter, /href: "\/contact"/u);
  assert.match(siteFooter, /href: "\/privacy"/u);
});
