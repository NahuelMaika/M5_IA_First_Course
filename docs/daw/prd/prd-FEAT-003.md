# Parent PRD: UI de carga de gastos con categorización automática

| Metric | Value |
|--------|-------|
| Ticket | FEAT-003 |
| Date | 2026-08-20 |
| Status | Split |

## Sub-tickets

| Sub-ticket | Title | PRD | Dependencies | Status |
|---|---|---|---|---|
| FEAT-003a | Listado de gastos vía API — GET /expenses | prd-FEAT-003a.md | none | active |
| FEAT-003b | UI de carga y listado de gastos | prd-FEAT-003b.md | depends on a | pending |

## Suggested implementation order
a → b

## Original context

FEAT-001a (categorizador), FEAT-001b (extractor) y FEAT-002 (`POST /expenses` con persistencia)
cierran el motor completo de interpretación y alta de un gasto, pero solo son alcanzables hoy desde
un test de integración: no existe `apps/web`, ni una sola pantalla.

El PRD original combinaba el endpoint de lectura (`GET /expenses`, nuevo en `apps/api`) con la
primera pantalla del producto (`apps/web` desde cero: formulario de carga + listado). El scope
check de DEFINE detectó 17 acceptance criteria y dos módulos con concerns propios (backend y
frontend), y el usuario aprobó dividirlo.

No incluye autenticación real en ninguno de los dos sub-tickets: `PRD.md` exige login con email +
contraseña (RF-08, RF-12, RF-13), pero el modelo `User` de FEAT-002 no tiene campo `password` y no
existe ningún endpoint de login, registro ni sesión. Ambos sub-tickets reutilizan el stub
`x-user-id` de FEAT-002. **El siguiente ticket de esta feature, después de FEAT-003b, es FEAT-004:
login y sesión reales**, que reemplaza el stub en API y web sin cambiar el resto de lo construido
acá.

## Historial de Cambios

- **v2.0 — 2026-08-20**: dividido en FEAT-003a/FEAT-003b tras el scope check de DEFINE (17 AC, 2
  módulos). Este documento pasa a ser índice.
- **v1.0** — versión inicial (contenido movido a los sub-PRDs).
