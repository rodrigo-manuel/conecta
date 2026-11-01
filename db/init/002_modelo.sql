-- Modelo de datos de Conecta. Las reglas críticas (bloqueo y auditoría) viven en la base de datos:
-- se cumplen aunque alguien llegue por fuera de la API.

CREATE TABLE productor (
  id                    SERIAL PRIMARY KEY,
  codigo                TEXT NOT NULL UNIQUE,
  nombre                TEXT NOT NULL,
  telefono              TEXT NOT NULL,
  centro_id             INT NOT NULL REFERENCES centro_acopio (id),
  -- NULL: el asociado no autorizó ahorro voluntario.
  ahorro_autorizado_pct NUMERIC(4,2) CHECK (ahorro_autorizado_pct BETWEEN 0 AND 10),
  tiene_smartphone      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE usuario (
  id           SERIAL PRIMARY KEY,
  usuario      TEXT NOT NULL UNIQUE,
  nombre       TEXT NOT NULL,
  hash_clave   TEXT NOT NULL,
  rol          TEXT NOT NULL CHECK (rol IN (
                 'operador_acopio', 'analista_laboratorio', 'jefe_planta', 'coordinador_liquidacion',
                 'productor', 'gerencia', 'revisor_fiscal', 'administrador')),
  productor_id INT REFERENCES productor (id),
  centro_id    INT REFERENCES centro_acopio (id),
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK ((rol = 'productor') = (productor_id IS NOT NULL))
);

-- Ley 1581 de 2012: evidencia de la autorización de tratamiento de datos de cada productor.
CREATE TABLE autorizacion_datos (
  id             SERIAL PRIMARY KEY,
  productor_id   INT NOT NULL REFERENCES productor (id),
  version_politica TEXT NOT NULL,
  medio          TEXT NOT NULL CHECK (medio IN ('formato_fisico', 'portal', 'centro_acopio')),
  otorgada_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  registrada_por INT REFERENCES usuario (id)
);
CREATE INDEX ON autorizacion_datos (productor_id);

-- Parámetros de pago versionados: un cambio de reglas es una fila nueva, nunca una edición.
CREATE TABLE parametro_pago (
  vigente_desde DATE PRIMARY KEY,
  valores       JSONB NOT NULL,
  creado_por    INT REFERENCES usuario (id),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El id (UUID) lo genera el dispositivo. Reenviar la misma recepción no la duplica:
-- esa es la base de la sincronización sin conexión.
CREATE TABLE recepcion (
  id           UUID PRIMARY KEY,
  codigo       TEXT NOT NULL UNIQUE,
  productor_id INT NOT NULL REFERENCES productor (id),
  centro_id    INT NOT NULL REFERENCES centro_acopio (id),
  fecha_hora   TIMESTAMPTZ NOT NULL,
  fecha        DATE GENERATED ALWAYS AS ((fecha_hora AT TIME ZONE 'America/Bogota')::date) STORED,
  litros       NUMERIC(8,1) NOT NULL CHECK (litros > 0),
  temperatura  NUMERIC(4,1) NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'analizada', 'rechazada')),
  operador_id  INT REFERENCES usuario (id),
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON recepcion (productor_id, fecha);
CREATE INDEX ON recepcion (centro_id, fecha);
CREATE INDEX ON recepcion (fecha);
CREATE INDEX ON recepcion (estado);

CREATE TABLE resultado_laboratorio (
  recepcion_id UUID PRIMARY KEY REFERENCES recepcion (id),
  grasa        NUMERIC(4,2) NOT NULL CHECK (grasa >= 0),
  proteina     NUMERIC(4,2) NOT NULL CHECK (proteina >= 0),
  ufc          INT NOT NULL CHECK (ufc >= 0),
  antibioticos_positivo BOOLEAN NOT NULL,
  analista_id  INT REFERENCES usuario (id),
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE alerta (
  id           SERIAL PRIMARY KEY,
  tipo         TEXT NOT NULL,
  recepcion_id UUID NOT NULL REFERENCES recepcion (id),
  productor_id INT NOT NULL REFERENCES productor (id),
  mensaje      TEXT NOT NULL,
  creada_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registro del adaptador falso de SMS: permite demostrar el envío sin un proveedor real.
CREATE TABLE mensaje_saliente (
  id           SERIAL PRIMARY KEY,
  productor_id INT NOT NULL REFERENCES productor (id),
  canal        TEXT NOT NULL,
  texto        TEXT NOT NULL,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE liquidacion (
  id                SERIAL PRIMARY KEY,
  productor_id      INT NOT NULL REFERENCES productor (id),
  periodo_inicio    DATE NOT NULL,
  periodo_fin       DATE NOT NULL,
  estado            TEXT NOT NULL DEFAULT 'calculada' CHECK (estado IN ('calculada', 'aprobada')),
  litros            NUMERIC(12,1) NOT NULL,
  bruto             BIGINT NOT NULL,
  aporte_social     BIGINT NOT NULL,
  ahorro_voluntario BIGINT NOT NULL,
  neto              BIGINT NOT NULL,
  aprobada_por      INT REFERENCES usuario (id),
  aprobada_en       TIMESTAMPTZ,
  UNIQUE (productor_id, periodo_inicio)
);

-- recepcion_id es único: una recepción no se puede pagar dos veces.
CREATE TABLE liquidacion_detalle (
  liquidacion_id    INT NOT NULL REFERENCES liquidacion (id) ON DELETE CASCADE,
  recepcion_id      UUID NOT NULL UNIQUE REFERENCES recepcion (id),
  estado            TEXT NOT NULL,
  litros            NUMERIC(8,1) NOT NULL,
  precio_por_litro  INT NOT NULL,
  bruto             BIGINT NOT NULL,
  aporte_social     BIGINT NOT NULL,
  ahorro_voluntario BIGINT NOT NULL,
  neto              BIGINT NOT NULL,
  parametros_vigentes_desde DATE NOT NULL,
  PRIMARY KEY (liquidacion_id, recepcion_id)
);

CREATE TABLE lote (
  id        SERIAL PRIMARY KEY,
  codigo    TEXT NOT NULL UNIQUE,
  producto  TEXT NOT NULL,
  fecha     DATE NOT NULL,
  creado_por INT REFERENCES usuario (id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lote_recepcion (
  lote_id      INT NOT NULL REFERENCES lote (id),
  recepcion_id UUID NOT NULL REFERENCES recepcion (id),
  PRIMARY KEY (lote_id, recepcion_id)
);
CREATE INDEX ON lote_recepcion (recepcion_id);

-- ── Auditoría ───────────────────────────────────────────────────────────────
CREATE TABLE auditoria (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  INT REFERENCES usuario (id),
  operacion   TEXT NOT NULL,
  tabla       TEXT NOT NULL,
  registro_id TEXT,
  antes       JSONB,
  despues     JSONB,
  en          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON auditoria (tabla, registro_id);

-- La API declara quién actúa con set_config('conecta.usuario_id', ...) dentro de la transacción.
CREATE FUNCTION registrar_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_antes   JSONB;
  v_despues JSONB;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_antes := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_despues := to_jsonb(NEW); END IF;
  INSERT INTO auditoria (usuario_id, operacion, tabla, registro_id, antes, despues)
  VALUES (NULLIF(current_setting('conecta.usuario_id', TRUE), '')::INT, TG_OP, TG_TABLE_NAME,
          COALESCE(v_despues, v_antes) ->> TG_ARGV[0], v_antes, v_despues);
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER auditar_recepcion AFTER INSERT OR UPDATE OR DELETE ON recepcion
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria('id');
CREATE TRIGGER auditar_resultado AFTER INSERT OR UPDATE OR DELETE ON resultado_laboratorio
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria('recepcion_id');
CREATE TRIGGER auditar_liquidacion AFTER INSERT OR UPDATE OR DELETE ON liquidacion
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria('id');
CREATE TRIGGER auditar_parametros AFTER INSERT OR UPDATE OR DELETE ON parametro_pago
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria('vigente_desde');

-- El rastro no se puede editar ni borrar.
CREATE FUNCTION impedir_cambio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% no se puede modificar', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION impedir_cambio();
CREATE TRIGGER auditoria_sin_truncar BEFORE TRUNCATE ON auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION impedir_cambio();
CREATE TRIGGER parametros_inmutables BEFORE UPDATE OR DELETE ON parametro_pago
  FOR EACH ROW EXECUTE FUNCTION impedir_cambio();

-- ── Bloqueo de la liquidación aprobada ──────────────────────────────────────
CREATE FUNCTION bloquear_liquidacion_aprobada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado = 'aprobada' THEN
    RAISE EXCEPTION 'Una liquidación aprobada no se puede modificar' USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER liquidacion_bloqueada BEFORE UPDATE OR DELETE ON liquidacion
  FOR EACH ROW EXECUTE FUNCTION bloquear_liquidacion_aprobada();

CREATE FUNCTION bloquear_detalle_aprobado() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_id INT := CASE WHEN TG_OP = 'INSERT' THEN NEW.liquidacion_id ELSE OLD.liquidacion_id END;
BEGIN
  IF EXISTS (SELECT 1 FROM liquidacion WHERE id = v_id AND estado = 'aprobada') THEN
    RAISE EXCEPTION 'Una liquidación aprobada no se puede modificar' USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER detalle_bloqueado BEFORE INSERT OR UPDATE OR DELETE ON liquidacion_detalle
  FOR EACH ROW EXECUTE FUNCTION bloquear_detalle_aprobado();
