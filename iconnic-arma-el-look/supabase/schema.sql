-- =====================================================================
--  Armá el look · ranking y administración (Supabase / Postgres 15+)
--  Pegá este archivo completo en Supabase → SQL Editor → Run.
--  Se puede volver a correr: no borra datos.
--
--  Seguridad, en una línea: el navegador SOLO puede llamar a ranking().
--  Todo lo demás (guardar partidas, sumar puntos, borrar) lo hacen las
--  Edge Functions con la clave de servicio, que nunca llega al navegador.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tablas ----------

-- Una fila por jugadora (por dispositivo). El bonus de la admin vive acá.
create table if not exists public.players (
  device_id  text primary key check (char_length(device_id) between 8 and 64),
  name       text not null check (char_length(name) between 1 and 20),
  bonus      int  not null default 0 check (bonus between -3000 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partidas iniciadas: el servidor sortea las consignas y entrega un ticket.
create table if not exists public.games (
  id         uuid primary key default gen_random_uuid(),
  device_id  text not null,
  ip         text,
  consignas  text[] not null,
  created_at timestamptz not null default now(),
  used_at    timestamptz
);

-- Partidas terminadas. El total lo recalcula el servidor.
create table if not exists public.scores (
  id          uuid primary key default gen_random_uuid(),
  device_id   text not null references public.players(device_id) on delete cascade,
  player_name text not null check (char_length(player_name) between 1 and 20),
  game_id     uuid unique references public.games(id) on delete set null,
  total       int  not null check (total between 0 and 300),
  rounds      jsonb not null,  -- [{consigna, prendas:[ids], puntaje}]
  ip          text,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.admin_log (
  id          bigint generated always as identity primary key,
  action      text not null check (action in ('bonus', 'delete', 'restore')),
  target      text not null,   -- device_id
  target_name text,            -- apodo en ese momento
  amount      int,             -- puntos (bonus) o partidas afectadas (delete/restore)
  reason      text,
  created_at  timestamptz not null default now()
);

create table if not exists public.admin_sessions (
  token_hash text primary key,  -- sha256 del token; el token en sí no se guarda
  expires_at timestamptz not null
);

create table if not exists public.login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  ok boolean not null,
  at timestamptz not null default now()
);

create table if not exists public.login_locks (
  ip    text primary key,
  until timestamptz not null
);

-- Si la base es de una versión anterior: nombres de 1 a 20 caracteres.
alter table public.players drop constraint if exists players_name_check;
alter table public.players add constraint players_name_check check (char_length(name) between 1 and 20);
alter table public.scores drop constraint if exists scores_player_name_check;
alter table public.scores add constraint scores_player_name_check check (char_length(player_name) between 1 and 20);

-- ---------- Índices ----------
-- Un nombre por persona: no se repite (sin distinguir mayúsculas).
create unique index if not exists players_nombre_unico on public.players (lower(name));
create index if not exists scores_device_idx  on public.scores (device_id, created_at desc);
create index if not exists scores_rank_idx    on public.scores (created_at) where not deleted;
create index if not exists games_device_idx   on public.games (device_id, created_at desc);
create index if not exists games_ip_idx       on public.games (ip, created_at desc);
create index if not exists attempts_ip_idx    on public.login_attempts (ip, at desc);

-- ---------- Row Level Security: nadie entra directo ----------
-- RLS activado y SIN políticas = el navegador (anon) no puede leer ni escribir.
alter table public.players        enable row level security;
alter table public.games          enable row level security;
alter table public.scores         enable row level security;
alter table public.admin_log      enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.login_attempts enable row level security;
alter table public.login_locks    enable row level security;

-- Y además se quitan los permisos que Supabase da por defecto.
revoke all on table public.players, public.games, public.scores, public.admin_log,
  public.admin_sessions, public.login_attempts, public.login_locks from anon, authenticated;

-- =====================================================================
--  RANKING (lo único público)
--  Mejor partida por jugadora + su bonus. Empate: gana quien llegó primero.
--  No devuelve device_id de nadie: solo "esVos" para la que pregunta.
-- =====================================================================
create or replace function public.ranking(p_desde timestamptz default null, p_device text default null, p_limite int default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  with mejores as (
    select distinct on (s.device_id) s.device_id, s.total, s.created_at
    from scores s
    where not s.deleted and (p_desde is null or s.created_at >= p_desde)
    order by s.device_id, s.total desc, s.created_at asc
  ), tabla as (
    select m.device_id, p.name, m.total + p.bonus as puntaje, m.created_at,
           row_number() over (order by m.total + p.bonus desc, m.created_at asc) as posicion
    from mejores m join players p using (device_id)
  )
  select jsonb_build_object(
    'total', (select count(*) from tabla),
    'filas', coalesce((
      select jsonb_agg(jsonb_build_object('posicion', posicion, 'nombre', name, 'puntaje', greatest(puntaje, 0),
                                          'fecha', created_at, 'esVos', device_id = p_device) order by posicion)
      from tabla where posicion <= least(greatest(coalesce(p_limite, 50), 1), 100)), '[]'::jsonb),
    'yo', (select jsonb_build_object('posicion', posicion, 'nombre', name, 'puntaje', greatest(puntaje, 0),
                                     'fecha', created_at, 'esVos', true)
           from tabla where p_device is not null and device_id = p_device)
  );
$$;

-- ¿Está libre este nombre? (público: los nombres ya se ven en el ranking). Tu propio nombre cuenta como libre.
create or replace function public.nombre_disponible(p_nombre text, p_device text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from players where lower(name) = lower(btrim(p_nombre)) and device_id is distinct from p_device);
$$;

-- =====================================================================
--  PARTIDAS (solo Edge Functions, con clave de servicio)
-- =====================================================================
create or replace function public.iniciar_partida(p_device text, p_ip text, p_consignas text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if (select count(*) from games where device_id = p_device and created_at > now() - interval '1 hour') >= 30
     or (p_ip is not null and (select count(*) from games where ip = p_ip and created_at > now() - interval '1 hour') >= 120) then
    return jsonb_build_object('ok', false, 'error', 'demasiadas_partidas');
  end if;
  delete from games where used_at is null and created_at < now() - interval '1 day';
  insert into games (device_id, ip, consignas) values (p_device, p_ip, p_consignas) returning id into v_id;
  return jsonb_build_object('ok', true, 'gameId', v_id, 'consignas', to_jsonb(p_consignas));
end $$;

create or replace function public.registrar_partida(p_game uuid, p_device text, p_nombre text, p_consignas text[],
                                                    p_total int, p_rounds jsonb, p_ip text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g games; v_ult timestamptz; r jsonb;
begin
  select * into g from games where id = p_game for update;
  if not found or g.device_id <> p_device then return jsonb_build_object('ok', false, 'error', 'partida_invalida'); end if;
  if g.used_at is not null then return jsonb_build_object('ok', false, 'error', 'partida_usada'); end if;
  if g.consignas <> p_consignas then return jsonb_build_object('ok', false, 'error', 'consignas_distintas'); end if;
  if now() - g.created_at < interval '15 seconds' then return jsonb_build_object('ok', false, 'error', 'muy_rapida'); end if;
  if now() - g.created_at > interval '3 hours' then return jsonb_build_object('ok', false, 'error', 'partida_vencida'); end if;
  select max(created_at) into v_ult from scores where device_id = p_device;
  if v_ult is not null and now() - v_ult < interval '60 seconds' then
    return jsonb_build_object('ok', false, 'error', 'espera', 'segundos', ceil(60 - extract(epoch from now() - v_ult)));
  end if;
  if exists (select 1 from players where lower(name) = lower(p_nombre) and device_id <> p_device) then
    return jsonb_build_object('ok', false, 'error', 'nombre_en_uso');
  end if;
  begin
    insert into players (device_id, name) values (p_device, p_nombre)
      on conflict (device_id) do update set name = excluded.name, updated_at = now();
  exception when unique_violation then  -- otra persona lo tomó en el mismo instante
    return jsonb_build_object('ok', false, 'error', 'nombre_en_uso');
  end;
  insert into scores (device_id, player_name, game_id, total, rounds, ip) values (p_device, p_nombre, p_game, p_total, p_rounds, p_ip);
  update games set used_at = now() where id = p_game;
  r := ranking(null, p_device, 1);
  return jsonb_build_object('ok', true, 'total', p_total, 'posicion', r->'yo'->'posicion', 'de', r->'total');
end $$;

-- =====================================================================
--  ADMIN (solo Edge Functions). La contraseña NO está acá: la valida la
--  función admin-login contra el secreto ADMIN_PASSWORD.
-- =====================================================================
create or replace function public.admin_ip_bloqueada(p_ip text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from login_locks where ip = p_ip and until > now());
$$;

-- 5 fallos seguidos (en 10 minutos) bloquean esa IP durante 10 minutos.
create or replace function public.admin_registrar_intento(p_ip text, p_ok boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_desde timestamptz; v_fallos int;
begin
  insert into login_attempts (ip, ok) values (p_ip, p_ok);
  delete from login_attempts where at < now() - interval '1 day';
  if p_ok then return jsonb_build_object('bloqueada', false); end if;
  select greatest(now() - interval '10 minutes', coalesce((select until from login_locks where ip = p_ip), '-infinity'),
                  coalesce((select max(at) from login_attempts where ip = p_ip and ok), '-infinity'))
    into v_desde;
  select count(*) into v_fallos from login_attempts where ip = p_ip and not ok and at >= v_desde;
  if v_fallos >= 5 then
    insert into login_locks (ip, until) values (p_ip, now() + interval '10 minutes')
      on conflict (ip) do update set until = excluded.until;
    return jsonb_build_object('bloqueada', true);
  end if;
  return jsonb_build_object('bloqueada', false, 'restantes', 5 - v_fallos);
end $$;

create or replace function public.admin_crear_sesion(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from admin_sessions where expires_at < now();
  insert into admin_sessions (token_hash, expires_at) values (encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), now() + interval '30 minutes');
$$;

create or replace function public.admin_sesion_valida(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_sessions
                 where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and expires_at > now());
$$;

create or replace function public.admin_listar()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) from (
    select jsonb_build_object(
      'deviceId', p.device_id, 'nombre', p.name, 'bonus', p.bonus,
      'mejor', (select max(total) from scores s where s.device_id = p.device_id and not s.deleted),
      'partidas', (select count(*) from scores s where s.device_id = p.device_id and not s.deleted),
      'borradas', (select count(*) from scores s where s.device_id = p.device_id and s.deleted),
      'ultima', (select max(created_at) from scores s where s.device_id = p.device_id)) as x
    from players p) t;
$$;

create or replace function public.admin_sumar(p_device text, p_cantidad int, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v players;
begin
  if p_cantidad is null or p_cantidad = 0 or p_cantidad < -300 or p_cantidad > 300 then
    return jsonb_build_object('ok', false, 'error', 'cantidad_invalida'); end if;
  if coalesce(btrim(p_motivo), '') = '' then return jsonb_build_object('ok', false, 'error', 'falta_motivo'); end if;
  update players set bonus = bonus + p_cantidad, updated_at = now() where device_id = p_device returning * into v;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_existe'); end if;
  insert into admin_log (action, target, target_name, amount, reason) values ('bonus', p_device, v.name, p_cantidad, left(btrim(p_motivo), 200));
  return jsonb_build_object('ok', true, 'bonus', v.bonus);
end $$;

-- Borrado lógico de lo jugado hasta ahora. Si vuelve a jugar, aparece con las partidas nuevas.
create or replace function public.admin_borrar(p_device text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n int; v_nombre text;
begin
  select name into v_nombre from players where device_id = p_device;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_existe'); end if;
  update scores set deleted = true where device_id = p_device and not deleted;
  get diagnostics v_n = row_count;
  insert into admin_log (action, target, target_name, amount, reason) values ('delete', p_device, v_nombre, v_n, left(btrim(p_motivo), 200));
  return jsonb_build_object('ok', true, 'partidas', v_n);
end $$;

create or replace function public.admin_restaurar(p_device text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n int; v_nombre text;
begin
  select name into v_nombre from players where device_id = p_device;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_existe'); end if;
  update scores set deleted = false where device_id = p_device and deleted;
  get diagnostics v_n = row_count;
  insert into admin_log (action, target, target_name, amount) values ('restore', p_device, v_nombre, v_n);
  return jsonb_build_object('ok', true, 'partidas', v_n);
end $$;

create or replace function public.admin_historial(p_limite int default 200)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'accion', action, 'deviceId', target, 'nombre', target_name,
                                               'cantidad', amount, 'motivo', reason, 'fecha', created_at) order by id desc), '[]'::jsonb)
  from (select * from admin_log order by id desc limit least(greatest(coalesce(p_limite, 200), 1), 500)) l;
$$;

-- ---------- Permisos de ejecución ----------
-- Por defecto Postgres deja ejecutar funciones a cualquiera: se quita y se da a mano.
do $$
declare f text;
begin
  foreach f in array array[
    'ranking(timestamptz, text, int)',
    'iniciar_partida(text, text, text[])',
    'registrar_partida(uuid, text, text, text[], int, jsonb, text)',
    'admin_ip_bloqueada(text)', 'admin_registrar_intento(text, boolean)', 'admin_crear_sesion(text)',
    'admin_sesion_valida(text)', 'admin_listar()', 'admin_sumar(text, int, text)', 'admin_borrar(text, text)',
    'admin_restaurar(text)', 'admin_historial(int)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
-- Las únicas funciones públicas (solo leen):
revoke all on function public.nombre_disponible(text, text) from public;
grant execute on function public.ranking(timestamptz, text, int) to anon, authenticated;
grant execute on function public.nombre_disponible(text, text) to anon, authenticated, service_role;
