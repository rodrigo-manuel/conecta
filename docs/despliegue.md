# Plan de despliegue a producción

## Alojamiento elegido

Máquina virtual en un proveedor IaaS, con Docker Compose, TLS en un proxy inverso y respaldo en otra región o proveedor (ver ADR-005). El proveedor se selecciona por RFI y debe firmar un contrato de transmisión de datos personales (Decreto 1377 de 2013, compilado en el Decreto 1074 de 2015).

## Costo mensual estimado

Es una estimación de orden de magnitud por validar con cotizaciones en el RFI. Alimenta el TCO de la sección B3.

| Concepto | COP/mes |
|---|---|
| Máquina virtual de 4 vCPU y 8 GB | 450.000 |
| Disco de 200 GB con instantáneas | 150.000 |
| Respaldo externo cifrado (500 GB) | 100.000 |
| Monitoreo y dominio | 100.000 |
| SMS: 1.300 productores × 2 mensajes por mes a COP 40, más alertas | 150.000 |
| **Total** | **950.000** |

## Dimensionamiento

Carga: 1.300 recepciones por día, concentradas en la mañana, y 53 usuarios internos. La prueba automatizada con 100.960 recepciones responde la trazabilidad en menos de 40 ms en un portátil de 8 GB; los dos contenedores usan cerca de 70 MB en reposo. Una máquina de 4 vCPU y 8 GB deja holgura para crecer.

## Pasos

1. Crear la máquina y el proxy con TLS: sin HTTPS el service worker no funciona fuera de localhost.
2. Definir secretos en `.env`, nunca en el repositorio: clave de la base de datos y `JWT_SECRET` largo y aleatorio.
3. No publicar el puerto 5432 y crear un rol de aplicación sin privilegio de superusuario (ver ADR-007).
4. Quitar `003_datos_prueba.sql` y cargar los productores reales con sus autorizaciones.
5. Levantar con `docker compose up -d --build`.
6. Configurar el respaldo y probar la restauración antes de salir en vivo.

## Respaldo y recuperación (OE5: menos de 8 horas)

Respaldo diario y antes de cada cierre de quincena:

```bash
docker compose exec -T db pg_dump -U conecta -Fc conecta > respaldo_$(date +%F).dump
```

Restauración en una máquina nueva:

```bash
docker compose up -d db
docker compose exec -T db pg_restore -U conecta -d conecta --clean --if-exists < respaldo.dump
docker compose up -d --build
```

| Paso de recuperación | Tiempo estimado |
|---|---|
| Declarar el incidente y decidir | 1 h |
| Crear la máquina e instalar Docker | 1 h |
| Descargar el respaldo y restaurar | 1 h |
| Levantar, verificar con `/api/salud` y probar | 1 h |
| **Total (RTO)** | **4 h, frente a la meta de 8 h** |

El punto de recuperación es de hasta 24 horas en el servidor. Las recepciones de ese día se pueden reconstruir con la cola de los dispositivos y los comprobantes impresos. Los tiempos son estimados hasta hacer un simulacro, que se programa cada semestre.

## Plan de versiones (alineado con C4)

| Versión | Fecha objetivo | Alcance |
|---|---|---|
| **R1 (MVP)** | T1 2027 | Este repositorio, piloto en 2 centros y luego en los 4 |
| **R2** | T3 2027 | Carga CSV del laboratorio, QR público de lote, identidad federada, API con el nuevo fondo |
| **R3** | T2 2028 | Integración con el nuevo ERP, alertas de cadena de frío, analítica por ruta |
