# Formatos de integración (MVP-06)

Los archivos usan punto y coma como separador, UTF-8, fin de línea CRLF y valores en pesos colombianos sin decimales. Solo incluyen liquidaciones **aprobadas**.

## SICOOP: `sicoop_liquidacion_AAAA-MM-DD.csv`

`GET /api/liquidaciones/exportar?fecha=AAAA-MM-DD&destino=erp`

| Columna | Descripción |
|---|---|
| `liquidacion_id` | Identificador de la liquidación en Conecta |
| `productor` | Código del productor (dato maestro en Conecta en R1) |
| `periodo_inicio`, `periodo_fin` | Quincena liquidada |
| `litros` | Litros pagados, sin los rechazados |
| `bruto` | Litros × precio por litro |
| `aporte_social` | 2 % del bruto |
| `ahorro_voluntario` | Porcentaje autorizado por el asociado |
| `neto` | Bruto − aporte − ahorro |

## Fondo de ahorro: `fondo_ahorro_AAAA-MM-DD.csv`

`GET /api/liquidaciones/exportar?fecha=AAAA-MM-DD&destino=fondo`

Columnas `liquidacion_id`, `productor`, `periodo_inicio`, `periodo_fin` y `ahorro_voluntario`. Solo trae productores con ahorro mayor que 0.

## Cómo reemplazar un sistema externo

- **Nuevo ERP o nuevo fondo:** se escribe otra implementación de `Exportador` en `api/src/integraciones/`. El motor de liquidación no cambia.
- **Proveedor real de SMS:** se escribe otra implementación de `Mensajeria`. Hoy `mensajeriaFalsa` guarda los mensajes en la tabla `mensaje_saliente`, visibles para el administrador en `GET /api/mensajes`.
