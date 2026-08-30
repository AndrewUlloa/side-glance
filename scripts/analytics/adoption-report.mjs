import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const REPOSITORY_API =
  "https://api.github.com/repos/AndrewUlloa/side-glance";
const HOMEBREW_ANALYTICS_API =
  "https://formulae.brew.sh/api/analytics/install-on-request/30d.json";
const HOMEBREW_FORMULA = "andrewulloa/tap/side-glance";
const EVENT_NAMES = [
  "install_command_copied",
  "github_opened",
  "demo_engaged",
];

export async function collectAdoptionSnapshot({
  fetchImpl = fetch,
  period,
  webEvents,
}) {
  validateDate(period.from, "from");
  validateDate(period.to, "to");
  const normalizedWebEvents = normalizeWebEvents(webEvents);
  const npmUrl = `https://api.npmjs.org/downloads/point/${period.from}:${period.to}/side-glance`;

  const [npm, homebrew, repository, releases] = await Promise.all([
    fetchJson(fetchImpl, npmUrl, "npm downloads"),
    fetchJson(fetchImpl, HOMEBREW_ANALYTICS_API, "Homebrew analytics"),
    fetchJson(fetchImpl, REPOSITORY_API, "GitHub repository"),
    fetchJson(
      fetchImpl,
      `${REPOSITORY_API}/releases?per_page=100`,
      "GitHub releases"
    ),
  ]);

  const formula = homebrew.items?.find(
    (item) => item.formula?.toLowerCase() === HOMEBREW_FORMULA
  );

  return {
    period,
    webEvents: normalizedWebEvents,
    npm: {
      downloads: toCount(npm.downloads),
      from: npm.start ?? period.from,
      to: npm.end ?? period.to,
    },
    homebrew: {
      installOnRequestEvents: toCount(formula?.count),
      from: homebrew.start_date ?? "unknown",
      to: homebrew.end_date ?? "unknown",
    },
    github: {
      forks: toCount(repository.forks_count),
      releaseAssetDownloads: Array.isArray(releases)
        ? releases.flatMap((release) => release.assets ?? []).reduce(
            (total, asset) =>
              isSideGlanceBinaryAsset(asset.name)
                ? total + toCount(asset.download_count)
                : total,
            0
          )
        : 0,
      stars: toCount(repository.stargazers_count),
    },
  };
}

export function renderAdoptionReport(snapshot) {
  const { github, homebrew, npm, period, webEvents } = snapshot;
  return `# Side Glance adoption snapshot

Web-intent period: ${period.from} through ${period.to}

| Signal | Count | Window | Meaning |
| --- | ---: | --- | --- |
| \`install_command_copied\` | ${webEvents.install_command_copied} | Web-intent period | Successful Homebrew setup-command copies |
| \`github_opened\` | ${webEvents.github_opened} | Web-intent period | Header GitHub opens |
| \`demo_engaged\` | ${webEvents.demo_engaged} | Web-intent period | Browser-tab sessions with a meaningful demo interaction |
| Period npm downloads | ${npm.downloads} | ${npm.from} through ${npm.to} | Registry downloads, not people or verified installs |
| Homebrew install-on-request | ${homebrew.installOnRequestEvents} | ${homebrew.from} through ${homebrew.to} | Homebrew opt-in events, not unique or verified installs |
| GitHub stars | ${github.stars} | Cumulative | Repository interest |
| GitHub forks | ${github.forks} | Cumulative | Repository reuse interest |
| Lifetime binary asset transfers | ${github.releaseAssetDownloads} | Cumulative | Mixed Homebrew, direct downloads, and CI or maintainer verification |

Do not calculate a cross-source conversion rate: the windows and counting units differ. Treat each line as a directional signal and compare its own trend over time.
`;
}

function isSideGlanceBinaryAsset(name) {
  return /^side-glance-v.+-(?:darwin|linux)[\w.-]*\.tar\.gz$/u.test(
    name ?? ""
  );
}

async function fetchJson(fetchImpl, url, label) {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${label} request failed (${response.status})`);
  }
  return response.json();
}

function normalizeWebEvents(events) {
  return Object.fromEntries(
    EVENT_NAMES.map((event) => [event, toCount(events?.[event])])
  );
}

function toCount(value) {
  const parsed = Number(String(value ?? "0").replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

function validateDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value ?? "")) {
    throw new Error(`--${label} must use YYYY-MM-DD`);
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (!(args.from && args.to && args.webEvents)) {
    throw new Error(
      "Usage: npm run analytics:adoption -- --from YYYY-MM-DD --to YYYY-MM-DD --web-events /path/to/events.json"
    );
  }
  const webEvents = JSON.parse(await readFile(args.webEvents, "utf8"));
  const snapshot = await collectAdoptionSnapshot({
    period: { from: args.from, to: args.to },
    webEvents,
  });
  process.stdout.write(renderAdoptionReport(snapshot));
}

export function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]?.replace(/^--/u, "");
    const value = values[index + 1];
    if (key && value) {
      parsed[key === "web-events" ? "webEvents" : key] = value;
    }
  }
  return parsed;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
