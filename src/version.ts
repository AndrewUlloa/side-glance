declare const SIDE_GLANCE_BUILD_VERSION: string;

export const SIDE_GLANCE_VERSION =
  typeof SIDE_GLANCE_BUILD_VERSION === "string" ? SIDE_GLANCE_BUILD_VERSION : "development";
