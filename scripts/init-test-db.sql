CREATE DATABASE threadline_test OWNER threadline;

-- Roles and schema that a Supabase database has, so the local Supabase Auth server can run.
CREATE ROLE postgres NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA IF NOT EXISTS auth;
\connect threadline_test
CREATE SCHEMA IF NOT EXISTS auth;
