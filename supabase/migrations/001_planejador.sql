-- =====================================================================
-- Planejador de Conteúdo 2.0 · Descomplica Digital
-- Instalação completa do banco. Rode uma vez no SQL Editor do Supabase.
--
-- Princípios:
-- * Isolamento por agência: toda tabela tem agencia_id e RLS por membro.
-- * O cliente nunca fala direto com o banco. O portal chama rotas do
--   servidor, que validam o token e usam funções "revisao_*" liberadas
--   só para o service_role.
-- * Aprovação presa à versão: enviar para aprovação grava uma cópia
--   imutável (post_versoes). O cliente aprova a versão N; mudar o conteúdo
--   depois invalida a aprovação e o post volta para rascunho. Nada se apaga.
-- * Status de aprovação (aprovacao) separado do status de publicação
--   (publicacao): a decisão do cliente nunca se perde.
-- =====================================================================

-- ---------- Tabelas ----------
create table if not exists public.agencias (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) between 2 and 80),
  whatsapp text,
  -- regra explícita: mudar só data e horário de um post aprovado exige nova aprovação?
  reaprovar_ao_mudar_data boolean not null default false,
  criado_em timestamptz not null default now()
);

create table if not exists public.membros (
  agencia_id uuid not null references public.agencias(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'colaborador' check (papel in ('admin', 'colaborador')),
  nome text,
  email text,
  criado_em timestamptz not null default now(),
  primary key (agencia_id, usuario_id)
);
create index if not exists membros_usuario_idx on public.membros (usuario_id);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 80),
  usuario_ig text not null default '' check (length(usuario_ig) <= 30),
  nome_perfil text not null default '' check (length(nome_perfil) <= 30),
  categoria text not null default '' check (length(categoria) <= 40),
  bio text not null default '' check (char_length(bio) <= 150),
  link text not null default '' check (length(link) <= 300),
  avatar_path text,
  seguidores text not null default '',
  seguindo text not null default '',
  posts_base integer not null default 0 check (posts_base >= 0),
  destaques jsonb not null default '[]'::jsonb check (jsonb_typeof(destaques) = 'array'),
  whatsapp text not null default '',
  proporcao_grade text not null default '3:4' check (proporcao_grade in ('3:4', '4:5', '1:1')),
  excluido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists clientes_agencia_idx on public.clientes (agencia_id);

create table if not exists public.biblioteca (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  path text not null unique,
  nome text not null default '',
  tipo text not null check (tipo in ('imagem', 'video')),
  mime text not null default '',
  tamanho bigint not null default 0,
  largura integer,
  altura integer,
  excluido_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists biblioteca_cliente_idx on public.biblioteca (cliente_id);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null default 'planejado' check (tipo in ('planejado', 'existente')),
  formato text not null default 'imagem' check (formato in ('imagem', 'carrossel', 'reel', 'story')),
  publicar_em timestamptz not null,
  legenda text not null default '' check (char_length(legenda) <= 2200),
  -- [{path, tipo: imagem|video, largura, altura}] na ordem do carrossel
  midias jsonb not null default '[]'::jsonb check (jsonb_typeof(midias) = 'array'),
  -- {indice, path (capa própria do Reel), foco: {x, y} de 0 a 100, zoom}
  capa jsonb not null default '{}'::jsonb check (jsonb_typeof(capa) = 'object'),
  notas_internas text not null default '',
  aprovacao text not null default 'rascunho' check (aprovacao in ('rascunho', 'aguardando', 'ajustes', 'aprovado')),
  publicacao text not null default 'pendente' check (publicacao in ('pendente', 'agendado', 'publicado', 'cancelado')),
  fixado boolean not null default false,
  ordem_manual integer not null default 0,
  versao_atual integer not null default 0,
  versao_aprovada integer,
  data_alterada_apos_aprovacao boolean not null default false,
  -- contador para controle de concorrência otimista (o app manda o valor que leu)
  revisao integer not null default 1,
  excluido_em timestamptz,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists posts_cliente_data_idx on public.posts (cliente_id, publicar_em);
create index if not exists posts_agencia_idx on public.posts (agencia_id);

create table if not exists public.post_versoes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  agencia_id uuid not null references public.agencias(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  versao integer not null,
  conteudo jsonb not null,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (post_id, versao)
);

create table if not exists public.links_revisao (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  token_hash text not null unique,
  rotulo text not null default '',
  expira_em timestamptz,
  revogado_em timestamptz,
  ultimo_acesso_em timestamptz,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists links_cliente_idx on public.links_revisao (cliente_id);

create table if not exists public.decisoes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  agencia_id uuid not null references public.agencias(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  versao integer not null,
  acao text not null check (acao in ('aprovado', 'ajustes')),
  status_anterior text not null,
  revisor_nome text not null,
  comentario text not null default '',
  link_id uuid references public.links_revisao(id) on delete set null,
  registrado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists decisoes_post_idx on public.decisoes (post_id);

create table if not exists public.comentarios (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  agencia_id uuid not null references public.agencias(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  autor_tipo text not null check (autor_tipo in ('agencia', 'cliente')),
  autor_nome text not null default '',
  usuario_id uuid references auth.users(id) on delete set null,
  texto text not null check (length(trim(texto)) between 1 and 2000),
  midia_indice integer,
  trecho_legenda text,
  tempo_video numeric,
  interno boolean not null default false,
  resolvido boolean not null default false,
  resolvido_em timestamptz,
  versao integer,
  criado_em timestamptz not null default now()
);
create index if not exists comentarios_post_idx on public.comentarios (post_id);

create table if not exists public.conclusoes (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  link_id uuid references public.links_revisao(id) on delete set null,
  revisor_nome text not null default '',
  resumo jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  tipo text not null,
  texto text not null,
  lida_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists notificacoes_agencia_idx on public.notificacoes (agencia_id, criado_em desc);

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  agencia_id uuid not null references public.agencias(id) on delete cascade,
  cliente_id uuid,
  ator_tipo text not null,
  ator_id uuid,
  ator_nome text,
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists auditoria_agencia_idx on public.auditoria (agencia_id, criado_em desc);

create table if not exists public.modelos_legenda (
  id uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references public.agencias(id) on delete cascade,
  titulo text not null check (length(trim(titulo)) between 1 and 80),
  texto text not null default '' check (char_length(texto) <= 2200),
  criado_em timestamptz not null default now()
);

-- ---------- Permissões auxiliares ----------
create or replace function public.eh_membro(p_agencia uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where agencia_id = p_agencia and usuario_id = auth.uid());
$$;

create or replace function public.eh_admin(p_agencia uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where agencia_id = p_agencia and usuario_id = auth.uid() and papel = 'admin');
$$;

create or replace function public.minha_agencia()
returns uuid language sql stable security definer set search_path = public as $$
  select agencia_id from public.membros where usuario_id = auth.uid() order by criado_em limit 1;
$$;

create or replace function public.registrar_auditoria(p_agencia uuid, p_cliente uuid, p_ator_tipo text, p_ator_nome text, p_acao text, p_entidade text, p_id uuid, p_dados jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.auditoria (agencia_id, cliente_id, ator_tipo, ator_id, ator_nome, acao, entidade, entidade_id, dados)
  values (p_agencia, p_cliente, p_ator_tipo, auth.uid(), p_ator_nome, p_acao, p_entidade, p_id, coalesce(p_dados, '{}'::jsonb));
$$;

-- ---------- Integridade: agencia_id sempre vem do cliente ----------
create or replace function public.tg_agencia_do_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select agencia_id into v from public.clientes where id = new.cliente_id;
  if v is null then raise exception 'cliente_inexistente'; end if;
  if tg_op = 'UPDATE' and new.cliente_id is distinct from old.cliente_id then
    raise exception 'nao_pode_trocar_cliente';
  end if;
  new.agencia_id := v;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['biblioteca', 'posts', 'post_versoes', 'links_revisao', 'decisoes', 'comentarios', 'conclusoes'] loop
    execute format('drop trigger if exists agencia_do_cliente on public.%I', t);
    execute format('create trigger agencia_do_cliente before insert or update on public.%I for each row execute function public.tg_agencia_do_cliente()', t);
  end loop;
end $$;

create or replace function public.tg_clientes_atualizado()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' and new.agencia_id is distinct from old.agencia_id then raise exception 'nao_pode_trocar_agencia'; end if;
  return new;
end $$;
drop trigger if exists clientes_atualizado on public.clientes;
create trigger clientes_atualizado before update on public.clientes for each row execute function public.tg_clientes_atualizado();

-- ---------- Regras do post ----------
create or replace function public.tg_posts_regras()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  conteudo_mudou boolean;
  data_mudou boolean;
  reaprovar_data boolean;
begin
  if tg_op = 'INSERT' then
    new.revisao := 1;
    new.versao_atual := 0;
    new.versao_aprovada := null;
    new.data_alterada_apos_aprovacao := false;
    if new.tipo = 'existente' then
      new.aprovacao := 'rascunho';
      new.publicacao := 'publicado';
    else
      new.aprovacao := 'rascunho';
      if new.publicacao in ('agendado', 'publicado') then new.publicacao := 'pendente'; end if;
    end if;
    if new.formato = 'story' then new.fixado := false; end if;
    return new;
  end if;

  if new.tipo is distinct from old.tipo then raise exception 'nao_pode_trocar_tipo'; end if;
  new.revisao := old.revisao + 1;
  new.atualizado_em := now();
  if new.formato = 'story' then new.fixado := false; end if;

  if new.tipo = 'existente' then
    new.publicacao := 'publicado';
    return new;
  end if;

  conteudo_mudou := new.legenda is distinct from old.legenda or new.midias is distinct from old.midias
    or new.capa is distinct from old.capa or new.formato is distinct from old.formato;
  data_mudou := new.publicar_em is distinct from old.publicar_em;
  select reaprovar_ao_mudar_data into reaprovar_data from public.agencias where id = new.agencia_id;

  -- só invalida quando a mudança veio de fora das funções de aprovação
  if new.aprovacao = old.aprovacao and old.aprovacao in ('aguardando', 'aprovado')
     and (conteudo_mudou or (data_mudou and reaprovar_data)) then
    new.aprovacao := 'rascunho';
    if new.publicacao = 'agendado' then new.publicacao := 'pendente'; end if;
    new.data_alterada_apos_aprovacao := false;
    insert into public.notificacoes (agencia_id, cliente_id, post_id, tipo, texto)
    values (new.agencia_id, new.cliente_id, new.id, 'aprovacao_invalidada',
      case when old.aprovacao = 'aprovado' then 'Post aprovado foi editado e voltou para rascunho. Reenvie para aprovação.'
           else 'Post editado enquanto aguardava o cliente: voltou para rascunho. Reenvie para aprovação.' end);
    perform public.registrar_auditoria(new.agencia_id, new.cliente_id, 'agencia', null, 'aprovacao_invalidada', 'post', new.id,
      jsonb_build_object('status_anterior', old.aprovacao, 'versao', old.versao_atual));
  elsif data_mudou and old.aprovacao = 'aprovado' and new.aprovacao = 'aprovado' then
    -- regra explícita: com reaprovar_ao_mudar_data desligado, mudar a data é administrativo
    new.data_alterada_apos_aprovacao := true;
    perform public.registrar_auditoria(new.agencia_id, new.cliente_id, 'agencia', null, 'data_alterada_apos_aprovacao', 'post', new.id,
      jsonb_build_object('de', old.publicar_em, 'para', new.publicar_em));
  end if;

  if new.publicacao in ('agendado', 'publicado') and new.aprovacao <> 'aprovado' then
    raise exception 'so_aprovado_pode_ser_agendado';
  end if;

  if new.excluido_em is distinct from old.excluido_em then
    perform public.registrar_auditoria(new.agencia_id, new.cliente_id, 'agencia', null,
      case when new.excluido_em is null then 'restaurado' else 'enviado_lixeira' end, 'post', new.id, '{}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists posts_regras on public.posts;
create trigger posts_regras before insert or update on public.posts for each row execute function public.tg_posts_regras();

-- versões são imutáveis
create or replace function public.tg_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'registro_imutavel';
end $$;
drop trigger if exists versoes_imutaveis on public.post_versoes;
create trigger versoes_imutaveis before update on public.post_versoes for each row execute function public.tg_imutavel();
drop trigger if exists decisoes_imutaveis on public.decisoes;
create trigger decisoes_imutaveis before update on public.decisoes for each row execute function public.tg_imutavel();

-- comentário do cliente não muda de texto; a agência só marca resolvido
create or replace function public.tg_comentarios_regras()
returns trigger language plpgsql as $$
begin
  if new.texto is distinct from old.texto or new.autor_tipo is distinct from old.autor_tipo
     or new.autor_nome is distinct from old.autor_nome or new.interno is distinct from old.interno
     or new.post_id is distinct from old.post_id then
    raise exception 'comentario_so_pode_ser_resolvido';
  end if;
  new.resolvido_em := case when new.resolvido then coalesce(old.resolvido_em, now()) else null end;
  return new;
end $$;
drop trigger if exists comentarios_regras on public.comentarios;
create trigger comentarios_regras before update on public.comentarios for each row execute function public.tg_comentarios_regras();

-- ---------- RLS ----------
alter table public.agencias enable row level security;
alter table public.membros enable row level security;
alter table public.clientes enable row level security;
alter table public.biblioteca enable row level security;
alter table public.posts enable row level security;
alter table public.post_versoes enable row level security;
alter table public.links_revisao enable row level security;
alter table public.decisoes enable row level security;
alter table public.comentarios enable row level security;
alter table public.conclusoes enable row level security;
alter table public.notificacoes enable row level security;
alter table public.auditoria enable row level security;
alter table public.modelos_legenda enable row level security;

drop policy if exists agencias_ler on public.agencias;
create policy agencias_ler on public.agencias for select to authenticated using (public.eh_membro(id));
drop policy if exists agencias_editar on public.agencias;
create policy agencias_editar on public.agencias for update to authenticated using (public.eh_admin(id)) with check (public.eh_admin(id));

drop policy if exists membros_ler on public.membros;
create policy membros_ler on public.membros for select to authenticated using (public.eh_membro(agencia_id));
drop policy if exists membros_remover on public.membros;
create policy membros_remover on public.membros for delete to authenticated using (public.eh_admin(agencia_id) and usuario_id <> auth.uid());

do $$
declare t text;
begin
  foreach t in array array['clientes', 'biblioteca', 'posts', 'comentarios', 'modelos_legenda'] loop
    execute format('drop policy if exists %1$s_membro on public.%1$I', t);
    execute format('create policy %1$s_membro on public.%1$I for all to authenticated using (public.eh_membro(agencia_id)) with check (public.eh_membro(agencia_id))', t);
  end loop;
  foreach t in array array['post_versoes', 'decisoes', 'conclusoes', 'auditoria', 'links_revisao'] loop
    execute format('drop policy if exists %1$s_ler on public.%1$I', t);
    execute format('create policy %1$s_ler on public.%1$I for select to authenticated using (public.eh_membro(agencia_id))', t);
  end loop;
end $$;

drop policy if exists notificacoes_ler on public.notificacoes;
create policy notificacoes_ler on public.notificacoes for select to authenticated using (public.eh_membro(agencia_id));
drop policy if exists notificacoes_marcar on public.notificacoes;
create policy notificacoes_marcar on public.notificacoes for update to authenticated using (public.eh_membro(agencia_id)) with check (public.eh_membro(agencia_id));

-- ---------- Privilégios ----------
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.clientes, public.biblioteca, public.modelos_legenda to authenticated;
grant update on public.agencias to authenticated;
grant delete on public.membros to authenticated;
grant insert, delete on public.posts to authenticated;
-- aprovacao, versões e revisao só mudam pelas funções
grant update (formato, publicar_em, legenda, midias, capa, notas_internas, publicacao, fixado, ordem_manual, excluido_em) on public.posts to authenticated;
grant insert on public.comentarios to authenticated;
grant update (resolvido) on public.comentarios to authenticated;
grant update (lida_em) on public.notificacoes to authenticated;
grant all on all tables in schema public to service_role;

-- comentário criado pela agência sempre sai como agência
create or replace function public.tg_comentario_agencia()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.autor_tipo := 'agencia';
    new.usuario_id := auth.uid();
    select coalesce(nullif(nome, ''), email, 'Agência') into new.autor_nome from public.membros
      where usuario_id = auth.uid() and agencia_id = new.agencia_id;
    new.autor_nome := coalesce(new.autor_nome, 'Agência');
    select versao_atual into new.versao from public.posts where id = new.post_id;
  end if;
  return new;
end $$;
drop trigger if exists comentario_agencia on public.comentarios;
create trigger comentario_agencia before insert on public.comentarios for each row execute function public.tg_comentario_agencia();

-- ---------- Funções da agência ----------
create or replace function public.criar_agencia(p_nome text, p_nome_usuario text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; e text;
begin
  if auth.uid() is null then raise exception 'sem_sessao'; end if;
  if exists (select 1 from public.membros where usuario_id = auth.uid()) then raise exception 'ja_tem_agencia'; end if;
  insert into public.agencias (nome) values (trim(p_nome)) returning id into v;
  select email into e from auth.users where id = auth.uid();
  insert into public.membros (agencia_id, usuario_id, papel, nome, email) values (v, auth.uid(), 'admin', nullif(trim(p_nome_usuario), ''), e);
  return v;
end $$;

create or replace function public.snapshot_post(p public.posts)
returns jsonb language sql immutable as $$
  select jsonb_build_object('formato', p.formato, 'publicar_em', p.publicar_em, 'legenda', p.legenda, 'midias', p.midias, 'capa', p.capa);
$$;

create or replace function public.enviar_para_aprovacao(p_posts uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare p public.posts; n integer := 0;
begin
  for p in select * from public.posts where id = any(p_posts) for update loop
    if not public.eh_membro(p.agencia_id) then raise exception 'sem_permissao'; end if;
    if p.tipo <> 'planejado' or p.excluido_em is not null then continue; end if;
    if p.aprovacao not in ('rascunho', 'ajustes') then continue; end if;
    if jsonb_array_length(p.midias) = 0 then raise exception 'post_sem_midia: %', to_char(p.publicar_em at time zone 'America/Sao_Paulo', 'DD/MM'); end if;
    insert into public.post_versoes (post_id, cliente_id, versao, conteudo, criado_por)
      values (p.id, p.cliente_id, p.versao_atual + 1, public.snapshot_post(p), auth.uid());
    update public.posts set aprovacao = 'aguardando', versao_atual = p.versao_atual + 1, data_alterada_apos_aprovacao = false where id = p.id;
    perform public.registrar_auditoria(p.agencia_id, p.cliente_id, 'agencia', null, 'enviado_para_aprovacao', 'post', p.id, jsonb_build_object('versao', p.versao_atual + 1));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.voltar_para_rascunho(p_post uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.posts;
begin
  select * into p from public.posts where id = p_post for update;
  if p.id is null or not public.eh_membro(p.agencia_id) then raise exception 'sem_permissao'; end if;
  if p.aprovacao not in ('aguardando', 'aprovado', 'ajustes') then return; end if;
  if p.publicacao in ('agendado', 'publicado') then raise exception 'post_ja_agendado'; end if;
  update public.posts set aprovacao = 'rascunho' where id = p_post;
  perform public.registrar_auditoria(p.agencia_id, p.cliente_id, 'agencia', null, 'voltou_para_rascunho', 'post', p.id, jsonb_build_object('status_anterior', p.aprovacao));
end $$;

create or replace function public.registrar_aprovacao_manual(p_post uuid, p_nome text, p_observacao text default '')
returns void language plpgsql security definer set search_path = public as $$
declare p public.posts;
begin
  select * into p from public.posts where id = p_post for update;
  if p.id is null or not public.eh_membro(p.agencia_id) then raise exception 'sem_permissao'; end if;
  if p.aprovacao not in ('aguardando', 'ajustes') then raise exception 'post_nao_esta_em_aprovacao'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'informe_quem_aprovou'; end if;
  insert into public.decisoes (post_id, cliente_id, versao, acao, status_anterior, revisor_nome, comentario, registrado_por)
    values (p.id, p.cliente_id, p.versao_atual, 'aprovado', p.aprovacao, trim(p_nome) || ' (registrado pela agência)', coalesce(p_observacao, ''), auth.uid());
  update public.posts set aprovacao = 'aprovado', versao_aprovada = p.versao_atual where id = p.id;
  perform public.registrar_auditoria(p.agencia_id, p.cliente_id, 'agencia', null, 'aprovacao_manual', 'post', p.id, jsonb_build_object('versao', p.versao_atual, 'revisor', p_nome));
end $$;

create or replace function public.duplicar_post(p_post uuid, p_quando timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare p public.posts; v uuid;
begin
  select * into p from public.posts where id = p_post;
  if p.id is null or not public.eh_membro(p.agencia_id) then raise exception 'sem_permissao'; end if;
  insert into public.posts (cliente_id, tipo, formato, publicar_em, legenda, midias, capa, notas_internas, criado_por)
    values (p.cliente_id, p.tipo, p.formato, coalesce(p_quando, p.publicar_em), p.legenda, p.midias, p.capa, p.notas_internas, auth.uid())
    returning id into v;
  return v;
end $$;

create or replace function public.duplicar_periodo(p_cliente uuid, p_de date, p_ate date, p_para date)
returns integer language plpgsql security definer set search_path = public as $$
declare c public.clientes; n integer;
begin
  select * into c from public.clientes where id = p_cliente;
  if c.id is null or not public.eh_membro(c.agencia_id) then raise exception 'sem_permissao'; end if;
  if p_ate < p_de or p_ate - p_de > 92 then raise exception 'periodo_invalido'; end if;
  insert into public.posts (cliente_id, tipo, formato, publicar_em, legenda, midias, capa, notas_internas, criado_por)
    select cliente_id, 'planejado', formato, publicar_em + ((p_para - p_de) * interval '1 day'), legenda, midias, capa, notas_internas, auth.uid()
    from public.posts
    where cliente_id = p_cliente and tipo = 'planejado' and excluido_em is null
      and (publicar_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate;
  get diagnostics n = row_count;
  return n;
end $$;

-- token aleatório (2 UUID v4 = 244 bits); só o hash fica gravado
create or replace function public.hash_token(p text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex');
$$;

create or replace function public.criar_link_revisao(p_cliente uuid, p_rotulo text default '', p_dias integer default 30)
returns text language plpgsql security definer set search_path = public as $$
declare c public.clientes; t text;
begin
  select * into c from public.clientes where id = p_cliente and excluido_em is null;
  if c.id is null or not public.eh_membro(c.agencia_id) then raise exception 'sem_permissao'; end if;
  t := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.links_revisao (cliente_id, token_hash, rotulo, expira_em, criado_por)
    values (p_cliente, public.hash_token(t), coalesce(p_rotulo, ''),
            case when coalesce(p_dias, 0) > 0 then now() + make_interval(days => least(p_dias, 365)) end, auth.uid());
  perform public.registrar_auditoria(c.agencia_id, c.id, 'agencia', null, 'link_criado', 'link', null, jsonb_build_object('dias', p_dias));
  return t;
end $$;

create or replace function public.revogar_link(p_link uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l public.links_revisao;
begin
  select * into l from public.links_revisao where id = p_link;
  if l.id is null or not public.eh_membro(l.agencia_id) then raise exception 'sem_permissao'; end if;
  update public.links_revisao set revogado_em = coalesce(revogado_em, now()) where id = p_link;
  perform public.registrar_auditoria(l.agencia_id, l.cliente_id, 'agencia', null, 'link_revogado', 'link', l.id, '{}'::jsonb);
end $$;

-- convite de colaborador: a rota do servidor confere que quem chama é admin e cria o usuário
create or replace function public.adicionar_membro(p_agencia uuid, p_usuario uuid, p_papel text, p_email text, p_nome text)
returns void language sql security definer set search_path = public as $$
  insert into public.membros (agencia_id, usuario_id, papel, email, nome)
  values (p_agencia, p_usuario, case when p_papel = 'admin' then 'admin' else 'colaborador' end, p_email, nullif(p_nome, ''))
  on conflict (agencia_id, usuario_id) do update set papel = excluded.papel;
$$;

-- ---------- Funções do portal do cliente (só service_role) ----------
create or replace function public.revisao_link(p_token text)
returns public.links_revisao language plpgsql security definer set search_path = public as $$
declare l public.links_revisao;
begin
  select * into l from public.links_revisao where token_hash = public.hash_token(p_token);
  if l.id is null or l.revogado_em is not null or (l.expira_em is not null and l.expira_em < now()) then
    raise exception 'link_invalido';
  end if;
  if not exists (select 1 from public.clientes where id = l.cliente_id and excluido_em is null) then raise exception 'link_invalido'; end if;
  return l;
end $$;

create or replace function public.post_para_cliente(p public.posts)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; versao_mostrada integer;
begin
  if p.tipo = 'existente' then
    v := public.snapshot_post(p);
    versao_mostrada := null;
  else
    versao_mostrada := case when p.aprovacao = 'aprovado' then coalesce(p.versao_aprovada, p.versao_atual) else p.versao_atual end;
    select conteudo into v from public.post_versoes where post_id = p.id and versao = versao_mostrada;
    if v is null then return null; end if;
    -- data é administrativa: mostra a atual
    v := v || jsonb_build_object('publicar_em', p.publicar_em);
  end if;
  return v || jsonb_build_object(
    'id', p.id, 'tipo', p.tipo, 'aprovacao', case when p.tipo = 'existente' then 'publicado' else p.aprovacao end,
    'publicacao', p.publicacao, 'fixado', p.fixado, 'ordem_manual', p.ordem_manual, 'versao', versao_mostrada,
    'comentarios', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'autor_tipo', c.autor_tipo, 'autor_nome', c.autor_nome, 'texto', c.texto,
        'midia_indice', c.midia_indice, 'trecho_legenda', c.trecho_legenda, 'tempo_video', c.tempo_video, 'resolvido', c.resolvido, 'versao', c.versao, 'criado_em', c.criado_em) order by c.criado_em)
      from public.comentarios c where c.post_id = p.id and not c.interno), '[]'::jsonb),
    'decisoes', coalesce((select jsonb_agg(jsonb_build_object('acao', d.acao, 'versao', d.versao, 'revisor_nome', d.revisor_nome, 'criado_em', d.criado_em) order by d.criado_em)
      from public.decisoes d where d.post_id = p.id), '[]'::jsonb));
end $$;

create or replace function public.revisao_dados(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.links_revisao; c public.clientes; a public.agencias; posts jsonb;
begin
  l := public.revisao_link(p_token);
  update public.links_revisao set ultimo_acesso_em = now() where id = l.id;
  select * into c from public.clientes where id = l.cliente_id;
  select * into a from public.agencias where id = l.agencia_id;
  select coalesce(jsonb_agg(x.j order by (x.j->>'publicar_em')), '[]'::jsonb) into posts from (
    select public.post_para_cliente(p) j from public.posts p
    where p.cliente_id = c.id and p.excluido_em is null and p.publicacao <> 'cancelado'
      and (p.tipo = 'existente' or p.aprovacao in ('aguardando', 'ajustes', 'aprovado'))
  ) x where x.j is not null;
  return jsonb_build_object(
    'cliente', jsonb_build_object('nome', c.nome, 'usuario_ig', c.usuario_ig, 'nome_perfil', c.nome_perfil, 'categoria', c.categoria, 'bio', c.bio,
      'link', c.link, 'avatar_path', c.avatar_path, 'seguidores', c.seguidores, 'seguindo', c.seguindo, 'posts_base', c.posts_base,
      'destaques', c.destaques, 'proporcao_grade', c.proporcao_grade),
    'agencia', jsonb_build_object('nome', a.nome, 'whatsapp', a.whatsapp),
    'link', jsonb_build_object('rotulo', l.rotulo, 'expira_em', l.expira_em),
    -- o servidor só assina arquivos desta pasta (impede apontar para mídia de outro cliente)
    'prefixo', c.agencia_id::text || '/' || c.id::text || '/',
    'posts', posts);
end $$;

create or replace function public.revisao_checar_conclusao(l public.links_revisao, p_nome text)
returns boolean language plpgsql security definer set search_path = public as $$
declare abertos integer; v_resumo jsonb;
begin
  select count(*) into abertos from public.posts
    where cliente_id = l.cliente_id and tipo = 'planejado' and excluido_em is null and publicacao <> 'cancelado' and aprovacao = 'aguardando';
  if abertos > 0 then return false; end if;
  select coalesce(jsonb_agg(jsonb_build_object('post_id', id, 'versao', versao_atual, 'aprovacao', aprovacao, 'publicar_em', publicar_em) order by publicar_em), '[]'::jsonb)
    into v_resumo from public.posts
    where cliente_id = l.cliente_id and tipo = 'planejado' and excluido_em is null and publicacao <> 'cancelado' and aprovacao in ('aprovado', 'ajustes');
  -- evita conclusão repetida para o mesmo estado
  if exists (select 1 from public.conclusoes c where c.cliente_id = l.cliente_id and c.resumo = v_resumo) then return true; end if;
  insert into public.conclusoes (cliente_id, link_id, revisor_nome, resumo) values (l.cliente_id, l.id, p_nome, v_resumo);
  insert into public.notificacoes (agencia_id, cliente_id, tipo, texto)
    values (l.agencia_id, l.cliente_id, 'revisao_concluida', trim(p_nome) || ' concluiu a revisão do planejamento.');
  return true;
end $$;

create or replace function public.revisao_decidir(p_token text, p_post uuid, p_versao integer, p_acao text, p_nome text, p_comentario text default '', p_midia_indice integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.links_revisao; p public.posts; nome text := trim(coalesce(p_nome, '')); txt text := trim(coalesce(p_comentario, '')); concluiu boolean;
begin
  l := public.revisao_link(p_token);
  if p_acao not in ('aprovado', 'ajustes') then raise exception 'acao_invalida'; end if;
  if length(nome) < 2 then raise exception 'informe_seu_nome'; end if;
  if p_acao = 'ajustes' and length(txt) < 3 then raise exception 'descreva_o_ajuste'; end if;
  select * into p from public.posts where id = p_post for update;
  if p.id is null or p.cliente_id <> l.cliente_id or p.excluido_em is not null or p.tipo <> 'planejado' then raise exception 'post_invalido'; end if;
  if p.versao_atual <> p_versao then raise exception 'versao_desatualizada'; end if;
  if p.aprovacao = p_acao then return jsonb_build_object('aprovacao', p.aprovacao, 'repetido', true); end if;
  if p.aprovacao not in ('aguardando', 'ajustes', 'aprovado') then raise exception 'post_nao_esta_em_aprovacao'; end if;
  if p.aprovacao = 'aprovado' and p.publicacao <> 'pendente' then raise exception 'post_ja_agendado'; end if;

  insert into public.decisoes (post_id, cliente_id, versao, acao, status_anterior, revisor_nome, comentario, link_id)
    values (p.id, p.cliente_id, p.versao_atual, p_acao, p.aprovacao, nome, txt, l.id);
  if length(txt) > 0 then
    insert into public.comentarios (post_id, cliente_id, autor_tipo, autor_nome, texto, midia_indice, versao)
      values (p.id, p.cliente_id, 'cliente', nome, txt, p_midia_indice, p.versao_atual);
  end if;
  update public.posts set aprovacao = p_acao, versao_aprovada = case when p_acao = 'aprovado' then p.versao_atual else versao_aprovada end where id = p.id;
  insert into public.notificacoes (agencia_id, cliente_id, post_id, tipo, texto)
    values (p.agencia_id, p.cliente_id, p.id, case when p_acao = 'aprovado' then 'aprovado' else 'ajustes' end,
      nome || case when p_acao = 'aprovado' then ' aprovou o post de ' else ' pediu ajuste no post de ' end
        || to_char(p.publicar_em at time zone 'America/Sao_Paulo', 'DD/MM') || case when length(txt) > 0 then ': ' || left(txt, 140) else '.' end);
  perform public.registrar_auditoria(p.agencia_id, p.cliente_id, 'cliente', nome, 'decisao_' || p_acao, 'post', p.id,
    jsonb_build_object('versao', p.versao_atual, 'status_anterior', p.aprovacao, 'link_id', l.id));
  concluiu := public.revisao_checar_conclusao(l, nome);
  return jsonb_build_object('aprovacao', p_acao, 'concluiu', concluiu);
end $$;

create or replace function public.revisao_aprovar_lote(p_token text, p_itens jsonb, p_nome text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.links_revisao; it jsonb; p public.posts; nome text := trim(coalesce(p_nome, '')); ok integer := 0; pulados integer := 0; concluiu boolean;
begin
  l := public.revisao_link(p_token);
  if length(nome) < 2 then raise exception 'informe_seu_nome'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 or jsonb_array_length(p_itens) > 200 then raise exception 'lista_invalida'; end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    select * into p from public.posts where id = (it->>'post_id')::uuid for update;
    -- lote só aprova o que está aguardando, na versão que o cliente viu; ajustes nunca entram
    if p.id is null or p.cliente_id <> l.cliente_id or p.excluido_em is not null or p.tipo <> 'planejado'
       or p.aprovacao <> 'aguardando' or p.versao_atual <> (it->>'versao')::integer then
      pulados := pulados + 1; continue;
    end if;
    insert into public.decisoes (post_id, cliente_id, versao, acao, status_anterior, revisor_nome, comentario, link_id)
      values (p.id, p.cliente_id, p.versao_atual, 'aprovado', p.aprovacao, nome, 'Aprovado em lote', l.id);
    update public.posts set aprovacao = 'aprovado', versao_aprovada = p.versao_atual where id = p.id;
    perform public.registrar_auditoria(p.agencia_id, p.cliente_id, 'cliente', nome, 'decisao_aprovado_lote', 'post', p.id, jsonb_build_object('versao', p.versao_atual));
    ok := ok + 1;
  end loop;
  if ok > 0 then
    insert into public.notificacoes (agencia_id, cliente_id, tipo, texto)
      values (l.agencia_id, l.cliente_id, 'aprovado', nome || ' aprovou ' || ok || ' post' || case when ok > 1 then 's' else '' end || ' de uma vez.');
  end if;
  concluiu := public.revisao_checar_conclusao(l, nome);
  return jsonb_build_object('aprovados', ok, 'pulados', pulados, 'concluiu', concluiu);
end $$;

create or replace function public.revisao_comentar(p_token text, p_post uuid, p_nome text, p_texto text, p_midia_indice integer default null, p_trecho text default null, p_tempo numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare l public.links_revisao; p public.posts; v uuid; nome text := trim(coalesce(p_nome, ''));
begin
  l := public.revisao_link(p_token);
  if length(nome) < 2 then raise exception 'informe_seu_nome'; end if;
  if length(trim(coalesce(p_texto, ''))) < 1 then raise exception 'comentario_vazio'; end if;
  select * into p from public.posts where id = p_post;
  if p.id is null or p.cliente_id <> l.cliente_id or p.excluido_em is not null or p.tipo <> 'planejado'
     or p.aprovacao not in ('aguardando', 'ajustes', 'aprovado') then raise exception 'post_invalido'; end if;
  insert into public.comentarios (post_id, cliente_id, autor_tipo, autor_nome, texto, midia_indice, trecho_legenda, tempo_video, versao)
    values (p.id, p.cliente_id, 'cliente', nome, left(trim(p_texto), 2000), p_midia_indice, left(p_trecho, 300), p_tempo, p.versao_atual)
    returning id into v;
  insert into public.notificacoes (agencia_id, cliente_id, post_id, tipo, texto)
    values (p.agencia_id, p.cliente_id, p.id, 'comentario', nome || ' comentou no post de ' || to_char(p.publicar_em at time zone 'America/Sao_Paulo', 'DD/MM') || ': ' || left(trim(p_texto), 140));
  return v;
end $$;

-- ---------- Execução das funções ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.eh_membro(uuid), public.eh_admin(uuid), public.minha_agencia(),
  public.criar_agencia(text, text), public.enviar_para_aprovacao(uuid[]), public.voltar_para_rascunho(uuid),
  public.registrar_aprovacao_manual(uuid, text, text), public.duplicar_post(uuid, timestamptz),
  public.duplicar_periodo(uuid, date, date, date), public.criar_link_revisao(uuid, text, integer), public.revogar_link(uuid)
  to authenticated;
grant execute on all functions in schema public to service_role;

-- ---------- Armazenamento privado das mídias ----------
-- Pasta: <agencia_id>/<cliente_id>/<arquivo>. Só membros da agência leem e gravam.
-- O cliente vê as mídias por URLs assinadas e temporárias geradas no servidor.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('midias', 'midias', false, 104857600,
      array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    execute 'drop policy if exists midias_membro_ler on storage.objects';
    execute 'create policy midias_membro_ler on storage.objects for select to authenticated using (bucket_id = ''midias'' and public.eh_membro(((storage.foldername(name))[1])::uuid))';
    execute 'drop policy if exists midias_membro_gravar on storage.objects';
    execute 'create policy midias_membro_gravar on storage.objects for insert to authenticated with check (bucket_id = ''midias'' and public.eh_membro(((storage.foldername(name))[1])::uuid))';
    execute 'drop policy if exists midias_membro_apagar on storage.objects';
    execute 'create policy midias_membro_apagar on storage.objects for delete to authenticated using (bucket_id = ''midias'' and public.eh_membro(((storage.foldername(name))[1])::uuid))';
  end if;
end $$;

-- ---------- Tempo real (atualiza a tela da agência quando o cliente decide) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin execute 'alter publication supabase_realtime add table public.posts'; exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.notificacoes'; exception when duplicate_object then null; end;
  end if;
end $$;
