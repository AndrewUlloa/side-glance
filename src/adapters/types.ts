import type { SideGlanceEvent, SideGlanceTarget } from "../core/protocol.ts";

export interface AdapterContext {
  eventId: string;
  occurredAt: number;
  generation?: number;
  target?: SideGlanceTarget;
  fallbackSessionId?: string;
}

export type AdapterResult = SideGlanceEvent | undefined;
