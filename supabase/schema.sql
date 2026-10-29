-- Estante: esquema do banco (cole tudo no SQL Editor do Supabase e clique em Run)

-- Perfis (nome exibido de cada pessoa) -------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

-- Obras ---------------------------------------------------------------------
create table public.works (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 150),
  fandom text not null default '',
  rating text not null default 'NR' check (rating in ('G','T','M','E','NR')),
  status text not null default 'wip' check (status in ('wip','done','hiatus')),
  warnings text[] not null default '{}',
  extra_warnings text[] not null default '{}',
  tags text[] not null default '{}',
  summary text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Capítulos -----------------------------------------------------------------
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  position int not null,
  title text not null default '',
  body text not null,
  format text not null default 'text' check (format in ('text','html')),
  notes_start text not null default '',
  notes_end text not null default '',
  words int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.chapters (work_id, position);

-- Curtidas e comentários (por capítulo) -------------------------------------
create table public.likes (
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chapter_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.comments (chapter_id, created_at);

-- Código de convite (opcional) ----------------------------------------------
-- Se esta tabela tiver alguma linha, só cria conta quem informar um código igual.
-- Se ficar vazia, qualquer pessoa com o link pode criar conta.
create table public.invite (code text primary key);
alter table public.invite enable row level security;  -- sem políticas: ninguém lê pelo site
-- Para ativar, descomente e troque o código:
-- insert into public.invite (code) values ('troque-este-codigo');

-- Cria o perfil automaticamente quando alguém se cadastra --------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.invite)
     and not exists (select 1 from public.invite where code = new.raw_user_meta_data->>'invite') then
    raise exception 'Código de convite inválido';
  end if;
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)), 40));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Segurança (Row Level Security) --------------------------------------------
alter table public.profiles enable row level security;
alter table public.works    enable row level security;
alter table public.chapters enable row level security;
alter table public.likes    enable row level security;
alter table public.comments enable row level security;

-- Leitura aberta. Para exigir login também para LER, troque "anon, authenticated"
-- por "authenticated" nas cinco políticas de select abaixo.
create policy "ler perfis"      on public.profiles for select to anon, authenticated using (true);
create policy "ler obras"       on public.works    for select to anon, authenticated using (true);
create policy "ler capitulos"   on public.chapters for select to anon, authenticated using (true);
create policy "ler curtidas"    on public.likes    for select to anon, authenticated using (true);
create policy "ler comentarios" on public.comments for select to anon, authenticated using (true);

create policy "editar proprio perfil" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Obras: só a autoria cria, edita e apaga
create policy "criar obra"   on public.works for insert to authenticated with check (author_id = auth.uid());
create policy "editar obra"  on public.works for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "apagar obra"  on public.works for delete to authenticated using (author_id = auth.uid());

-- Capítulos: só a autoria da obra mexe
create policy "criar capitulo" on public.chapters for insert to authenticated
  with check (exists (select 1 from public.works w where w.id = work_id and w.author_id = auth.uid()));
create policy "editar capitulo" on public.chapters for update to authenticated
  using (exists (select 1 from public.works w where w.id = work_id and w.author_id = auth.uid()));
create policy "apagar capitulo" on public.chapters for delete to authenticated
  using (exists (select 1 from public.works w where w.id = work_id and w.author_id = auth.uid()));

-- Curtidas: cada pessoa cria e remove só as suas
create policy "curtir"      on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy "descurtir"   on public.likes for delete to authenticated using (user_id = auth.uid());

-- Comentários: qualquer pessoa logada comenta; apaga quem escreveu ou a autoria da obra
create policy "comentar" on public.comments for insert to authenticated with check (user_id = auth.uid());
create policy "apagar comentario" on public.comments for delete to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.chapters c join public.works w on w.id = c.work_id
             where c.id = chapter_id and w.author_id = auth.uid())
);
