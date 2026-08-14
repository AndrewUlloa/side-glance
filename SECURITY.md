# Security policy

## Supported versions

Until Side Glance reaches 1.0, security fixes are made on the newest published beta only. The `main` branch is development code and is not a supported release channel.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's [private vulnerability report](https://github.com/AndrewUlloa/side-glance/security/advisories/new) and include the affected version, platform, reproduction steps, impact, and any suggested mitigation.

The maintainers will acknowledge a complete report, investigate it privately, and coordinate disclosure after a fix is available. Secrets, prompts, transcripts, and real provider configuration should be removed from reports.

Side Glance does not operate a hosted service and does not collect telemetry. Security reports generally concern local file handling, lifecycle hooks, terminal targets, release artifacts, or supply-chain behavior.
