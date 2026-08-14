import { SideGlanceController } from "../../src/core/controller.ts";
import { FileSideGlanceStore } from "../../src/core/store.ts";

const [directory, writerId, countText] = process.argv.slice(2);
if (!directory || !writerId || !countText) {
  throw new Error("Expected directory, writer ID, and event count.");
}

const controller = new SideGlanceController(
  new FileSideGlanceStore({ directory }),
);
const count = Number.parseInt(countText, 10);

for (let generation = 1; generation <= count; generation += 1) {
  await controller.submit({
    v: 1,
    eventId: `${writerId}-${generation}`,
    source: "generic",
    sessionId: writerId,
    kind: "turn.started",
    occurredAt: generation,
    generation,
    turnId: `${writerId}-turn-${generation}`,
    confidence: "wrapper",
    target: { surfaceId: "test:shared" },
  });
}
