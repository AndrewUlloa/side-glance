import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile terminal input avoids iOS focus zoom without disabling page zoom", async () => {
  const [stylesheet, layout] = await Promise.all([
    readFile("app/globals.css", "utf8"),
    readFile("app/layout.tsx", "utf8"),
  ]);

  assert.match(
    stylesheet,
    /@media \(max-width:\s*760px\)[\s\S]*?\.mock-claude-composer input\s*\{[^}]*font-size:\s*16px/u
  );
  assert.doesNotMatch(layout, /maximumScale|userScalable/u);
});
