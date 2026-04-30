#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EMULATOR_PORTS=(4000 5001 8080 9099)
WEB_PORT=3000
ADMIN_PORT=3001

STARTED_EMULATORS=0
STARTED_WEB=0
STARTED_ADMIN=0
EMULATOR_LOG="${ROOT_DIR}/firebase-debug.log"

port_is_open() {
  local port="$1"
  lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1
}

port_owner() {
  local port="$1"
  lsof -iTCP:"$port" -sTCP:LISTEN -n -P || true
}

cleanup() {
  echo ""
  echo ">> cleanup: cerrando procesos hijos del script..."

  if [[ "${STARTED_WEB}" -eq 1 && -n "${WEB_PID:-}" ]]; then
    kill "${WEB_PID}" 2>/dev/null || true
  fi

  if [[ "${STARTED_ADMIN}" -eq 1 && -n "${ADMIN_PID:-}" ]]; then
    kill "${ADMIN_PID}" 2>/dev/null || true
  fi

  if [[ "${STARTED_EMULATORS}" -eq 1 && -n "${EMULATOR_PID:-}" ]]; then
    kill "${EMULATOR_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo ">> [0/6] Verificando prerequisitos..."
command -v firebase >/dev/null 2>&1 || { echo "Falta firebase CLI"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Falta npm"; exit 1; }
command -v npx >/dev/null 2>&1 || { echo "Falta npx"; exit 1; }

echo ">> [1/6] Limpiando caché Next local..."
rm -rf apps/web/.next apps/admin/.next

echo ">> [2/6] Typecheck + build shared..."
(
  cd packages/shared
  npm run typecheck
  npm run build
)

echo ">> [3/6] Build functions..."
(
  cd apps/functions
  npm run build
)

echo ">> [4/6] Estado de emuladores..."
OPEN_COUNT=0
for port in "${EMULATOR_PORTS[@]}"; do
  if port_is_open "$port"; then
    OPEN_COUNT=$((OPEN_COUNT + 1))
  fi
done

if [[ "$OPEN_COUNT" -eq 0 ]]; then
  echo ">> No hay emuladores arriba. Levantando Firebase emulators..."
  firebase emulators:start >"$EMULATOR_LOG" 2>&1 &
  EMULATOR_PID=$!
  STARTED_EMULATORS=1

  echo ">> Esperando emuladores en puertos fijos..."
  npx wait-on \
    tcp:127.0.0.1:4000 \
    tcp:127.0.0.1:5001 \
    tcp:127.0.0.1:8080 \
    tcp:127.0.0.1:9099
elif [[ "$OPEN_COUNT" -eq "${#EMULATOR_PORTS[@]}" ]]; then
  echo ">> Emuladores ya activos. Reutilizando instancia existente."
else
  echo ">> Estado inconsistente: algunos puertos de emulador están ocupados y otros no."
  echo ">> No sigo para evitar falso positivo."
  for port in "${EMULATOR_PORTS[@]}"; do
    echo ""
    echo "== Puerto $port =="
    port_owner "$port"
  done
  exit 1
fi

echo ">> [5/6] Ejecutando seed..."
(
  cd packages/shared
  npm run seed
)

echo ">> [6/6] Levantando web y admin..."
(
  cd apps/web
  npm run dev
) &
WEB_PID=$!
STARTED_WEB=1

(
  cd apps/admin
  npm run dev
) &
ADMIN_PID=$!
STARTED_ADMIN=1

echo ">> Esperando web/admin..."
npx wait-on \
  http://127.0.0.1:${WEB_PORT} \
  http://127.0.0.1:${ADMIN_PORT}

echo ""
echo "✅ Stack arriba"
echo "   Web:      http://localhost:${WEB_PORT}"
echo "   Admin:    http://localhost:${ADMIN_PORT}"
echo "   Emulator: http://127.0.0.1:4000"
echo ""
echo "Notas:"
echo " - Si el script detecta puertos parciales ocupados, aborta."
echo " - Si los 4 puertos ya existen, reutiliza emuladores vivos."
echo " - Ctrl+C cierra solo los procesos que este script levantó."
echo ""

wait