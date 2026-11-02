# Manual breve por rol

Entre en `http://localhost:3000` con su usuario. El menú muestra solo lo que su rol puede hacer.

## Operador de acopio
1. En **Recepción**, elija productor, escriba litros y temperatura y pulse **Registrar**.
2. Imprima el comprobante y entrégueselo al productor.
3. Sin señal, siga trabajando igual: las recepciones quedan en **Pendientes por sincronizar**. No borre los datos del navegador.
4. Al volver la señal se envían solas. También puede pulsar **Sincronizar ahora**.

## Analista de laboratorio
1. En **Laboratorio**, pulse **Registrar** en la recepción.
2. Escriba grasa, proteína y UFC. Marque antibióticos si el resultado es positivo.
3. Un positivo rechaza la recepción, crea la alerta y avisa al productor.

## Coordinador de liquidación
1. En **Liquidación**, elija una fecha de la quincena y pulse **Calcular**. Puede repetirlo: solo rehace lo no aprobado. Calcule las quincenas en orden: las recepciones anteriores aún sin liquidar entran en la que se calcule primero.
2. Abra **Ver detalle** y revise cada recepción.
3. Pulse **Aprobar y bloquear**. Una liquidación aprobada ya no cambia.
4. Use **Exportar a SICOOP** y **Exportar al fondo**.
5. Si cambian las reglas, agregue una versión de parámetros con su fecha de vigencia.

## Jefe de planta
1. En **Lotes y trazabilidad**, marque recepciones analizadas, escriba el código y cree el lote.
2. **Ver trazabilidad** muestra recepciones, productores y calidad del lote. **¿En qué lotes está?** hace la consulta inversa.

## Productor
En **Mi leche y mis pagos** consulta sus recepciones, resultados y liquidaciones aprobadas. Quien no tiene smartphone recibe el comprobante impreso y avisos por SMS.

## Gerencia
El **Tablero** muestra litros del día por centro, porcentaje de rechazos, recepciones sin resultado y valor estimado a pagar.

## Revisor fiscal
**Auditoría** muestra quién, cuándo y qué cambió, y las autorizaciones de datos. También puede consultar el tablero y la trazabilidad.

## Administrador
Tiene acceso a todos los módulos operativos y a la auditoría.
