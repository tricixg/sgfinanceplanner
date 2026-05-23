-- Couples: household pairing, split savings (personal vs joint), paginated expenses
-- Run after 002_per_user_auth.sql

-- ---------------------------------------------------------------------------
-- Households & members
-- ---------------------------------------------------------------------------
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create index if not exists household_members_user_id_idx on household_members (user_id);

-- ---------------------------------------------------------------------------
-- Partner invites (email must match invitee auth email on accept)
-- ---------------------------------------------------------------------------
create table if not exists partner_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  invitee_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists partner_invites_pending_unique
  on partner_invites (inviter_id, lower(invitee_email))
  where status = 'pending';

create index if not exists partner_invites_invitee_email_idx
  on partner_invites (lower(invitee_email), status);

-- ---------------------------------------------------------------------------
-- Savings: personal accounts, joint pools, goals (individual | shared)
-- ---------------------------------------------------------------------------
create table if not exists user_savings_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  balance numeric not null default 0,
  notes text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_savings_accounts_user_idx
  on user_savings_accounts (user_id);

create table if not exists savings_pools (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null default '',
  balance numeric not null default 0,
  notes text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists savings_pools_household_idx
  on savings_pools (household_id);

create table if not exists savings_goals (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('individual', 'shared')),
  owner_user_id uuid references auth.users (id) on delete cascade,
  household_id uuid references households (id) on delete cascade,
  name text not null default '',
  target_amount numeric not null default 0,
  saved_amount numeric not null default 0,
  target_date date,
  monthly_contribution numeric not null default 0,
  where_label text not null default '',
  linked_account_id uuid references user_savings_accounts (id) on delete set null,
  linked_pool_id uuid references savings_pools (id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_goals_scope_owner check (
    (scope = 'individual' and owner_user_id is not null and household_id is null)
    or (scope = 'shared' and household_id is not null and owner_user_id is null)
  )
);

create index if not exists savings_goals_owner_idx
  on savings_goals (owner_user_id) where scope = 'individual';

create index if not exists savings_goals_household_idx
  on savings_goals (household_id) where scope = 'shared';

-- ---------------------------------------------------------------------------
-- Expenses (personal only — high volume, paginated in app)
-- ---------------------------------------------------------------------------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric not null,
  category text not null default '',
  spent_at date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_user_spent_at_idx
  on expenses (user_id, spent_at desc, id desc);

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from household_members hm
    where hm.household_id = hid and hm.user_id = auth.uid()
  );
$$;

create or replace function public.my_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from household_members where user_id = auth.uid() limit 1;
$$;

-- households
alter table households enable row level security;

create policy "Members can read own household"
  on households for select
  using (public.is_household_member(id));

create policy "Authenticated users can create household"
  on households for insert
  with check (auth.uid() is not null);

-- household_members
alter table household_members enable row level security;

create policy "Members can read household members"
  on household_members for select
  using (public.is_household_member(household_id));

create policy "Users can read own membership"
  on household_members for select
  using (user_id = auth.uid());

create policy "Users can insert own membership"
  on household_members for insert
  with check (user_id = auth.uid());

create policy "Users can update own membership"
  on household_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own membership"
  on household_members for delete
  using (user_id = auth.uid());

-- partner_invites
alter table partner_invites enable row level security;

create policy "Inviter can manage own invites"
  on partner_invites for all
  using (inviter_id = auth.uid())
  with check (inviter_id = auth.uid());

create policy "Invitee can read pending by email"
  on partner_invites for select
  using (
    status = 'pending'
    and lower(invitee_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy "Invitee can respond to pending"
  on partner_invites for update
  using (
    status = 'pending'
    and lower(invitee_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    lower(invitee_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- user_savings_accounts
alter table user_savings_accounts enable row level security;

create policy "Users manage own savings accounts"
  on user_savings_accounts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- savings_pools
alter table savings_pools enable row level security;

create policy "Household members manage joint pools"
  on savings_pools for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- savings_goals
alter table savings_goals enable row level security;

create policy "Users manage individual goals"
  on savings_goals for all
  using (scope = 'individual' and owner_user_id = auth.uid())
  with check (scope = 'individual' and owner_user_id = auth.uid());

create policy "Household members manage shared goals"
  on savings_goals for all
  using (scope = 'shared' and public.is_household_member(household_id))
  with check (scope = 'shared' and public.is_household_member(household_id));

-- expenses
alter table expenses enable row level security;

create policy "Users manage own expenses"
  on expenses for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
