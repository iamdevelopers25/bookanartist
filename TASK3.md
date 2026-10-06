# Task 3 — SQL and schema audit

## Task A — Leaderboard query

`GET /artists/leaderboard` should return the top 10 artists by average review score over the last 90 days.

I only count a review when its booking is `completed`. That is the same rule as `GET /artists/:id/reviews`, so the two endpoints stay consistent. `total_completed_booking_count` is all completed bookings for that artist, including ones older than 90 days. The brief calls it a total and uses it as the tiebreaker, so I did not limit that count to the window.

```sql
SELECT
  a.name AS artist_name,
  a.category,
  ROUND(AVG(r.score), 2) AS average_score,
  COUNT(r.id) AS total_review_count,
  cb.total_completed_booking_count
FROM reviews r
INNER JOIN bookings bk
  ON bk.id = r.booking_id
 AND bk.status = 'completed'
INNER JOIN artists a
  ON a.id = r.artist_id
INNER JOIN (
  SELECT artist_id, COUNT(*) AS total_completed_booking_count
  FROM bookings
  WHERE status = 'completed'
  GROUP BY artist_id
) cb ON cb.artist_id = a.id
WHERE r.created_at >= UTC_TIMESTAMP() - INTERVAL 90 DAY
GROUP BY a.id, a.name, a.category, cb.total_completed_booking_count
HAVING COUNT(r.id) >= 5
ORDER BY average_score DESC, total_completed_booking_count DESC
LIMIT 10;
```

In the app, reviews live in MongoDB and bookings live in MySQL, which is what the stack asks for. The route applies the same rules there. The query above is the MySQL version of that endpoint, written against the schema in this task.

### Indexes

Two indexes.

```sql
ALTER TABLE reviews
  ADD INDEX idx_reviews_created_artist_score (created_at, artist_id, score, booking_id);

ALTER TABLE bookings
  ADD INDEX idx_bookings_status_artist (status, artist_id);
```

`created_at` has to be the first column on the reviews index. The filter is a range (`>= now - 90 days`), and MySQL can only use a range on the leading column. `artist_id`, `score`, and `booking_id` are in the same index so the average, the count, and the join back to `bookings` can be done from the index. Without those columns it still finds the rows, then it goes back to the table for every one of them.

`idx_bookings_status_artist` is for the subquery: `status = 'completed'`, then group by `artist_id`. The overlap check in `POST /bookings` needs a different index, `(artist_id, status, event_start, event_end)`, because that query already has the artist id. I would not add that one just for the leaderboard. Extra indexes slow down inserts, and this query does not use it.

`reviews.booking_id` joins to `bookings.id`, which is the primary key, so that join is a point lookup. Same for `artists.id`.

### Large scale

Once reviews are in the tens of millions I would stop running this aggregate on the request. I would keep a small `artist_leaderboard` table (artist id, average score, review count, completed booking count, window end) and refresh it every few minutes. The endpoint just reads 10 rows. A new review can update that row directly, and the job fixes anything that drifted. Partition `reviews` by month so the rebuild only reads the recent partitions.

The leaderboard can be a few minutes behind. That is fine. The overlap check on a new booking still has to run inside the transaction, because two clients booking the same slot cannot wait for a job.

## Task B — Schema audit

Five problems in the sample schema. The foreign key changes will fail if orphan rows are still in the tables, so those need to be cleaned up first.

### 1. Money is stored as FLOAT

`artists.hourly_rate` and `bookings.amount` are `FLOAT`. That type cannot store 19.99 exactly. Payment totals and refunds will be off by fractions of a cent, and it gets worse as rows are summed.

```sql
ALTER TABLE artists
  MODIFY hourly_rate DECIMAL(10, 2) NOT NULL;

ALTER TABLE bookings
  MODIFY amount DECIMAL(10, 2) NOT NULL;
```

`DECIMAL(10, 2)` covers amounts up to 99,999,999.99 and stores them exactly. I also made both columns `NOT NULL`. A booking with no amount, or an artist with no rate, should fail the insert. If 10 digits is not enough later, widen the decimal. Do not go back to `FLOAT`.

### 2. No foreign keys, and `client_id` points at nothing

`bookings.artist_id`, `bookings.client_id`, `reviews.booking_id`, and `reviews.artist_id` are plain ints. There is no clients table at all, so `client_id` cannot reference a real row. You can insert a booking for an artist who does not exist, and a review for a booking that does not exist. Deleting an artist leaves bookings and reviews behind, and those still show up in the leaderboard.

```sql
CREATE TABLE clients (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clients_email (email)
);

ALTER TABLE bookings
  MODIFY artist_id INT NOT NULL,
  MODIFY client_id INT NOT NULL,
  ADD CONSTRAINT fk_bookings_artist FOREIGN KEY (artist_id) REFERENCES artists (id),
  ADD CONSTRAINT fk_bookings_client FOREIGN KEY (client_id) REFERENCES clients (id);

ALTER TABLE reviews
  MODIFY booking_id INT NOT NULL,
  MODIFY artist_id INT NOT NULL,
  ADD CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id) REFERENCES bookings (id),
  ADD CONSTRAINT fk_reviews_artist FOREIGN KEY (artist_id) REFERENCES artists (id);
```

That is the smallest fix for the schema as it was given. In the app I put artists and clients in one `users` table with a `role` column, because they both log in and I did not want two account tables.

### 3. Status, score, and required columns are not constrained

`status` is `VARCHAR(50)`. A typo is a valid insert, and then the state machine never matches that row. `score` is an `INT` with no range, so 0 and 99 are allowed. `event_end` can be before `event_start`. `name`, `category`, and the timestamps can be null, and `created_at` has no default, so an insert can store a row with no time on it.

```sql
ALTER TABLE artists
  MODIFY name VARCHAR(255) NOT NULL,
  MODIFY category VARCHAR(255) NOT NULL,
  MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE bookings
  MODIFY status ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled') NOT NULL,
  MODIFY event_start DATETIME NOT NULL,
  MODIFY event_end DATETIME NOT NULL,
  MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD CONSTRAINT chk_bookings_window CHECK (event_end > event_start);

ALTER TABLE reviews
  MODIFY score TINYINT NOT NULL,
  MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD CONSTRAINT chk_reviews_score CHECK (score BETWEEN 1 AND 5);
```

`ENUM` rejects a status the app does not know. The checks reject a score outside 1–5 and an event that ends before it starts. I left the event columns as `DATETIME`. `TIMESTAMP` tops out in 2038, and a booking can be further out than that. The app writes those values in UTC.

If any existing row breaks these checks, the `ALTER` will fail until that data is fixed.

### 4. A review can disagree with its booking

`booking_id` is not unique, so the same booking can have two reviews. `reviews.artist_id` is also not tied to the booking, so the review can name a different artist than the one who did the job. The leaderboard then scores the wrong person.

I kept `artist_id` on `reviews`. The leaderboard groups by it, and dropping the column would force an extra join on every run. It does have to match the booking. MySQL will not create a foreign key on `(booking_id, artist_id)` unless `bookings` has a unique key on that same pair. `(id, artist_id)` is unique because `id` already is.

```sql
ALTER TABLE bookings
  ADD UNIQUE KEY uq_bookings_id_artist (id, artist_id);

ALTER TABLE reviews
  ADD UNIQUE KEY uq_reviews_booking (booking_id),
  ADD CONSTRAINT fk_reviews_booking_artist
    FOREIGN KEY (booking_id, artist_id) REFERENCES bookings (id, artist_id);
```

`UNIQUE (booking_id)` is one review per booking. The foreign key rejects a review whose artist is not the artist on that booking.

### 5. No indexes for the queries we actually run

As written, the overlap check and the leaderboard both scan. Creating a booking looks up confirmed rows for one artist inside a time window. The leaderboard filters reviews by `created_at`, groups by artist, and counts completed bookings by artist.

```sql
ALTER TABLE bookings
  ADD INDEX idx_bookings_artist_status_window (artist_id, status, event_start, event_end),
  ADD INDEX idx_bookings_status_artist (status, artist_id);

ALTER TABLE reviews
  ADD INDEX idx_reviews_created_artist_score (created_at, artist_id, score, booking_id);
```

`idx_bookings_artist_status_window` starts with `artist_id` because the request already has it, then `status`, then the two event times, so the overlap check can be answered from the index. `idx_bookings_status_artist` is the other direction, for the completed-count subquery that starts from `status`. The reviews index is the one from Task A. Joins on `artists.id` and `bookings.id` are already covered by the primary keys.
