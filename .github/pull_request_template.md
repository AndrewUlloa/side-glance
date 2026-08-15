## Summary

Describe the user-visible outcome and why it belongs in Side Glance.

## Delivery path

- [ ] This feature/fix PR targets `staging`, or this promotion PR is `staging` → `main`.
- [ ] The Vercel preview or staging deployment was checked when the change affects the site.

## Safety and lifecycle

- [ ] I considered delayed/out-of-order events and cleanup.
- [ ] I preserved unrelated provider configuration.
- [ ] I did not add prompt, transcript, or secret persistence.
- [ ] Tests use temporary homes and do not mutate live configuration.

## Verification

- [ ] I observed the focused test fail before implementation.
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:coverage`
- [ ] `npm test`

Include relevant RED/GREEN output and any platform checks that could not be run locally.
