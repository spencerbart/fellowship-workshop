import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f6f3ee] text-[#17201b]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-[#ded7cb] pb-5">
          <Link href="/" className="text-lg font-semibold">
            Fellowship
          </Link>
          <Link
            href="/owner"
            className="inline-flex h-10 items-center border border-[#cfc6b7] bg-white px-4 text-sm font-semibold text-[#415049] transition hover:border-[#2f6f5e] hover:text-[#174f40]"
          >
            Owner dashboard
          </Link>
        </header>

        <section className="grid flex-1 gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a14d38]">
              Live audience Q&A
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight sm:text-6xl">
              Join a room or manage your event.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#617066]">
              Audience members can ask questions and vote for free. Event owners
              use the dashboard to manage rooms, admins, presenter mode, and
              billing.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/rooms/main"
                className="inline-flex h-12 items-center justify-center bg-[#17201b] px-5 text-sm font-semibold text-white transition hover:bg-[#2f6f5e]"
              >
                Join main room
              </Link>
              <Link
                href="/owner"
                className="inline-flex h-12 items-center justify-center border border-[#cfc6b7] bg-white px-5 text-sm font-semibold text-[#415049] transition hover:border-[#2f6f5e] hover:text-[#174f40]"
              >
                Open owner dashboard
              </Link>
            </div>
          </div>

          <div className="space-y-5">
            <form
              action={joinRoom}
              className="border border-[#d8d0c2] bg-white p-5 shadow-sm"
            >
              <h2 className="text-xl font-semibold">Join a room</h2>
              <p className="mt-1 text-sm leading-6 text-[#617066]">
                Enter the room slug from your event host.
              </p>
              <label className="mt-5 block text-sm font-medium" htmlFor="room">
                Room slug
              </label>
              <input
                id="room"
                name="room"
                placeholder="workshop-day-1"
                className="mt-2 h-11 w-full border border-[#cfc6b7] bg-[#fffdf8] px-3 text-base outline-none transition focus:border-[#2f6f5e] focus:ring-2 focus:ring-[#b8d8ce]"
                pattern="[A-Za-z0-9][A-Za-z0-9-]{0,62}"
                required
              />
              <button
                type="submit"
                className="mt-4 h-11 w-full bg-[#17201b] px-4 text-sm font-semibold text-white transition hover:bg-[#2f6f5e]"
              >
                Go to room
              </button>
            </form>

            <section className="border border-[#d8d0c2] bg-[#17201b] p-5 text-white shadow-sm">
              <h2 className="text-xl font-semibold">For owners</h2>
              <p className="mt-2 text-sm leading-6 text-[#dbe5de]">
                Create organizations, add admins, create rooms, and manage the
                $5/month Stripe subscription.
              </p>
              <Link
                href="/owner"
                className="mt-5 inline-flex h-10 items-center bg-white px-4 text-sm font-semibold text-[#17201b] transition hover:bg-[#f6f3ee]"
              >
                Manage events
              </Link>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

async function joinRoom(formData: FormData) {
  "use server";

  const rawRoom = String(formData.get("room") ?? "");
  const room = rawRoom.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(room)) {
    return;
  }

  const { redirect } = await import("next/navigation");
  redirect(`/rooms/${room}`);
}
