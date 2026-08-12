import type { SignalEvent, SignalState } from "./protocol.ts";
import { reduceSignalEvent } from "./reducer.ts";
import type { FileSignalStore } from "./store.ts";

export class SignalController {
  private readonly store: FileSignalStore;

  constructor(store: FileSignalStore) {
    this.store = store;
  }

  async submit(event: SignalEvent): Promise<SignalState> {
    return this.store.update((state) => reduceSignalEvent(state, event));
  }
}
