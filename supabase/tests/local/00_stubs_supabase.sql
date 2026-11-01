-- Stubs mínimos do que o Supabase já tem, para validar as migrações num
-- Postgres local. NUNCA rode isto no projeto Supabase.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text);
-- igual ao auth.uid() do Supabase: lê o "sub" do JWT repassado pelo PostgREST
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- default privileges como no Supabase: tudo para anon/authenticated em objeto novo
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
