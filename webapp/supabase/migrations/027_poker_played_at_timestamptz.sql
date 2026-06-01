-- Store session start as timestamptz (was date-only).
alter table poker_sessions
  alter column played_at type timestamptz
  using (
    case
      when played_at is null then now()
      else (played_at::text || 'T00:00:00+08:00')::timestamptz
    end
  );
