-- Tournament rebuys and PKO bounties (buy_in remains initial entry only)

alter table poker_sessions
  add column if not exists rebuy_amount numeric not null default 0,
  add column if not exists bounty_amount numeric not null default 0;

alter table poker_sessions
  drop constraint if exists poker_sessions_rebuy_amount_nonneg;

alter table poker_sessions
  add constraint poker_sessions_rebuy_amount_nonneg
  check (rebuy_amount >= 0);

alter table poker_sessions
  drop constraint if exists poker_sessions_bounty_amount_nonneg;

alter table poker_sessions
  add constraint poker_sessions_bounty_amount_nonneg
  check (bounty_amount >= 0);
