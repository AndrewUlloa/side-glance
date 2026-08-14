## Summary

Describe the user-visible outcome and why it belongs in Side Glance.

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
