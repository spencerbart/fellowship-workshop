import Link from "next/link";

export default function Home() {
  return (
    <main className="app-page">
      <div className="app-shell max-w-6xl">
        <header className="topbar">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Fellowship
          </Link>
        </header>

        <section className="grid flex-1 gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-center">
          <div>
            <p className="eyebrow">Live audience Q&A</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Join the Q&A room your host shared.
            </h1>
            <p className="muted mt-5 max-w-2xl text-lg leading-8">
              Enter the room slug from your event link to ask questions, vote,
              and follow what the presenter is answering.
            </p>
          </div>

          <div className="space-y-5">
            <form
              action={joinRoom}
              className="card p-5"
            >
              <h2 className="text-xl font-semibold">Join a room</h2>
              <p className="muted mt-1 text-sm leading-6">
                Enter the room slug from your event host.
              </p>
              <label className="mt-5 block text-sm font-medium" htmlFor="room">
                Room slug
              </label>
              <input
                id="room"
                name="room"
                placeholder="workshop-day-1"
                className="field mt-2 h-11 px-3 text-base"
                pattern="[A-Za-z0-9][A-Za-z0-9-]{0,62}"
                required
              />
              <button
                type="submit"
                className="btn-primary mt-4 w-full"
              >
                Go to room
              </button>
            </form>

            <section className="flex items-center justify-between gap-4 rounded-lg bg-[#102f2a] p-5 text-white shadow-sm">
              <div>
                <h2 className="text-lg font-semibold">Hosting an event?</h2>
                <p className="mt-1 text-sm leading-6 text-[#dce8e2]">
                  Create rooms and open presenter mode from the owner console.
                </p>
              </div>
              <Link
                href="/owner"
                className="inline-flex min-h-10 shrink-0 items-center rounded-md bg-white px-4 text-sm font-semibold text-[#102f2a] transition hover:bg-[#f7f4ec]"
              >
                Owner console
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
