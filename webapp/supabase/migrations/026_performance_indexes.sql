-- Speed up savings transaction history by user + date (transactions list, ledger).
create index if not exists savings_transactions_user_occurred_idx
  on savings_transactions (user_id, occurred_at desc);
