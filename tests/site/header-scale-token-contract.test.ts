import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("header scale is expressed as Tailwind theme tokens and consumed as utilities", async () => {
  const [page, installButton, css] = await Promise.all([
    read("app/page.tsx"),
    read("app/components/InstallButton.tsx"),
    read("app/globals.css"),
  ]);

  const expectedTokens = [
    "--spacing-site-gutter: clamp(1.5rem, 7.937vw, 7.5rem)",
    "--spacing-page-block: clamp(1.5rem, 2.778vw, 2.5rem)",
    "--spacing-site-header: 3.25rem",
    "--spacing-brand-mark-width: 2.1875rem",
    "--spacing-brand-mark-height: 1.5rem",
    "--spacing-brand-gap: 0.4375rem",
    "--spacing-header-action-icon: 1rem",
    "--spacing-header-action-gap: 0.375rem",
    "--spacing-header-action-x: 0.75rem",
    "--spacing-header-action-y: 0.5rem",
    "--text-brand: 1.5rem",
    "--text-header-action: 1rem",
    "--tracking-brand: -0.03em",
    "--radius-header-action: 9999px",
  ] as const;

  assert.match(css, /@theme\s*\{/u);
  for (const token of expectedTokens) {
    assert.ok(css.includes(token), `missing Tailwind header token: ${token}`);
  }

  assert.match(
    page,
    /className="minimal-home gap-layout-stack px-site-gutter"/u
  );
  assert.match(page, /className="minimal-header h-site-header"/u);
  assert.match(
    page,
    /className="minimal-brand gap-brand-gap text-brand tracking-brand"/u
  );
  assert.match(page, /className="h-brand-mark-height w-brand-mark-width"/u);

  assert.match(
    installButton,
    /className="minimal-install rounded-header-action text-header-action!"/u
  );
  assert.match(
    installButton,
    /className="minimal-install-inner px-header-action-x py-header-action-y"/u
  );
  assert.match(
    installButton,
    /className="minimal-install-state gap-header-action-gap"/u
  );
  assert.match(installButton, /className="size-header-action-icon"/u);

  assert.doesNotMatch(css, /padding:\s*40px 120px/u);
  assert.doesNotMatch(css, /font-size:\s*36px/u);
  assert.doesNotMatch(css, /\.minimal-install-inner\s*\{[^}]*padding:/u);
});
