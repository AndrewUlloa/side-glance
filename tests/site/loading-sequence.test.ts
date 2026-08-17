import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("loading sequence stages four life scenes before revealing the page", async () => {
  const [component, page, tokens, stylesheet] = await Promise.all([
    readFile("app/components/LoadingSequence.tsx", "utf8"),
    readFile("app/page.tsx", "utf8"),
    readFile("app/lib/motion-tokens.ts", "utf8"),
    readFile("app/globals.css", "utf8"),
  ]);

  assert.match(page, /<LoadingSequence\s*\/>/u);
  assert.match(component, /AnimatePresence/u);
  assert.match(component, /useReducedMotion/u);
  assert.match(component, /LINEAR_MOTION/u);
  assert.match(component, /Promise\.race/u);
  assert.match(component, /hasPlayedLoadingSequence/u);
  assert.doesNotMatch(component, /loading-sequence-count/u);
  assert.match(stylesheet, /data-loading-stage="images"/u);

  const lifeScenes = component.match(/\/loading-life-0[1-4]\.png/gu) ?? [];
  assert.equal(lifeScenes.length, 4);

  assert.match(tokens, /loaderImageStagger:\s*0\.16/u);
  assert.match(tokens, /loaderImageLift:\s*24/u);
  assert.match(tokens, /loaderHoldDuration:\s*1/u);
  assert.match(component, /y:\s*LINEAR_MOTION\.loaderImageLift/u);
  assert.doesNotMatch(component, /\bx:\s*-?\d/u);
  assert.match(
    component,
    /const LOADER_IMAGE_DELAY\s*=\s*\n?\s*LINEAR_MOTION\.interactionDuration \+ LINEAR_MOTION\.shineDuration/u
  );
  assert.match(component, /delayChildren:\s*LOADER_IMAGE_DELAY/u);
  assert.match(
    component,
    /const imageSequenceDuration\s*=\s*\n?\s*LOADER_IMAGE_DELAY/u
  );
  assert.match(
    stylesheet,
    /data-loading-stage="images"\][\s\S]*?\.minimal-brand\s*\{[^}]*animation-delay:\s*0\.16s[^}]*animation-duration:\s*0\.5s[^}]*animation-name:\s*minimal-header-brand-enter/u
  );
  assert.match(stylesheet, /@keyframes\s+minimal-header-brand-enter/u);
  assert.doesNotMatch(
    stylesheet,
    /@keyframes\s+minimal-header-brand-enter[\s\S]*?transform:/u
  );
  assert.match(
    stylesheet,
    /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.loading-sequence\s*\{[^}]*display:\s*none/u
  );
  assert.match(
    stylesheet,
    /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.minimal-brand\s*\{[^}]*animation:\s*none/u
  );
});

test("loading sequence is decorative and cannot trap page access", async () => {
  const component = await readFile(
    "app/components/LoadingSequence.tsx",
    "utf8"
  );

  assert.match(component, /aria-hidden="true"/u);
  assert.match(component, /document\.body\.style\.overflow/u);
  assert.match(component, /window\.location\.hash/u);
  assert.match(component, /onExitComplete/u);
});
