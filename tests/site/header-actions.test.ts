import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("the shared layout header places an accessible GitHub action after Copy setup", async () => {
  const [layout, siteHeader, trustPage, githubAction, css] = await Promise.all([
    read("app/layout.tsx"),
    read("app/components/SiteHeader.tsx"),
    read("app/components/TrustPage.tsx"),
    read("app/components/GitHubAction.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(layout, /<SiteHeader\s*\/>/u);
  assert.match(
    siteHeader,
    /className="minimal-header-actions minimal-page-enter minimal-page-enter-actions gap-header-actions-gap"/u
  );
  assert.match(siteHeader, /<InstallButton/u);
  assert.match(siteHeader, /<GitHubAction\s*\/>/u);
  assert.doesNotMatch(trustPage, /<header\b/u);
  assert.match(githubAction, /aria-label="View Side Glance on GitHub"/u);
  assert.match(
    githubAction,
    /href="https:\/\/github\.com\/AndrewUlloa\/side-glance"/u
  );
  assert.match(githubAction, /target="_blank"/u);
  assert.match(githubAction, /rel="noreferrer"/u);

  const githubAnchor = githubAction.match(
    /<a(?=[^>]*aria-label="View Side Glance on GitHub")[^>]*>[\s\S]*?<\/a>/u
  )?.[0];
  assert.ok(githubAnchor, "missing GitHub action");
  assert.match(githubAnchor, /<svg/u);
  assert.match(githubAnchor, /<span className="sr-only">GitHub<\/span>/u);
  assert.doesNotMatch(githubAnchor, /<span(?! className="sr-only")/u);
  assert.ok(
    siteHeader.indexOf("<InstallButton") < siteHeader.indexOf("<GitHubAction"),
    "GitHub action should appear immediately after Copy setup"
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
  assert.match(siteHeader, /gap-header-actions-gap/u);
  assert.match(githubAction, /size-header-icon-button/u);
  assert.match(css, /\.minimal-github:focus-visible/u);
});
