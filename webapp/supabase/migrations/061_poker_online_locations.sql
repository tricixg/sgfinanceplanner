-- Online vs offline (live) poker locations/sessions

alter table poker_locations
  add column if not exists is_online boolean not null default false;

alter table poker_sessions
  add column if not exists is_online boolean not null default false;

create index if not exists poker_sessions_user_online_idx
  on poker_sessions (user_id, is_online);

-- Retroactively tag known online-poker platform locations.
update poker_locations
set is_online = true
where is_online = false
  and lower(trim(name)) in ('xpoker', 'poker now', 'pokernow');

update poker_sessions s
set is_online = true
from poker_locations pl
where pl.user_id = s.user_id
  and pl.name = s.location
  and pl.is_online = true
  and s.is_online = false;

-- One-off: the N8 (Natural8) tournament logged under location "Other"
-- gets a proper online location of its own.
insert into poker_locations (user_id, name, is_online)
select user_id, 'N8', true
from poker_sessions
where id = '308f6851-06de-4e25-b6a5-0b8d53a6d597'
on conflict (user_id, name) do update set is_online = true;

update poker_sessions
set location = 'N8', venue = 'N8', is_online = true, updated_at = now()
where id = '308f6851-06de-4e25-b6a5-0b8d53a6d597';
