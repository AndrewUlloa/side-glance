import assert from "node:assert/strict";
import test from "node:test";

import {
  collectAdoptionSnapshot,
  parseArguments,
  renderAdoptionReport,
} from "../../scripts/analytics/adoption-report.mjs";

const response = (body) => ({
  json: async () => body,
  ok: true,
  status: 200,
});

test("compares web intent with npm and clearly bounded GitHub distribution signals", async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    if (String(url).includes("api.npmjs.org")) {
      return response({
        downloads: 37,
        end: "2026-08-29",
        package: "side-glance",
        start: "2026-08-27",
      });
    }
    if (String(url).includes("formulae.brew.sh")) {
      return response({
        end_date: "2026-08-29",
        items: [
          {
            count: "4",
            formula: "andrewulloa/tap/side-glance",
          },
        ],
        start_date: "2026-07-30",
      });
    }
    if (String(url).endsWith("/releases?per_page=100")) {
      return response([
        {
          assets: [
            {
              download_count: 11,
              name: "side-glance-v0.1.0-beta.12-darwin-arm64.tar.gz",
            },
            { download_count: 4, name: "checksums.txt" },
          ],
        },
      ]);
    }
    return response({ forks_count: 3, stargazers_count: 19 });
  };

  const snapshot = await collectAdoptionSnapshot({
    fetchImpl,
    period: { from: "2026-08-27", to: "2026-08-29" },
    webEvents: {
      demo_engaged: 9,
      github_opened: 7,
      install_command_copied: 5,
    },
  });

  assert.deepEqual(snapshot.webEvents, {
    demo_engaged: 9,
    github_opened: 7,
    install_command_copied: 5,
  });
  assert.equal(snapshot.npm.downloads, 37);
  assert.equal(snapshot.homebrew.installOnRequestEvents, 4);
  assert.equal(snapshot.github.stars, 19);
  assert.equal(snapshot.github.forks, 3);
  assert.equal(snapshot.github.releaseAssetDownloads, 11);
  assert.equal(requests.length, 4);

  const markdown = renderAdoptionReport(snapshot);
  assert.match(markdown, /Homebrew install-on-request/u);
  assert.match(markdown, /opt-in events, not unique or verified installs/u);
  assert.match(markdown, /Lifetime binary asset transfers/u);
  assert.match(markdown, /Homebrew, direct downloads, and CI/u);
  assert.match(markdown, /Period npm downloads/u);
});

test("fails clearly when an adoption source is unavailable", async () => {
  await assert.rejects(
    collectAdoptionSnapshot({
      fetchImpl: async () => ({ ok: false, status: 503 }),
      period: { from: "2026-08-27", to: "2026-08-29" },
      webEvents: {},
    }),
    /request failed \(503\)/u
  );
});

test("parses the documented adoption-report command", () => {
  assert.deepEqual(
    parseArguments([
      "--from",
      "2026-08-27",
      "--to",
      "2026-08-29",
      "--web-events",
      "/tmp/events.json",
    ]),
    {
      from: "2026-08-27",
      to: "2026-08-29",
      webEvents: "/tmp/events.json",
    }
  );
});
