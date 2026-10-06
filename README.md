# Book an Artist API

Local booking API for the senior backend assignment. Clients request artists, artists move a booking through a fixed status machine, and completed work produces reviews.

Users, bookings, and payments live in MySQL. Artist profiles and reviews live in MongoDB.

## Run locally

You need Node.js 18 or newer, MySQL, and MongoDB running on the machine.

```bash
cp .env.example .env
npm install
npm run setup
npm start
```

The API listens on `http://localhost:3000`.

`npm test` runs the booking status integration test. Run it after `npm run setup` so the database exists. The test creates its own users and deletes them afterwards.

```bash
npm test
```

Leave `MYSQL_PASSWORD` empty when the local `root` account has no password. If you would rather use Docker, start the compose file below and set `MYSQL_PASSWORD=root` in `.env` before setup. Stop any local MySQL or MongoDB already bound to those ports first.

```bash
docker compose up -d
```

`npm run setup` is safe to run again. It recreates the four demo accounts and their bookings and reviews.

## Demo accounts

Password for every account: `Password123!`

| Email | Role |
| --- | --- |
| client@bookanartist.test | client |
| ava@bookanartist.test | artist, Murals |
| noah@bookanartist.test | artist, Portrait |
| leo@bookanartist.test | artist, Illustration |

Setup prints Ava's pending booking id and her confirmed event window.

## Response shape

Every endpoint returns:

```json
{ "success": true, "data": {}, "error": null }
```

Failures use the same keys, with `success: false`, `data: null`, and a string `error`.

## Auth

`POST /auth/login`

Body: `{ "email": "client@bookanartist.test", "password": "Password123!" }`

The JWT payload is `{ id, role, iat, exp }`. `role` is `artist` or `client`. `iat` is the issued-at time added by the signer. Send the token as `Authorization: Bearer <token>`.

Wrong email and wrong password both return HTTP 401 and `Invalid email or password`. Passwords are checked with bcrypt. A missing account still runs a compare, so the timing does not reveal which field was wrong.

## Bookings

`POST /bookings` — client only.

```json
{
  "artist_id": 2,
  "event_start": "2026-11-01T10:00:00.000Z",
  "event_end": "2026-11-01T12:00:00.000Z",
  "notes": "Storefront mural"
}
```

`artist_id` is the id printed for that artist by `npm run setup`.

The row is stored as `pending`. Event times are stored in UTC with millisecond precision. `event_start` in the past returns HTTP 422. A window that overlaps one of that artist's `confirmed` bookings returns HTTP 409. Back-to-back events are allowed: a new booking may start at the exact moment a confirmed one ends. Pending bookings do not block the calendar. The artist row is locked for the check and the insert so two overlapping requests cannot both succeed.

`PATCH /bookings/:id/status`

Body: `{ "status": "confirmed" }`

| From | To | Who |
| --- | --- | --- |
| pending | confirmed | assigned artist |
| pending | cancelled | assigned artist or owning client |
| confirmed | in_progress | assigned artist |
| confirmed | cancelled | assigned artist or owning client |
| in_progress | completed | assigned artist |

Any other transition returns HTTP 422 and `Invalid status transition from '<current>' to '<requested>'`.

An artist can update only bookings assigned to them. A client can only cancel, and only a booking they own. Authorization is checked before the state machine, so a client who tries to confirm gets HTTP 403 rather than 422.

`confirmed -> in_progress` and `in_progress -> completed` are not gated on the clock. The brief defines those steps by the transition table. A later version would reject `in_progress` before `event_start` and `completed` before `event_end`.

## Reviews

`GET /artists/:id/reviews?page=1&limit=10`

Public. Returns reviews whose booking is `completed`, newest first. The summary covers the full set, and `page` and `limit` slice only the list. `limit` defaults to 10 and cannot exceed 50.

```json
{
  "summary": {
    "average_score": 4.14,
    "total_count": 7,
    "distribution": { "1": 1, "2": 0, "3": 0, "4": 2, "5": 4 }
  },
  "reviews": [],
  "pagination": { "page": 1, "limit": 10, "total_count": 7, "total_pages": 1 }
}
```

`average_score` is a number rounded half up to 2 decimal places. It is `null` when the artist has no qualifying reviews. Distribution always includes scores 1 through 5.

After setup, Ava's review list matches the summary above. The newest comment is `Ava review 1 newest`. A 2-star review on her pending booking is stored and must not appear. Her 1-star review from 120 days ago does appear here, because this endpoint is not limited to 90 days.

## Leaderboard

`GET /artists/leaderboard`

Public. Top 10 artists by average review score over the last 90 days. An artist needs at least 5 reviews in that window. Average score is rounded to 2 decimal places. Ties break on all-time completed booking count, descending.

Only reviews on `completed` bookings count. That is the same product rule as the reviews endpoint, and it is called out as an assumption in `TASK3.md`. The SQL for the relational version of this query, the indexes, and the large-scale approach are in that file. This route runs the same rules with reviews in MongoDB and completed bookings in MySQL.

After setup the order is:

| Artist | Average | Reviews in 90 days | Completed bookings |
| --- | --- | --- | --- |
| Ava Lane | 4.67 | 6 | 7 |
| Noah Patel | 4.4 | 5 | 5 |

Leo Kim has four reviews, all scored 5, and is left off because of the minimum of 5. Ava's 120-day-old review is outside the window, which is why her leaderboard average is 4.67 while her review-list average is 4.14.

## Decisions and trade-offs

- MySQL owns users, bookings, and payments. MongoDB owns artist profiles and reviews. That split follows the brief. The leaderboard therefore cannot be one SQL statement at runtime. `TASK3.md` still answers the relational question that was asked.
- Payments have a table and one seeded paid row. There is no payment endpoint because the brief does not define one.
- Overlap protection locks the artist row inside a transaction. Creates for that artist are serialized. That is cheaper to reason about than a range lock, and it is the right scope for this traffic.
- Review reads do not pull every completed booking into the Node process. Each review stores `bookingStatus`, updated when a booking changes status. The reviews list and the leaderboard filter on that field through a compound index. MySQL is asked only for the completed-booking counts of the artists who already qualified. `TASK3.md` describes the further step at tens of millions of rows: a precomputed leaderboard table.
- HTTP routes stay thin. Services own the rules. Repositories own SQL and MongoDB queries. Pool size is `MYSQL_POOL_SIZE` so the process does not open unbounded database connections.
- Page size is capped at 50 and page number at 1000, so a client cannot request a skip deep enough to scan the whole collection.
- Read endpoints for reviews and the leaderboard are public. The brief does not require a token for them.
- Login tokens expire after 8 hours and there is no refresh token.
- Review creation is not an endpoint. The seed script writes reviews. The next endpoint I would add is `POST /reviews`, allowed only to the client on a `completed` booking, one review per booking.

## Submission map

| Brief item | Where it lives |
| --- | --- |
| `POST /auth/login` | `src/services/authService.js` |
| `POST /bookings` | `src/services/bookingService.js`, `src/repositories/bookingRepository.js` |
| `PATCH /bookings/:id/status` | `src/domain/bookingState.js`, `src/services/bookingService.js` |
| `GET /artists/:id/reviews` | `src/services/reviewService.js`, `src/repositories/reviewRepository.js` |
| Status transition integration test | `tests/bookingStatus.test.js` |
| Leaderboard SQL, indexes, scale, schema audit | `TASK3.md` |
| Search outage write-up | `TASK4.md` |
