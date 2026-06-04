-- Telegram bot: account linking and conversation state

create table if not exists telegram_link_codes (
  code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists telegram_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  telegram_user_id bigint not null,
  telegram_chat_id bigint not null,
  username text,
  linked_at timestamptz not null default now(),
  constraint telegram_links_user_id_key unique (user_id),
  constraint telegram_links_telegram_user_id_key unique (telegram_user_id),
  constraint telegram_links_telegram_chat_id_key unique (telegram_chat_id)
);

create table if not exists telegram_conversations (
  chat_id bigint primary key,
  flow text not null default '',
  step text not null default '',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists telegram_link_codes_user_expires_idx
  on telegram_link_codes (user_id, expires_at);

alter table telegram_link_codes enable row level security;
alter table telegram_links enable row level security;
alter table telegram_conversations enable row level security;

create policy "Users manage own telegram link codes"
  on telegram_link_codes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users read own telegram links"
  on telegram_links for select
  using (user_id = auth.uid());

create policy "Users delete own telegram links"
  on telegram_links for delete
  using (user_id = auth.uid());
