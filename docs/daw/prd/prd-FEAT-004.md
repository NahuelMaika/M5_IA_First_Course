# Parent PRD: Registro, login y logout de usuario

| Metric | Value |
|--------|-------|
| Ticket | FEAT-004 |
| Date | 2026-08-22 |
| Status | Split |

## Sub-tickets

| Sub-ticket | Title | PRD | Dependencies | Status |
|---|---|---|---|---|
| FEAT-004a | Registro, login y logout — API | prd-FEAT-004a.md | none | done — PR #7 draft opened (github.com/NahuelMaika/M5_IA_First_Course/pull/7), se mergea a feat/FEAT-003b-expenses-ui cuando se apruebe; FEAT-004b puede ramificar desde feat/FEAT-004a-auth-api sin esperar ese merge |
| FEAT-004b | Registro, login y logout — UI | prd-FEAT-004b.md | depends on a | active |

## Suggested implementation order
a → b

## Original context

Hoy `POST /expenses` y `GET /expenses` validan la identidad del usuario con un stub: leen el header
`x-user-id`, lo buscan en la tabla `users` y, si existe, dejan pasar la request
(`apps/api/src/plugins/auth.ts`, spec-FEAT-002 Block 6). No hay passwords, no hay sesión, no hay
forma de que una persona real se registre o inicie sesión — el `x-user-id` lo fija a mano
`apps/web/src/lib/api/client.ts` vía la variable de entorno `NEXT_PUBLIC_STUB_USER_ID`
(spec-FEAT-003b Block 5). Las threat models de FEAT-002 y FEAT-003a aceptaron este stub como riesgo
conocido, pendiente de reemplazo.

El PRD original (19 FR, 15 AC) tocaba dos áreas independientes — API (endpoints, hashing, throttle,
migración) y UI (pantallas, cliente HTTP, route guards) — y se dividió siguiendo el mismo patrón que
FEAT-001 y FEAT-003.
