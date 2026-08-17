import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("the header places an accessible icon-only GitHub action after Install", async () => {
  const [page, css] = await Promise.all([
    read("app/page.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(
    page,
    /className="minimal-header-actions minimal-page-enter minimal-page-enter-actions gap-header-actions-gap"/u
  );
  assert.match(page, /aria-label="View Side Glance on GitHub"/u);
  assert.match(page, /href="https:\/\/github\.com\/AndrewUlloa\/side-glance"/u);
  assert.match(page, /target="_blank"/u);
  assert.match(page, /rel="noreferrer"/u);

  const githubAction = page.match(
    /<a(?=[^>]*aria-label="View Side Glance on GitHub")[^>]*>[\s\S]*?<\/a>/u
  )?.[0];
  assert.ok(githubAction, "missing GitHub action");
  assert.match(githubAction, /<svg/u);
  assert.match(githubAction, /<span className="sr-only">GitHub<\/span>/u);
  assert.doesNotMatch(githubAction, /<span(?! className="sr-only")/u);
  assert.ok(
    page.indexOf("<InstallButton") <
      page.indexOf('aria-label="View Side Glance on GitHub"'),
    "GitHub action should appear immediately after Install"
  );

  const expectedTokens = [
    "--spacing-header-actions-gap: 0.5rem",
    "--spacing-header-icon-button: 2rem",
  ] as const;
  for (const token of expectedTokens) {
    assert.ok(
      css.includes(token),
      `missing Tailwind header action token: ${token}`
    );
  }
  assert.match(page, /gap-header-actions-gap/u);
  assert.match(page, /size-header-icon-button/u);
  assert.match(css, /\.minimal-github:focus-visible/u);
});
