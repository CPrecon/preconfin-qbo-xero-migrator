# Dependency Audit

Command run: `npm audit --omit=dev`

## Remaining findings

`postcss < 8.5.10` via Next.js bundled dependency.

- Advisory: GHSA-qx2v-qp2m-jg93, PostCSS XSS via unescaped `</style>` in CSS stringify output.
- Severity: moderate.
- Dependency chain: `apps/web -> next@16.2.10 -> postcss@8.4.31`.
- Other PostCSS copies are resolved to `8.5.17` through the root override.
- `npm ls postcss` confirms the remaining vulnerable copy is nested inside Next.

## Runtime exposure

The affected package is used by Next's build/runtime tooling for CSS processing. This application does not accept untrusted CSS input from users, does not expose a CSS authoring surface, and does not stringify user-provided CSS in production request paths. The practical exploitability for this migrator is low, but the advisory remains present in the dependency tree.

## Remediation assessment

`npm audit fix --force` recommends installing `next@9.3.3`, which is a breaking and unsafe downgrade. That should not be applied.

Recommended action:

- Keep the current override for all non-Next PostCSS copies.
- Track an upstream Next release that updates the nested PostCSS dependency.
- Upgrade Next when an official compatible version is available and rerun `npm audit --omit=dev`.
- Do not force an incompatible override or downgrade solely to make audit output green.
