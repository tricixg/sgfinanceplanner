-- Allow savings_transactions rows with no account or pool target.
-- Used for personal loan payment records when no cash account is selected
-- (balance is updated on the loan record only; no ledger sync).

alter table savings_transactions
  drop constraint savings_transactions_one_target;

alter table savings_transactions
  add constraint savings_transactions_one_target check (
    (account_id is not null and pool_id is null)
    or (pool_id is not null and account_id is null)
    or (account_id is null and pool_id is null)
  );

-- RLS policy so users can manage their own no-account rows
create policy "Users manage own no-account transactions"
  on savings_transactions for all
  using (
    account_id is null
    and pool_id is null
    and user_id = auth.uid()
  )
  with check (
    account_id is null
    and pool_id is null
    and user_id = auth.uid()
  );
