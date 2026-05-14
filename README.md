# Live Q&A Board

A Next.js and Supabase workshop app for collecting audience questions, voting,
running room-specific Q&A boards, and presenting the top question live.

## Local Setup

Install dependencies:

```bash
npm install
```

Copy the environment template:

```bash
cp .env.example .env.local
```

Fill in the Supabase values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
SUPABASE_SECRET_KEY=sb_secret_your_server_only_key_here
```

Fill in the Stripe values:

```bash
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
# Optional. If omitted, Checkout creates a $5/month recurring price inline.
STRIPE_PRICE_ID=price_your_monthly_owner_plan_here
# Optional. Used to hash IPs for submission rate limits.
RATE_LIMIT_SALT=replace_with_a_random_secret
```

Create or update the Supabase tables and policies by running
[`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor.

The app uses Supabase Auth. In the Supabase dashboard, make sure email/password
auth is enabled under Authentication settings.

After a presenter signs up, promote that user to moderator from the SQL Editor:

```sql
insert into public.moderators (user_id)
select id from auth.users where email = 'presenter@example.com';
```

Only moderators can mark questions answered or reopen them. Row-level security
enforces this in the database.

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The home page redirects to the default room:

```txt
/rooms/main
```

Owner billing and room management is available at:

```txt
/owner
```

Owners create organizations, start the $5/month Stripe subscription, add admins,
and create or delete managed rooms from the owner console. Audience participants
do not need a paid account to ask questions or vote.
The owner console also shows per-room recap metrics for participants, questions,
votes, answer rate, and last activity.

Legacy room URLs still work when the room exists:

```txt
/rooms/frontend
/rooms/database
/rooms/workshop-day-1
```

Presenter mode is available per room:

```txt
/rooms/main/presenter
```

Presenter mode shows the top unanswered question, moderator controls, queue
stats, and a QR code for the audience room link.

Moderators can also manage the room from presenter mode:

- Rename the room
- Lock or unlock new submissions
- Archive or restore the room
- Clear answered questions

## Vercel

Add these environment variables in Vercel before deploying:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Set them for Production, Preview, and Development if you want every deployment
type to connect to Supabase.
