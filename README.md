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

Create additional rooms by changing the slug:

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

## Vercel

Add these environment variables in Vercel before deploying:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Set them for Production, Preview, and Development if you want every deployment
type to connect to Supabase.
