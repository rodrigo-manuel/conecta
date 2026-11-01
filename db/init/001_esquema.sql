-- Esquema inicial de Conecta. Se ejecuta solo la primera vez que se crea la base de datos.
CREATE TABLE IF NOT EXISTS centro_acopio (
  id        SERIAL PRIMARY KEY,
  nombre    TEXT NOT NULL UNIQUE,
  municipio TEXT NOT NULL
);

INSERT INTO centro_acopio (nombre, municipio) VALUES
  ('Agustín Codazzi', 'Agustín Codazzi, Cesar'),
  ('Bosconia', 'Bosconia, Cesar'),
  ('Fundación', 'Fundación, Magdalena'),
  ('San Juan del Cesar', 'San Juan del Cesar, La Guajira')
ON CONFLICT (nombre) DO NOTHING;