# Task 4 — System design

The search timeouts line up with MySQL at 90% CPU, so the time is being spent executing queries.

Two causes fit a jump from 1,000 users to 50,000. The search statement is reading far too many rows. A missing index, a leading-wildcard `LIKE`, or an `ORDER BY` on an unindexed column turns into a full scan and a filesort once `artists` is no longer small. The endpoint then repeats that work on every call: no page cap, an N+1 fan-out, or no cache in front of a hot query. I would confirm this before changing the design. Enable the slow query log, run `EXPLAIN ANALYZE` on the exact search statement, and compare rows examined with rows sent. During peak, the statement digest in `performance_schema` and `SHOW PROCESSLIST` show whether this one statement owns the CPU.

The 48-hour fix is two online changes. Add a composite index that matches the search filter and the `ORDER BY`, built with `ALGORITHM=INPLACE, LOCK=NONE` so the table stays available. Cap the page size, and cache the hottest search responses in Redis with a short TTL, so repeated peak traffic stops reaching MySQL.

Long term I would move artist search to a dedicated engine such as OpenSearch. MySQL stays the source of truth for users, bookings, and payments. Profile changes flow across through an outbox or CDC. The trade-off is eventual consistency: a profile edit can take a short time to appear in search, and the team runs another system. That trade is acceptable because search read traffic is what is saturating MySQL, while a booking still has to commit transactionally.
