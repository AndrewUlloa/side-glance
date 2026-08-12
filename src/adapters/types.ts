import type { SignalEvent, SignalTarget } from "../core/protocol.ts";

export interface AdapterContext {
  eventId: string;
  occurredAt: number;
  generation?: number;
  target?: SignalTarget;
  fallbackSessionId?: string;
}

export type AdapterResult = SignalEvent | undefined;
