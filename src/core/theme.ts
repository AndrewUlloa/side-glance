export interface SignalTheme {
  washStops: readonly string[];
  tmuxStops: readonly string[];
  workingWash: string;
  waitingWash: string;
  workingAccent: string;
  waitingAccent: string;
}

export const DEFAULT_SIGNAL_THEME: SignalTheme = {
  washStops: [
    "142e2d",
    "173326",
    "26331b",
    "3a2f16",
    "4d2a12",
    "612418",
    "732018",
  ],
  tmuxStops: [
    "009d89",
    "3fa84e",
    "8fb22e",
    "e0a726",
    "ef7e2a",
    "ee5a39",
    "f33533",
  ],
  workingWash: "16352f",
  waitingWash: "4d3510",
  workingAccent: "009d89",
  waitingAccent: "f0a726",
};
