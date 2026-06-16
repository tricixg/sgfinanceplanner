-- Per-user monthly contribution splits for shared savings goals.
-- Format: { "userId1": amount1, "userId2": amount2 }
-- Both members' amounts are stored so each can read their own share directly.
alter table savings_goals
  add column if not exists splits jsonb;
