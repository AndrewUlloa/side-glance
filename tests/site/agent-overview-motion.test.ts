import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("the agent overview reveals once in view without hiding its server markup", async () => {
  const [page, overview] = await Promise.all([
    read("app/page.tsx"),
    read("app/components/AgentOverview.tsx").catch(() => ""),
  ]);

  assert.match(page, /<AgentOverview\s*\/>/u);
  assert.match(overview, /ANIMATION STORYBOARD/u);
  assert.match(overview, /const TIMING\s*=/u);
  assert.match(overview, /const \[stage, setStage\]\s*=\s*useState/u);
  assert.match(overview, /useInView\([^)]*\{\s*once:\s*true/u);
  assert.match(overview, /useReducedMotion\(\)/u);
  assert.match(overview, /initial=\{false\}/u);
  assert.match(overview, /stage\s*>=\s*STAGE\.introduction/u);
  assert.match(overview, /stage\s*>=\s*STAGE\.details/u);
  assert.match(overview, /DETAILS\.items\.map/u);
});

test("the homepage has balanced outer spacing without footer-only padding", async () => {
  const page = await read("app/page.tsx");

  assert.match(
    page,
    /className="minimal-home gap-layout-stack px-site-gutter"/u
  );
  assert.doesNotMatch(page, /className="minimal-home[^"]*\bpb-page-block\b/u);
});
