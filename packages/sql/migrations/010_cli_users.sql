-- =============================================================
-- 010_cli_users.sql
-- CLI authentication users
-- Uses pgcrypto crypt() (bcrypt) — no external library needed
-- =============================================================

CREATE TABLE cli_users (
  id           BIGSERIAL    NOT NULL,
  username     TEXT         NOT NULL,
  password_hash TEXT        NOT NULL,  -- crypt(password, gen_salt('bf', 12))
  role         TEXT         NOT NULL DEFAULT 'ANALYST',  -- ANALYST / MANAGER / DBA / SECURITY_ADMIN
  active       BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT cli_users_pkey PRIMARY KEY (id),
  CONSTRAINT cli_users_username_unique UNIQUE (username),
  CONSTRAINT cli_users_role_check CHECK (
    role IN ('ANALYST', 'MANAGER', 'DBA', 'SECURITY_ADMIN')
  )
);

-- Seed: dev users (passwords are the same as the username for dev convenience)
-- In production, rotate these immediately via /api/v1/auth/change-password
INSERT INTO cli_users (username, password_hash, role) VALUES
  ('admin',   crypt('admin',   gen_salt('bf', 12)), 'DBA'),
  ('manager', crypt('manager', gen_salt('bf', 12)), 'MANAGER'),
  ('analyst', crypt('analyst', gen_salt('bf', 12)), 'ANALYST');

COMMENT ON TABLE cli_users IS 'CLI/API authentication users. Passwords stored as pgcrypto bcrypt hashes.';
COMMENT ON COLUMN cli_users.password_hash IS 'crypt(plain_password, gen_salt(''bf'', 12)). Verify with: password_hash = crypt($input, password_hash).';
