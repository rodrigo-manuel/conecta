# Registros de decisión de arquitectura (ADR)

Cada decisión indica contexto, opción elegida, alternativas descartadas y consecuencias.

## ADR-001. Tecnología: TypeScript, Express, PostgreSQL y React

- **Contexto.** El equipo de TI tiene 2 desarrolladores. Las reglas de pago manejan dinero y deben probarse a fondo. Se necesita una base relacional para trazabilidad y auditoría.
- **Decisión.** TypeScript en todo el producto (un solo lenguaje), Node.js con Express 5, PostgreSQL 17 con SQL parametrizado y la librería `pg`, React con Vite. Todo de código abierto con licencias permisivas.
- **Descartadas.** Java con Spring: maduro, pero más costoso en memoria y tiempo de arranque para 2 personas. Python con Django: buen ORM, pero dos lenguajes entre cliente y servidor. Un ORM: oculta el SQL que aquí importa (triggers, índices, consultas de trazabilidad).
- **Consecuencias.** Menos código repetido y tipos compartidos en la forma de pensar el dominio; el equipo debe mantener el SQL a mano.

## ADR-002. Estilo arquitectónico: monolito modular

- **Contexto.** 53 usuarios internos, 1.300 productores, 1.300 recepciones por día y 6 personas en TI.
- **Decisión.** Una sola aplicación con módulos separados (`recepciones`, `liquidaciones`, `lotes`, `consultas`), motor de liquidación como función pura e integraciones detrás de interfaces. Sirve también la PWA.
- **Descartadas.** Microservicios: costo operativo injustificado para esta carga y este equipo. Monolito sin módulos: el cálculo quedaría mezclado con HTTP y SQL.
- **Consecuencias.** Despliegue simple y barato. Si un módulo creciera de forma distinta, sus límites permiten extraerlo después.

## ADR-003. Estrategia sin conexión: PWA con cola local e id generado en el dispositivo

- **Contexto.** Dos centros solo tienen red móvil; hay veredas aisladas por días y cortes de energía. Debe operarse 12 horas sin internet, sin perder ni duplicar.
- **Decisión.** Toda recepción se guarda primero en IndexedDB con un UUID creado en el dispositivo. El servidor la inserta con `ON CONFLICT (id) DO NOTHING`. Se sincroniza al recuperar la señal o con un botón. Un service worker permite abrir la aplicación sin red.
- **Descartadas.** App nativa: dos bases de código y distribución más difícil. Servidor local en cada centro: otro equipo que administrar y que también falla sin energía. Id generado por el servidor: un reenvío tras perder la respuesta duplicaría la recepción.
- **Consecuencias.** La idempotencia resuelve la duplicación de raíz. El service worker exige HTTPS en producción. Límite conocido: si se borran los datos del navegador antes de sincronizar, la cola se pierde; se mitiga pidiendo almacenamiento persistente y con comprobante impreso.

## ADR-004. Integración con SICOOP: archivo plano detrás de una interfaz

- **Contexto.** SICOOP es Visual Basic 6 sin soporte, sin API, y será reemplazado. La liquidación no debe conocer al ERP.
- **Decisión.** Interfaz `Exportador` con una implementación que genera CSV por liquidación aprobada. El nuevo ERP será otra implementación, sin tocar el motor. El fondo sigue el mismo patrón.
- **Descartadas.** Acceso directo a SQL Server 2008: acopla a un esquema sin dueño y que va a desaparecer. Modificar SICOOP para exponer una API: invierte en un sistema a retirar y depende de una sola persona.
- **Consecuencias.** Integración por lotes y no en tiempo real, suficiente para un ciclo quincenal. El archivo solo se genera con liquidaciones aprobadas, lo que evita pagar valores no bloqueados.

## ADR-005. Alojamiento: máquina virtual en IaaS con Docker Compose y respaldo externo

- **Contexto.** La gerencia no quiere comprar servidores, el presidente del Consejo exige control de los datos y OE5 pide recuperar en menos de 8 horas.
- **Decisión.** Una máquina virtual con los mismos contenedores de desarrollo, respaldo diario cifrado en almacenamiento de otro proveedor o región, y contrato de transmisión de datos personales.
- **Descartadas.** Servidores en la planta: sin sitio alterno y ya afectados por ransomware en 2025. PaaS o Kubernetes administrado: más costo y dependencia para esta carga. SaaS de terceros para el núcleo: contradice la decisión del Consejo sobre el control de los datos.
- **Consecuencias.** Se paga por uso sin inversión en equipos y se conserva portabilidad entre proveedores. El equipo asume la administración del sistema operativo. Detalle y costos en [despliegue.md](../despliegue.md).

## ADR-006. Sesiones con JWT y contraseñas con bcrypt

- **Contexto.** Una operadora puede trabajar 12 horas sin señal y debe poder sincronizar al final de la jornada.
- **Decisión.** JWT firmado con vigencia de 16 horas y bcrypt con costo 10. El rol se valida en el servidor en cada operación.
- **Descartadas.** Sesiones en servidor: no sirven sin conexión. Proveedor de identidad externo desde R1: agrega una dependencia en línea; se evaluará Keycloak en R2.
- **Consecuencias.** Un token robado sirve hasta que venza, porque no hay revocación individual en el MVP. Esto queda como riesgo aceptado para R1 y se atiende en R2.

## ADR-007. Reglas críticas también en la base de datos

- **Contexto.** "Toda modificación deja un rastro no editable" y "una liquidación aprobada no cambia" no pueden depender de que cada ruta recuerde cumplirlos.
- **Decisión.** Triggers de PostgreSQL para auditoría, inmutabilidad del rastro y bloqueo de liquidaciones aprobadas.
- **Descartadas.** Auditoría en la API: un `UPDATE` directo no dejaría rastro. Event sourcing: excesivo para este equipo.
- **Consecuencias.** Más lógica en SQL. Límite conocido: un superusuario de la base puede desactivar triggers; en producción la API debe usar un rol sin ese privilegio.
