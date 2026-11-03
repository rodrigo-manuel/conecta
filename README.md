# Conecta

MVP de la plataforma de acopio, calidad, liquidación al productor y trazabilidad de la leche de COOVASER, una cooperativa ficticia. Proyecto de validación de Electiva II: Arquitectura Empresarial, Universidad Cooperativa de Colombia, II/2026.

## Instalación y ejecución

Requisito: Docker Desktop encendido.

```bash
cp .env.example .env
docker compose up --build
```

`.env.example` trae valores solo para este ambiente de prueba; en producción cambie la clave y `JWT_SECRET` (ver [despliegue](docs/despliegue.md)).

Abra <http://localhost:3000>. Los datos de prueba se cargan solos la primera vez. Para reiniciarlos con fechas de hoy:

```bash
docker compose down -v
docker compose up --build
```

## Usuarios de prueba

Clave de todos: `Conecta2026!`. Es una clave pública, solo para este ambiente de prueba; los datos son ficticios.

| Usuario | Rol |
|---|---|
| `operador` | Operador de acopio (centro Agustín Codazzi) |
| `analista` | Analista de laboratorio |
| `jefeplanta` | Jefe de planta |
| `coordinador` | Coordinador de liquidación |
| `productor`, `productor2` | Productores PR-0001 y PR-0002 |
| `gerencia` | Gerencia |
| `revisor` | Revisor fiscal |
| `admin` | Administrador |

## Pruebas

```bash
cd api
npm ci
npm test                  # unitarias de las reglas de pago, sin base de datos
npm run test:cobertura    # falla si liquidación baja de 70 %
npm run test:integracion  # API contra PostgreSQL; requiere el contenedor db encendido
```

| Suite | Resultado |
|---|---|
| Unitarias | 47 pruebas (45 de reglas y 2 de salud); 100 % de cobertura en `src/liquidacion` |
| API | 43 pruebas, incluido que un productor no ve datos de otro y que un operador solo actúa en su centro |
| Carga | Trazabilidad entre 24 y 37 ms con 100.960 recepciones y 1.300 en el lote (límite: 2 s) |

GitHub Actions ejecuta las suites anteriores en cada commit.

Recorridos en Microsoft Edge, con la aplicación encendida y datos recién cargados:

```bash
cd e2e
npm ci
npm run recorrido  # los 8 roles, de punta a punta
npm run jornada    # 325 recepciones sin red, sin pérdidas ni duplicados
```

## Estructura

| Carpeta | Contenido |
|---|---|
| `api/src/liquidacion` | Motor de liquidación: funciones puras y parámetros versionados |
| `api/src/rutas` | Endpoints por módulo |
| `api/src/integraciones` | Interfaces hacia ERP, fondo y mensajería, con sus adaptadores |
| `web/src` | PWA: pantallas, cola sin conexión (`cola.ts`) |
| `web/public/sw.js` | Service worker |
| `db/init` | Esquema, triggers y datos de prueba |
| `e2e` | Recorridos automáticos en el navegador |
| `docs` | [OpenAPI](docs/openapi.yaml), [ADR](docs/adr/README.md), [integraciones](docs/integraciones.md), [despliegue](docs/despliegue.md), [manual por rol](docs/manual.md) |

## Licencias de terceros

Todas son permisivas y compatibles con el uso del proyecto.

| Componente | Licencia | Uso |
|---|---|---|
| express, helmet, express-rate-limit, jsonwebtoken, pg, zod | MIT | API |
| bcryptjs | BSD-3-Clause | Hash de contraseñas |
| react, react-dom | MIT | Interfaz |
| idb | ISC | Acceso a IndexedDB |
| vite, @vitejs/plugin-react, vitest, @vitest/coverage-v8, supertest, @types/* | MIT | Compilación y pruebas |
| playwright-core | Apache-2.0 | Recorridos en el navegador |
| typescript | Apache-2.0 | Compilación |
| PostgreSQL | PostgreSQL License | Base de datos (imagen `postgres:17-alpine`) |
| Node.js | MIT | Entorno de ejecución (imagen `node:24-alpine`) |

Las dependencias transitivas de producción tienen licencias MIT, ISC, BSD-3-Clause o Apache-2.0, según `package-lock.json`.

## Datos

Todos los nombres, teléfonos y registros son ficticios. El proyecto no usa datos personales reales.

## Declaración de uso de inteligencia artificial

| Aspecto | Detalle |
|---|---|
| Herramienta | Claude Code (Anthropic), modelo Claude Opus 5.5 |
| Para qué se usó | Generar y corregir la mayor parte del código, las pruebas, los scripts SQL y la documentación; proponer decisiones de arquitectura |
| Qué hizo el autor | Definió el alcance, las prioridades y el stack, dirigió el trabajo, pidió correcciones y revisó el resultado. Asume la responsabilidad de explicar cada decisión y cada parte del código en la sustentación |
| Trazabilidad | Los commits generados con la herramienta llevan la línea `Co-Authored-By` |
