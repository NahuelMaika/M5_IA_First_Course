# Fix QUICK-001: Agregar script dev a apps/api

- **Bug**: `apps/api` no tiene script `dev`, así que `pnpm dev` en la raíz solo levanta `apps/web`
  (`--if-present` lo salta) y no hay forma documentada de correr la API en local sin buildearla a
  mano y cargar el `.env` de la raíz a mano.
- **Change**: `apps/api/package.json` — agregar `"dev": "node --env-file=../../.env
  --experimental-strip-types --watch src/server.ts"` al bloque `scripts`.
- **Regression test**: N/A — es un script de conveniencia para desarrollo local, no hay
  comportamiento de producción que un test unitario/integración pueda reproducir. Verificación
  manual: `pnpm --filter @ggasia/api run dev` levanta el servidor en `API_PORT` sin error de env
  faltante.
- **Risk**: none — no toca código de producción, solo agrega un script de `package.json`.
