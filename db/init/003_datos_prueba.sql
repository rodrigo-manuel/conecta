-- Datos de prueba ficticios: 32 productores, 4 centros, 30 días de recepciones y un usuario por rol.
-- Clave de todos los usuarios de prueba: Conecta2026! (solo para este ambiente; ver README).
BEGIN;
SELECT setseed(0.2026);

INSERT INTO parametro_pago (vigente_desde, valores) VALUES ('2026-01-01', '{
  "vigenteDesde": "2026-01-01", "precioBase": 1850,
  "grasaReferencia": 3.5, "ajustePorDecimaGrasa": 15,
  "proteinaReferencia": 3.1, "ajustePorDecimaProteina": 20,
  "ufcLimiteBonificacion": 100000, "bonificacionUfc": 40,
  "ufcLimitePenalizacion": 300000, "penalizacionUfc": 60,
  "temperaturaMaxima": 8, "penalizacionTemperatura": 25,
  "aporteSocialPct": 2, "ahorroMaximoPct": 10
}');

-- Nombres combinados e inventados; teléfonos en un rango no asignable.
INSERT INTO productor (codigo, nombre, telefono, centro_id, ahorro_autorizado_pct, tiene_smartphone)
SELECT
  'PR-' || lpad(n::text, 4, '0'),
  (ARRAY['Abel','Berta','Ciro','Dalia','Efraín','Fanny','Gabino','Hilda'])[1 + (n - 1) % 8] || ' ' ||
  (ARRAY['Ariza','Barros','Cuello','Daza','Echeverry','Fragozo','Guerra','Hinojosa'])[1 + ((n - 1) / 8) % 8] || ' (ficticio)',
  '300000' || lpad(n::text, 4, '0'),
  1 + (n - 1) % 4,
  CASE n % 4 WHEN 0 THEN NULL WHEN 1 THEN 5 WHEN 2 THEN 10 ELSE 0 END,
  n % 3 = 0
FROM generate_series(1, 32) AS n;

INSERT INTO autorizacion_datos (productor_id, version_politica, medio, otorgada_en)
SELECT id, 'v1.0-2026', 'formato_fisico', now() - interval '60 days' FROM productor;

INSERT INTO usuario (usuario, nombre, hash_clave, rol, productor_id, centro_id)
SELECT u.usuario, u.nombre, '$2b$10$iIZ8cwwvD7s4SF/kt3gch.bK5X9m4uAb7ppw0nHf8YLUIUZ1tssqu', u.rol,
       (SELECT id FROM productor WHERE codigo = u.productor), u.centro
FROM (VALUES
  ('operador',    'Olga Operadora (ficticia)',   'operador_acopio',         NULL,      1),
  ('analista',    'Ana Analista (ficticia)',     'analista_laboratorio',    NULL,      NULL),
  ('jefeplanta',  'Julio Jefe (ficticio)',       'jefe_planta',             NULL,      NULL),
  ('coordinador', 'Carla Coordinadora (ficticia)', 'coordinador_liquidacion', NULL,    NULL),
  ('productor',   'Abel Ariza (ficticio)',       'productor',               'PR-0001', NULL),
  ('productor2',  'Berta Ariza (ficticia)',      'productor',               'PR-0002', NULL),
  ('gerencia',    'Gema Gerente (ficticia)',     'gerencia',                NULL,      NULL),
  ('revisor',     'Raúl Revisor (ficticio)',     'revisor_fiscal',          NULL,      NULL),
  ('admin',       'Adriana Admin (ficticia)',    'administrador',           NULL,      NULL)
) AS u (usuario, nombre, rol, productor, centro);

-- 30 días hasta hoy: una recepción por productor y por día, en la mañana.
CREATE TEMP TABLE semilla ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, p.id AS productor_id, p.centro_id, d::date AS dia,
       ((d::date + time '06:00' + random() * interval '3 hours') AT TIME ZONE 'America/Bogota') AS fecha_hora,
       round((40 + random() * 180)::numeric, 1) AS litros,
       round((4 + random() * 5.5)::numeric, 1) AS temperatura
FROM productor p
CROSS JOIN generate_series(
  (now() AT TIME ZONE 'America/Bogota')::date - 29,
  (now() AT TIME ZONE 'America/Bogota')::date, interval '1 day') AS d;

INSERT INTO recepcion (id, codigo, productor_id, centro_id, fecha_hora, litros, temperatura, operador_id)
SELECT id, 'REC-' || upper(replace(left(id::text, 13), '-', '')), productor_id, centro_id, fecha_hora,
       litros, temperatura, (SELECT id FROM usuario WHERE usuario = 'operador')
FROM semilla;

-- El laboratorio tarda hasta 48 horas: los dos últimos días quedan en parte sin resultado.
INSERT INTO resultado_laboratorio (recepcion_id, grasa, proteina, ufc, antibioticos_positivo, analista_id, registrado_en)
SELECT s.id, round((3.1 + random() * 1.0)::numeric, 2), round((2.8 + random() * 0.7)::numeric, 2),
       (20000 + random() * 380000)::int, random() < 0.02,
       (SELECT id FROM usuario WHERE usuario = 'analista'), s.fecha_hora + interval '24 hours'
FROM semilla s
WHERE s.dia < (now() AT TIME ZONE 'America/Bogota')::date - 1 OR random() < 0.3;

UPDATE recepcion r
SET estado = CASE WHEN l.antibioticos_positivo THEN 'rechazada' ELSE 'analizada' END
FROM resultado_laboratorio l WHERE l.recepcion_id = r.id;

INSERT INTO alerta (tipo, recepcion_id, productor_id, mensaje)
SELECT 'antibioticos', r.id, r.productor_id, 'Antibióticos positivos en la recepción ' || r.codigo
FROM recepcion r WHERE r.estado = 'rechazada';

INSERT INTO lote (codigo, producto, fecha)
VALUES ('LOTE-DEMO-001', 'Queso costeño', (now() AT TIME ZONE 'America/Bogota')::date - 5);

INSERT INTO lote_recepcion (lote_id, recepcion_id)
SELECT 1, r.id FROM recepcion r
WHERE r.fecha = (now() AT TIME ZONE 'America/Bogota')::date - 6 AND r.estado = 'analizada'
LIMIT 12;
COMMIT;
