declare const SIGNAL_BUILD_VERSION: string;

export const SIGNAL_VERSION =
  typeof SIGNAL_BUILD_VERSION === "string" ? SIGNAL_BUILD_VERSION : "development";
