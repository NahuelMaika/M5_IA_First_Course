# SAST — FEAT-005a (ABM de gastos: edición y eliminación)

CODE closeout. Alcance: los 12 bloques del ticket, con foco en el diff final (Block 12:
`expense-row.tsx`, `expense-list.tsx`) y en las mitigaciones de `threat-FEAT-005a.md`.

## Secretos

- ✅ F-SAST-01: sin claves, tokens ni connection strings hardcodeadas en los archivos modificados.

## Injection

- ✅ F-SAST-02: sin queries construidas por concatenación; las rutas `apps/api` pasan por Prisma
  con inputs validados por Zod (Block 1).
- ✅ F-SAST-03: sin `exec`/`spawn` con input de usuario.
- ✅ F-SAST-05: sin paths de filesystem derivados de input de usuario.

## XSS y funciones inseguras

- ✅ F-SAST-06: sin `innerHTML`/`dangerouslySetInnerHTML`; `expense.name` se renderiza como texto
  React (auto-escapado) en el `aria-label` de los botones de editar/eliminar.
- ✅ F-SAST-04/17: sin `eval` ni deserialización insegura.
- ✅ F-SAST-08: sin criptografía propia introducida en este ticket.

## Resto de categorías obligatorias

- ✅ F-SAST-07 (SSRF): sin URLs dinámicas construidas con input de usuario.
- ✅ F-SAST-09: sin flags de debug en el código de producción.
- ✅ F-SAST-10: `notify()` sólo muestra mensajes genéricos fijos (`EXPENSE_UPDATED_MESSAGE`,
  `EXPENSE_DELETED_MESSAGE`, `GENERIC_ERROR_MESSAGE`); nunca el body de la respuesta del servidor.
- ✅ F-SAST-11: sin funcionalidad de upload en este ticket.
- ✅ F-SAST-12 (CSRF): el `PATCH`/`DELETE` van por `apiRequest`, que ya centraliza el manejo de
  credenciales de sesión; R2 (CSRF en logout/expenses) fue aceptado explícitamente en
  `threat-FEAT-004b.md`/`threat-FEAT-005a.md`, no un gap nuevo de este bloque.
- ✅ F-SAST-14: el `DELETE` no lleva body — nada que validar; el `id` proviene de un `Expense` ya
  cargado desde la lista, no de input libre del usuario.
- ✅ F-SAST-15: el `catch` de fallo de red en `handleConfirmDelete` cae al mensaje genérico, nunca
  expone el error real ni un stack trace.

## Dependencias

- ✅ F-SAST-13/16: `pnpm audit --prod` — sin vulnerabilidades conocidas.

## Suppressions

Ninguna.

## Resultado

**PASSED** — 0 Critical, 0 High, 0 Medium sin suprimir.
