CREATE TABLE IF NOT EXISTS countries (
  code  VARCHAR(6)   PRIMARY KEY,           -- ISO 3166-1 alpha-2 lowercase, or e.g. "um-wq" for minor territories (matches SVG ids)
  name  VARCHAR(80)  NOT NULL
);

CREATE TABLE IF NOT EXISTS travellers (
  id     SERIAL       PRIMARY KEY,
  name   VARCHAR(30)  NOT NULL UNIQUE CHECK (char_length(trim(name)) BETWEEN 1 AND 30),
  color  CHAR(7)      NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$')
);

CREATE TABLE IF NOT EXISTS visits (
  traveller_id  INTEGER     NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
  country_code  VARCHAR(6)  NOT NULL REFERENCES countries(code),
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (traveller_id, country_code)
);
