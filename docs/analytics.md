# Web analytics

`sideglance.dev` is the sole production website property. Cloudflare Web
Analytics supplies automatic, aggregate real-user monitoring for that zone.
Vercel Web Analytics supplies page views and the small set of custom intent
events emitted by the application. The app must not include a manual
Cloudflare beacon or a public Cloudflare analytics token.

## Property cutover

Use August 27, 2026 as the reliable beginning of the `sideglance.dev` dataset.
Do not combine the retired website property's historical observations with the
new property: their overlap would double count traffic. The historical property
may remain available for reference, but it is not an active data source.

The initial human-traffic review through August 29 found 125 page views across
47 visits after excluding obvious bot and headless traffic. The home page had
92 of those views. Median experience was strong enough that measurement should
focus on intent rather than another performance vendor: approximately 233 ms
TTFB, 437 ms FCP, 466 ms LCP, 43 ms INP, and 0.067 CLS.

## Event contract

| Event | Trigger | Properties | Guardrail |
| --- | --- | --- | --- |
| `install_command_copied` | The Homebrew plus guided-setup commands reach the clipboard | `method=homebrew` | Clipboard failures emit nothing |
| `github_opened` | The header GitHub action is opened | `location=header` | No URL, user, or referrer data is added |
| `demo_engaged` | First lifecycle choice, color-model choice, or non-empty terminal-demo input | `interaction=lifecycle`, `color_model`, or `terminal_input` | One event per browser-tab session; prompt text is never included |

The demo guard stores only `side-glance:demo-engaged=1` in `sessionStorage`.
Analytics failure is fail-open: blockers or unavailable browser APIs must never
break copying, navigation, or the demo.

## Adoption report

Copy the three event totals for one date range from the Vercel Web Analytics
dashboard into a local JSON file:

```json
{
  "install_command_copied": 0,
  "github_opened": 0,
  "demo_engaged": 0
}
```

Then run:

```bash
npm run analytics:adoption -- \
  --from 2026-08-27 \
  --to 2026-08-29 \
  --web-events /absolute/path/to/web-events.json
```

The report fetches npm downloads for that period, Homebrew's public 30-day
install-on-request aggregate, current GitHub stars and forks, and cumulative
binary release-asset transfers. The signals intentionally remain separate:

- npm counts downloads, including automation, not people or verified installs.
- Homebrew install-on-request is an opt-in aggregate, not unique or verified
  installs.
- GitHub release assets mix Homebrew, direct downloads, CI, and maintainer
  verification.
- Stars and forks are cumulative interest signals.

At the August 29 baseline, npm reported 1,207 downloads for its prior-week
window, Homebrew reported four 30-day install-on-request events for
`andrewulloa/tap/side-glance`, and GitHub reported zero stars and zero forks.
The three Vercel intent events begin only after this change reaches production,
so they have no historical baseline. Never calculate a cross-source conversion
rate from unlike windows or counting units; compare each signal's own trend.

Primary data sources: [Vercel custom events](https://vercel.com/docs/analytics/custom-events),
[npm downloads API](https://github.com/npm/registry/blob/main/docs/download-counts.md),
[Homebrew analytics API](https://formulae.brew.sh/docs/api/), and
[GitHub release assets](https://docs.github.com/en/rest/releases).

