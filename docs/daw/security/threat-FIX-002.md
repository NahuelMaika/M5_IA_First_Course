# Threat Model FIX-002: Select popup mal posicionado dentro de Dialog

| Field | Value |
|-------|-------|
| Ticket | FIX-002 |
| Date | 2026-08-24 |

## Component under change

`apps/web/src/app/layout.tsx` — root layout de Next.js App Router. Cambio propuesto: agregar la
clase Tailwind `isolate` (`isolation: isolate`) al elemento `<body>`.

## Attack surfaces identificadas

Ninguna nueva. El cambio:
- No acepta input de usuario nuevo.
- No expone datos.
- No introduce ni modifica autenticación/autorización.
- No integra un servicio externo.
- No cambia ningún data flow: es una propiedad CSS (`isolation`) que solo afecta el orden de
  renderizado visual (stacking context) del navegador, aplicada al único `<body>` del árbol.

No hay trust boundaries nuevos que declarar (F-TM-02): el cambio no cruza ningún límite de
confianza existente (cliente↔servidor, usuario↔usuario, público↔privado).

## STRIDE por componente

| Categoría | ¿Aplica? | Análisis |
|---|---|---|
| Spoofing | No | No hay identidad involucrada en un stacking context CSS. |
| Tampering | No | `isolation` no es dato manipulable en tránsito ni en reposo; es una regla CSS estática del bundle. |
| Repudiation | No | No hay acción de usuario que registrar/negar. |
| Information Disclosure | No | No se expone ni oculta información — el fix corrige visibilidad de UI, no acceso a datos. |
| Denial of Service | No | `isolation: isolate` no afecta rendimiento ni disponibilidad; es una propiedad de compositing estándar del navegador, sin costo relevante. |
| Elevation of Privilege | No | No hay lógica de permisos involucrada. |

## Datos sensibles (F-TM-05)

Ninguno. El cambio no toca PII, credenciales ni datos financieros — es puramente visual/CSS.

## Riesgos identificados

Ninguno de nivel CRITICAL o HIGH. Riesgo residual clasificado LOW:

| Risk | STRIDE | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| `isolation: isolate` en `<body>` podría, en teoría, afectar el stacking de algún elemento futuro que dependa de comparar z-index contra un ancestro fuera del `<body>` (ej. una extensión de navegador o un widget externo inyectado en `<html>`) | Tampering (visual, no de datos) | Low | Low | Ninguna requerida: el proyecto no embebe scripts/widgets de terceros que rendericen fuera del `<body>` (AGENTS.md no declara integraciones de este tipo); el impact scan confirmó que los 4 componentes con Portal (Select, Dialog, ConfirmDialog, Toast) se benefician del fix sin necesitar ajustes propios. |

## Conclusión

No hay riesgos CRITICAL/HIGH. El único riesgo (LOW) no requiere mitigación activa — es un cambio
CSS aislado, alineado con la recomendación oficial de Base UI para este mismo escenario.

---

┌─────────────────────────────────────────────────────────┐
│  /daw-threat-modeling — PASSED                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Attack surfaces identified: 0                            │
│  Trust boundaries declared: 0 (ninguno aplica)             │
│                                                          │
│  Risks:                                                  │
│    🟢 LOW: isolation en <body> vs. widgets externos       │
│    futuros (no aplica hoy — no hay integraciones de este  │
│    tipo en el proyecto)                                   │
│                                                          │
│  Mitigations to fold into the spec:                        │
│    (ninguna requerida)                                     │
│                                                          │
│  ─────────────────────────────────────────────────────    │
│  Risks: C:0 H:0 M:0 L:1                                    │
│  Report: docs/daw/security/threat-FIX-002.md                │
└─────────────────────────────────────────────────────────┘
