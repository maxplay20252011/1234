-- Solo para probar en un Postgres local: crea los roles de Supabase con sus permisos por defecto
-- (todo lo nuevo en "public" queda concedido a anon), así la prueba de seguridad es realista.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
