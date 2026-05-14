"use client";

import { FormEvent, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { AuthMode, roomTitle } from "./qa-types";
import { useRoomQa } from "./use-room-qa";

export default function PresenterMode({ roomSlug }: { roomSlug: string }) {
  const {
    supabase,
    room,
    user,
    isModerator,
    questions,
    isLoading,
    errorMessage,
    setErrorMessage,
    loadRoom,
    loadQuestions,
  } = useRoomQa(roomSlug);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [skippedIds, setSkippedIds] = useState<number[]>([]);
  const [roomName, setRoomName] = useState("");
  const [controlMessage, setControlMessage] = useState("");

  const audiencePath = `/rooms/${roomSlug}`;
  const audienceUrl =
    typeof window === "undefined"
      ? audiencePath
      : `${window.location.origin}${audiencePath}`;
  const displayRoomTitle = room.name || roomTitle(roomSlug) || roomSlug;
  const openQuestions = questions
    .filter((question) => !question.answered)
    .sort((a, b) => b.votes - a.votes);
  const visibleQueue = openQuestions.filter(
    (question) => !skippedIds.includes(question.id),
  );
  const currentQuestion = visibleQueue[0] ?? openQuestions[0];
  const totalVotes = questions.reduce((sum, question) => sum + question.votes, 0);
  const answeredQuestions = questions.length - openQuestions.length;

  const upcomingQuestions = useMemo(
    () =>
      openQuestions
        .filter((question) => question.id !== currentQuestion?.id)
        .slice(0, 4),
    [currentQuestion?.id, openQuestions],
  );

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage("");
    setErrorMessage("");

    const credentials = {
      email: email.trim(),
      password,
    };

    const { error } =
      authMode === "sign-in"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setPassword("");
    setAuthMessage(
      authMode === "sign-up"
        ? "Check your email if confirmation is enabled, then sign in."
        : "Signed in.",
    );
  }

  async function copyAudienceLink() {
    await navigator.clipboard.writeText(audienceUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function skipQuestion() {
    if (!currentQuestion) {
      return;
    }

    const nextSkippedIds = [...skippedIds, currentQuestion.id];

    if (nextSkippedIds.length >= openQuestions.length) {
      setSkippedIds([]);
      return;
    }

    setSkippedIds(nextSkippedIds);
  }

  async function markAnswered() {
    if (!currentQuestion || !isModerator) {
      setErrorMessage("Only paid organization owners can mark questions answered.");
      return;
    }

    const { error } = await supabase
      .from("questions")
      .update({ answered_at: new Date().toISOString() })
      .eq("id", currentQuestion.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSkippedIds((currentIds) =>
      currentIds.filter((id) => id !== currentQuestion.id),
    );
    await loadQuestions(user);
  }

  async function renameRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextName = roomName.trim();

    if (!isModerator) {
      setControlMessage("Only paid organization owners can rename rooms.");
      return;
    }

    if (!nextName) {
      setControlMessage("Enter a room name first.");
      return;
    }

    const { error } = await supabase
      .from("rooms")
      .update({ name: nextName })
      .eq("slug", roomSlug);

    if (error) {
      setControlMessage(error.message);
      return;
    }

    setRoomName("");
    setControlMessage("Room renamed.");
    await loadRoom();
  }

  async function toggleRoomLock() {
    if (!isModerator) {
      setControlMessage("Only paid organization owners can lock rooms.");
      return;
    }

    const { error } = await supabase
      .from("rooms")
      .update({ is_locked: !room.isLocked })
      .eq("slug", roomSlug);

    if (error) {
      setControlMessage(error.message);
      return;
    }

    setControlMessage(room.isLocked ? "Submissions unlocked." : "Submissions locked.");
    await loadRoom();
  }

  async function toggleRoomArchive() {
    if (!isModerator) {
      setControlMessage("Only paid organization owners can archive rooms.");
      return;
    }

    const { error } = await supabase
      .from("rooms")
      .update({
        archived_at: room.archivedAt ? null : new Date().toISOString(),
        is_locked: room.archivedAt ? room.isLocked : true,
      })
      .eq("slug", roomSlug);

    if (error) {
      setControlMessage(error.message);
      return;
    }

    setControlMessage(room.archivedAt ? "Room restored." : "Room archived.");
    await loadRoom();
  }

  async function clearAnsweredQuestions() {
    if (!isModerator) {
      setControlMessage("Only paid organization owners can clear answered questions.");
      return;
    }

    const { error } = await supabase
      .from("questions")
      .delete()
      .eq("room_slug", roomSlug)
      .not("answered_at", "is", null);

    if (error) {
      setControlMessage(error.message);
      return;
    }

    setSkippedIds([]);
    setControlMessage("Answered questions cleared.");
    await loadQuestions(user);
  }

  return (
    <main className="app-page-dark h-screen overflow-hidden">
      <div className="mx-auto flex h-screen w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6">
        <header className="flex shrink-0 flex-col gap-3 border-b border-white/15 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="eyebrow text-[#f1a27f]">
              Presenter Mode · {displayRoomTitle}
            </p>
            <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">
              Live Q&A
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <PresenterStat label="Open" value={openQuestions.length} />
            <PresenterStat label="Answered" value={answeredQuestions} />
            <PresenterStat label="Votes" value={totalVotes} />
          </div>
        </header>

        {errorMessage ? (
          <div className="rounded-md border border-[#e6a08d] bg-[#3b211d] p-4 text-sm font-medium text-[#ffd9d1]">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="flex min-h-0 flex-col justify-between rounded-lg border border-white/15 bg-[#f7f4ec] p-5 text-[#18211d] shadow-sm sm:p-6">
            {isLoading ? (
              <div className="muted flex flex-1 items-center justify-center text-xl font-semibold">
                Loading queue...
              </div>
            ) : currentQuestion ? (
              <>
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="pill pill-warn px-3 py-2 text-sm">
                      {currentQuestion.topic}
                    </span>
                    <span className="pill pill-success px-3 py-2 text-sm">
                      {currentQuestion.votes} votes
                    </span>
                  </div>

                  <p className="mt-6 max-w-5xl text-3xl font-semibold leading-tight sm:text-5xl lg:text-[3.35rem]">
                    {currentQuestion.body}
                  </p>
                </div>

                <div className="mt-6 flex shrink-0 flex-col gap-4 border-t border-[#d8d0c2] pt-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="muted text-sm font-semibold uppercase tracking-[0.12em]">
                      Asked by
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {currentQuestion.author}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={skipQuestion}
                      className="btn-secondary h-12"
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      onClick={() => void markAnswered()}
                      disabled={!isModerator}
                      className="btn-primary h-12"
                    >
                      Mark answered
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-center">
                <div>
                  <p className="text-4xl font-semibold">No open questions</p>
                  <p className="muted mt-4 text-lg">
                    New audience questions will appear here live.
                  </p>
                </div>
              </div>
            )}
          </section>

          <aside className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <section className="card p-4 text-[#18211d]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Join this room</h2>
                  <p className="muted mt-1 text-sm">Scan or share link</p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyAudienceLink()}
                  className="btn-secondary h-10"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <div className="mt-4 rounded-md bg-white p-3">
                <QRCode value={audienceUrl} className="h-auto w-full" />
              </div>
              <p className="muted mt-3 break-all text-sm font-medium">
                {audienceUrl}
              </p>
            </section>

            <section className="rounded-lg border border-white/15 bg-white/5 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Room controls
                  </h2>
                  <p className="mt-1 text-sm text-[#dbe5de]">
                    Paid owner settings
                  </p>
                </div>
                <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-[#dbe5de]">
                  {room.archivedAt
                    ? "Archived"
                    : room.isLocked
                      ? "Locked"
                      : "Open"}
                </span>
              </div>

              <form onSubmit={renameRoom} className="mt-3">
                <label className="block text-sm font-medium text-[#f6f3ee]">
                  Room name
                </label>
                <input
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  placeholder={displayRoomTitle}
                  className="mt-2 h-10 w-full rounded-md border border-white/20 bg-[#0f1918] px-3 text-sm text-white outline-none transition placeholder:text-[#aeb8b1] focus:border-[#e6a08d] focus:ring-2 focus:ring-[#e6a08d]/20 disabled:bg-white/5"
                  maxLength={48}
                  disabled={!isModerator}
                />
                <button
                  type="submit"
                  disabled={!isModerator || !roomName.trim()}
                  className="btn-secondary mt-3 w-full"
                >
                  Rename room
                </button>
              </form>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => void toggleRoomLock()}
                  disabled={!isModerator || Boolean(room.archivedAt)}
                  className="btn-ghost h-10"
                >
                  {room.isLocked ? "Unlock" : "Lock"}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleRoomArchive()}
                  disabled={!isModerator}
                  className="btn-ghost h-10"
                >
                  {room.archivedAt ? "Restore" : "Archive"}
                </button>
              </div>

              <button
                type="button"
                onClick={() => void clearAnsweredQuestions()}
                disabled={!isModerator || answeredQuestions === 0}
                className="mt-3 h-10 w-full rounded-md border border-[#e6a08d] px-3 text-sm font-semibold text-[#ffd9d1] transition hover:bg-[#3b211d] disabled:cursor-not-allowed disabled:border-white/15 disabled:text-white/40"
              >
                Clear answered questions
              </button>

              {controlMessage ? (
                <p className="mt-3 text-sm font-medium text-[#ffd9d1]">
                  {controlMessage}
                </p>
              ) : null}
            </section>

            <section className="rounded-lg border border-white/15 bg-white/5 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-white">Owner access</h2>
              {user ? (
                <div className="mt-4">
                  <p className="break-all text-sm font-semibold text-[#dbe5de]">
                    {user.email}
                  </p>
                  <p className="mt-3 text-sm font-medium text-[#dbe5de]">
                    {isModerator
                      ? "Owner controls are unlocked."
                      : "Signed in, but not a paid owner for this room."}
                  </p>
                  <button
                    type="button"
                    onClick={() => void supabase.auth.signOut()}
                    className="btn-ghost mt-4 w-full"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAuth} className="mt-4">
                  <div className="grid grid-cols-2 rounded-md border border-white/20 p-1">
                    {(["sign-in", "sign-up"] as AuthMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setAuthMode(mode)}
                        className={`h-9 px-2 text-sm font-semibold transition ${
                          authMode === mode
                            ? "rounded bg-white text-[#18211d]"
                            : "text-[#dbe5de] hover:text-white"
                        }`}
                      >
                        {mode === "sign-in" ? "Sign in" : "Create"}
                      </button>
                    ))}
                  </div>

                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Email"
                    className="mt-4 h-11 w-full rounded-md border border-white/20 bg-[#0f1918] px-3 text-base text-white outline-none transition placeholder:text-[#aeb8b1] focus:border-[#e6a08d] focus:ring-2 focus:ring-[#e6a08d]/20"
                    required
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    className="mt-3 h-11 w-full rounded-md border border-white/20 bg-[#0f1918] px-3 text-base text-white outline-none transition placeholder:text-[#aeb8b1] focus:border-[#e6a08d] focus:ring-2 focus:ring-[#e6a08d]/20"
                    minLength={6}
                    required
                  />

                  {authMessage ? (
                    <p className="mt-3 text-sm font-medium text-[#ffd9d1]">
                      {authMessage}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    className="btn-secondary mt-4 w-full"
                  >
                    {authMode === "sign-in" ? "Sign in" : "Create account"}
                  </button>
                </form>
              )}
            </section>

            <section className="rounded-lg border border-white/15 bg-white/5 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-white">Up next</h2>
              <div className="mt-4 space-y-3">
                {upcomingQuestions.length > 0 ? (
                  upcomingQuestions.map((question) => (
                    <div
                      key={question.id}
                      className="rounded-md border border-white/15 bg-white/5 p-3"
                    >
                      <div className="text-sm font-semibold text-[#f6f3ee]">
                        {question.votes} votes
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#dbe5de]">
                        {question.body}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#dbe5de]">No queued questions.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function PresenterStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-28 rounded-lg border border-white/15 bg-white/5 px-4 py-3">
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#dbe5de]">
        {label}
      </div>
    </div>
  );
}
