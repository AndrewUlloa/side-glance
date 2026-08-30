"use client";

import { trackGitHubOpened } from "../lib/analytics-events";

export function GitHubAction() {
  return (
    <a
      aria-label="View Side Glance on GitHub"
      className="minimal-github size-header-icon-button rounded-header-action"
      href="https://github.com/AndrewUlloa/side-glance"
      onClick={trackGitHubOpened}
      rel="noreferrer"
      target="_blank"
    >
      <svg
        aria-hidden="true"
        className="size-header-action-icon"
        viewBox="0 0 24 24"
      >
        <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.02c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.29-5.27-5.68 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18A10.98 10.98 0 0 1 12 6.3c.98 0 1.95.13 2.86.39 2.2-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.41-2.71 5.38-5.29 5.67.42.36.79 1.07.79 2.16v3.07c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
      </svg>
      <span className="sr-only">GitHub</span>
    </a>
  );
}
