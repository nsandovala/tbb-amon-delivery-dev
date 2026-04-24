# Env Map — TBB AMON Delivery

## Objetivo
Definir con claridad qué variables van en cada archivo `.env` para evitar:
- mezclar frontend con backend
- exponer credenciales sensibles
- romper el flujo local entre web, admin, functions y seed

---

## Regla madre

### Frontend
Solo usa variables `NEXT_PUBLIC_*`.

Estas variables pueden ser leídas por el navegador.
Por eso **jamás** deben incluir secretos reales.

### Backend
Usa variables normales, sin `NEXT_PUBLIC_*`.

Estas variables son privadas y deben vivir solo en:
- Functions
- scripts de seed
- procesos server-side

---

## Mapa por archivo

---

## 1. Raíz del repo — `.env`

### Uso
Variables compartidas para desarrollo local y scripts de seed.

### Debe contener
```env
FIREBASE_PROJECT_ID=minierp-sentinel
SEED_TARGET=emulator
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
USE_FIREBASE_EMULATOR=true