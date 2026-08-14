#!/usr/bin/env node

import { main } from "./index.ts";

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `side-glance: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
