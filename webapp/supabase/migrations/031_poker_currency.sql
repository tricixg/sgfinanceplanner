-- Poker session currency + FX rate to SGD for stats and ledger

alter table poker_sessions
  add column if not exists currency text not null default 'SGD',
  add column if not exists fx_rate_to_sgd numeric not null default 1,
  add column if not exists fx_rate_manual boolean not null default false;
