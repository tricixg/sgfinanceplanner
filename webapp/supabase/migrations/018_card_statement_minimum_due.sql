-- Minimum payment due on card statements (run after 017_card_statements.sql)

alter table card_statements
  add column if not exists minimum_due numeric;
