# Backend Skills

# Backend Skills

- detectar divergencia entre seed path y query path
- validar wiring de Firebase emulator / Functions / Firestore
- consolidar schemas en shared
- mover writes críticos a backend functions
- auditar imports prohibidos
- proponer fix mínimo y verificable

## Core Skills

- modelar datos operativos en Firestore
- escribir queries y mutations coherentes con el flujo real
- alinear tipos compartidos con documentos persistidos
- depurar inconsistencias entre seeds, lecturas live y escrituras
- hacer cambios pequeños sobre schema sin romper TBB

## Reglas

- Validar cada cambio contra el path real de Firestore afectado.
- Si hay diferencias entre `shared` y el documento real, priorizar la operacion actual y luego alinear tipos.
- No crear una capa intermedia si una query clara resuelve el caso.
- No usar mocks si el emulador, seed o flujo real ya cubren el caso.
- Mantener nombres de estados y campos consistentes entre apps.
- Cualquier cambio en pedidos debe contemplar creacion, lectura live y actualizacion de estado.

## Definition Of Done

- La lectura y escritura real en Firestore queda consistente.
- El flujo de TBB sigue funcionando sin pasos manuales extra.
- Los tipos relevantes no contradicen el documento persistido.
- El cambio es incremental y entendible.
- No se introdujo sobreingenieria ni estado duplicado.
