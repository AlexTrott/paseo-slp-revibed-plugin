# Continue as SLP Revibed without Jev or communication supervision

- Status: Accepted
- Date: 2026-11-26
- Decided by: Human
- Source: Human assignment to take over the unmaintained plugin, remove Jev and rename it
- Supersedes: none

## Context

The original paseo-slp plugin is no longer maintained. The new maintainer
runs it on current Paseo and does not use Jev, the external judging service
behind two optional features: routing decisions for Peer selection, and
communication supervision, which cannot work without it.

## Decision

Remove both features entirely: settings cards, RPCs, state readers, the
`route-decide` command, the observer and its policy text. The Lead selects
each Peer from the pool; a sole eligible option is still taken automatically.
A route or runtime pin carrying a routing `decision` is refused. The stored
pin schema keeps an optional `decision` field so ledgers written earlier
still read.

Rename the project to SLP Revibed with plugin id, package and CLI name
`slp-revibed`. Keep the identifiers other data depends on: `slp-<family>-<role>`
providers, `slp-supervisor`/`slp-lead` profiles, `slp_*` desk tools, the
`slp-runtime` state directory and each repository's `.paseo-slp/`. A receipt
written under the former plugin id stays readable.

## Consequences

The plugin sends nothing to a service of its own. Old Jev and supervision
state files are left on disk, unused; the key file should be deleted by the
Human. Both plugin ids own the same providers, so the old plugin must be
removed first. Earlier decision files that mention Jev record history only.
Renaming the retained identifiers would need a migration and is not planned.
