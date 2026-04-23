# TBB Amon Delivery Dev

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

## 📋 Descripción

**tbb-amon-delivery-dev** es un proyecto de desarrollo enfocado en la gestión y entrega de servicios de Amon para TBB (The Best Burger). Este repositorio contiene la lógica, configuración e integración necesaria para el sistema de delivery.

## ⚙️ Tecnologías

- **TypeScript** - Lenguaje principal del proyecto.
- **MIT License** - Licencia del proyecto.

## 🚀 Primeros pasos

### Requisitos previos

- Node.js 16.0.0 o superior.
- npm 7.0.0 o superior.

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/nsandovala/tbb-amon-delivery-dev.git
cd tbb-amon-delivery-dev

# Instalar dependencias
npm install
```

### Uso

```bash
# Ejecutar frontend en modo desarrollo
npm run dev:web

# Levantar emuladores de Firebase
npm run dev:emulators

# Ejecutar stack local completo (emuladores + web)
npm run dev:all
```

## ✅ QA (Quality Assurance)

Antes de abrir un PR, ejecutar una validación mínima con los scripts actuales del repositorio:

```bash
npm run
npm run seed
```

- `npm run` permite confirmar qué scripts están disponibles.
- `npm run seed` valida la carga de datos base usada en desarrollo.

## 🔀 Flujo de Pull Request (PR)

1. Crear una rama descriptiva:
   ```bash
   git checkout -b feature/nombre-cambio
   ```
2. Realizar los cambios y confirmar:
   ```bash
   git add .
   git commit -m "feat: descripción breve"
   ```
3. Subir la rama:
   ```bash
   git push origin feature/nombre-cambio
   ```
4. Abrir el PR incluyendo:
   - Resumen funcional.
   - Evidencia de QA ejecutado.
   - Riesgos o impacto esperado.

## 📁 Estructura del proyecto

```text
tbb-amon-delivery-dev/
├── apps/                 # Aplicación principal
├── package.json          # Dependencias del proyecto
├── tsconfig.json         # Configuración de TypeScript
└── README.md             # Este archivo
```

## 🤝 Contribución

Las contribuciones son bienvenidas. Flujo recomendado:

1. Fork del proyecto.
2. Crear una rama para tu cambio (`git checkout -b feature/AmazingFeature`).
3. Confirmar cambios (`git commit -m 'Add some AmazingFeature'`).
4. Empujar rama (`git push origin feature/AmazingFeature`).
5. Abrir un Pull Request.

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 📧 Contacto

Autor: @nsandovala

Para más información o preguntas, no dudes en contactarme.

Última actualización: 2026-04-23
