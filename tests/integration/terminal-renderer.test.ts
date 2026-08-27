import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  encodeTerminalPaint,
  encodeTerminalReset,
  renderTerminal,
} from "../../src/renderers/terminal.ts";

const decoder = new TextDecoder();

test("encodes only the expected OSC background, title, and reset bytes", () => {
  assert.equal(
    decoder.decode(encodeTerminalPaint({ wash: "16352f" })),
    "\u001b]11;#16352f\u001b\\",
  );
  assert.equal(
    decoder.decode(
      encodeTerminalPaint({
        wash: "4d3510",
        title: "Side Glance · waiting",
        allowTitle: true,
      }),
    ),
    "\u001b]11;#4d3510\u001b\\\u001b]0;Side Glance · waiting\u001b\\",
  );
  assert.equal(decoder.decode(encodeTerminalReset()), "\u001b]111\u0007");
  assert.equal(
    decoder.decode(encodeTerminalReset({ background: true, title: true })),
    "\u001b]111\u0007\u001b]0;\u001b\\",
  );
});

test("rejects color and title injection before any terminal write", () => {
  assert.throws(
    () => encodeTerminalPaint({ wash: "16352f;\u0007owned" }),
    /color/i,
  );
  assert.throws(
    () =>
      encodeTerminalPaint({
        wash: "16352f",
        title: "safe\u001b]11;#ffffff",
        allowTitle: true,
      }),
    /control/i,
  );
  assert.throws(
    () =>
      encodeTerminalPaint({ wash: "16352f", title: "not opted in" }),
    /opt.in/i,
  );
});

test("rejects regular files, symlinks, missing paths, and unowned devices", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "side-glance-terminal-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const regularPath = path.join(directory, "regular-output");
  const symlinkPath = path.join(directory, "linked-output");
  await writeFile(regularPath, "untouched", { mode: 0o600 });
  await symlink(regularPath, symlinkPath);

  await assert.rejects(
    () => renderTerminal(regularPath, { wash: "16352f" }),
    /character device/i,
  );
  await assert.rejects(
    () => renderTerminal(symlinkPath, { wash: "16352f" }),
    /symbolic link/i,
  );
  await assert.rejects(
    () => renderTerminal(path.join(directory, "missing"), "reset"),
    /does not exist/i,
  );

  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    await assert.rejects(
      () => renderTerminal("/dev/null", { wash: "16352f" }),
      /owned by the current user/i,
    );
  }

  assert.equal(await import("node:fs/promises").then(({ readFile }) => readFile(regularPath, "utf8")), "untouched");
});
