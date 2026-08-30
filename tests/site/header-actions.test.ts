import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("the header places an accessible icon-only GitHub action after Install", async () => {
  const [page, githubAction, css] = await Promise.all([
    read("app/page.tsx"),
    read("app/components/GitHubAction.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(
    page,
    /className="minimal-header-actions minimal-page-enter minimal-page-enter-actions gap-header-actions-gap"/u
  );
  assert.match(page, /<GitHubAction\s*\/>/u);
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
    page.indexOf("<InstallButton") < page.indexOf("<GitHubAction"),
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
  assert.match(githubAction, /size-header-icon-button/u);
  assert.match(css, /\.minimal-github:focus-visible/u);
});
