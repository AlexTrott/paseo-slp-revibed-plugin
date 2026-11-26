# One canonical form for host option vocabularies

- Status: Accepted
- Date: 2026-11-26
- Decided by: Lead
- Source: Human assignment to make the plugin work with the latest Paseo (0.17.5) and fix flaws
- Supersedes: none

## Context

Paseo 0.16–0.17 moved composer values from `featureValues` to `options`
(saved profiles) and `providerOptions` (agents), kept the old key only as a
dated compatibility copy, dropped empty records, removed `timeline` from the
turn-ended type and deprecated the `on`/`before` hook pair. Against a real
0.17.5 daemon, SLP activation with profile values ended in
`RECOVERY_REQUIRED` and every managed task create was refused. The manifest
still admits hosts from 0.11.

## Decision

Keep `featureValues` as SLP's recorded vocabulary and convert at the host
boundary, in one function per seam, rather than branching on a host version.
Reads fold both keys into one form where no values is the absent key.
Recorded receipts are never rewritten; they are canonicalized at comparison.
A profile patch carries `options` only when the host's own data already
shows that key. Hooks register through `addHook` when present. Host-side
renames of individual option keys are not mirrored: that state is refused
with a remedy instead.

## Consequences

Hosts 0.11–0.17 run one code path; removing the old keys upstream needs no
plugin change. A recovery may adopt a projection that is canonically equal to
the recorded one. Mirroring host key renames stays out until a host exposes
them as data. Revisit when the manifest floor moves past 0.15.
