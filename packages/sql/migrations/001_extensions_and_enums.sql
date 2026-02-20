-- =============================================================
-- 001_extensions_and_enums.sql
-- Terminal-First Streaming Data Console v1
-- =============================================================

-- -----------------------------------------------
-- Extensions
-- -----------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------
-- ENUM Types
-- -----------------------------------------------

CREATE TYPE change_request_status AS ENUM (
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'WAITING_EXECUTION',
  'EXECUTING',
  'DONE',
  'FAILED',
  'REVERTED'
);

CREATE TYPE execution_mode AS ENUM (
  'AUTO',
  'CONFIRM',
  'MANUAL'
);

CREATE TYPE risk_level AS ENUM (
  'L0',
  'L1',
  'L2'
);

CREATE TYPE environment AS ENUM (
  'LOCAL',
  'DEV',
  'PROD'
);

CREATE TYPE user_role AS ENUM (
  'ANALYST',
  'MANAGER',
  'DBA',
  'SECURITY_ADMIN'
);

CREATE TYPE audit_category AS ENUM (
  'CHANGE',
  'AUTH',
  'POLICY',
  'SECURITY'
);

CREATE TYPE audit_result AS ENUM (
  'SUCCESS',
  'FAILURE'
);

CREATE TYPE key_status AS ENUM (
  'ACTIVE',
  'PREVIOUS',
  'RETIRED'
);
