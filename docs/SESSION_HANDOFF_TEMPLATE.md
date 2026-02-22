# Session Handoff Template

> When starting a new session, copy this template to a dated handoff note (for example: `docs/handoffs/2026-02-19.md`) and complete it **before coding**.

## Current branch baseline commit
- Branch:
- Baseline commit SHA:
- Baseline commit message:

## What is implemented vs pending (from backlog IDs)
### Implemented
- [ ] `<BACKLOG-ID>`: _summary of completed work_

### Pending
- [ ] `<BACKLOG-ID>`: _summary of remaining work_

## Highest-risk modules touched
- `<path/to/module>` — _why this area is high risk_
- `<path/to/module>` — _risk notes, known caveats, or test concerns_

## Commands to validate docs + build
- `npm run lint:docs`
- `npm run build`
- _Add any project-specific validation commands used in this session._

## Required changelog update checklist
- [ ] Identify changelog file(s) that must be updated.
- [ ] Add entries for each implemented backlog ID.
- [ ] Verify wording matches user-visible behavior and scope.
- [ ] Confirm unreleased/release section placement is correct.
- [ ] Include links/references to related PR(s) and issue/backlog ID(s).
