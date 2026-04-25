## Resumen

Describe el cambio en 2-5 líneas.

## Tipo de cambio

- [ ] Fix
- [ ] Feature
- [ ] Refactor
- [ ] Security
- [ ] QA / CI
- [ ] Docs

## Checklist de seguridad

- [ ] No agregué `.env`, `.env.local`, service accounts ni secretos.
- [ ] No agregué carpetas completas de `.claude/skills` o dumps externos.
- [ ] Revisé `git diff --stat`.
- [ ] Revisé `git status --short`.
- [ ] El cambio es mínimo, auditable y reversible.

## Checklist QA

- [ ] Build local ejecutado o justificado.
- [ ] Lint/test ejecutado o justificado.
- [ ] No rompe `apps/web`.
- [ ] No rompe `apps/admin`.
- [ ] No rompe `apps/functions`.
- [ ] No rompe `packages/shared`.

## Riesgos

Explica riesgos, deuda técnica o partes que deben revisarse con lupa.

## Evidencia

Pega comandos ejecutados y resultados relevantes.