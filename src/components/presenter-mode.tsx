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
    <main className="min-h-screen bg-[#111814] text-[#f6f3ee]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-5 py-5 sm:px-8">
        <header className="flex flex-col gap-4 border-b border-white/15 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#e6a08d]">
              Presenter Mode · {displayRoomTitle}
            </p>
            <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">
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
          <div className="border border-[#e6a08d] bg-[#3b211d] p-4 text-sm font-medium text-[#ffd9d1]">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-[560px] flex-col justify-between border border-white/15 bg-[#f6f3ee] p-6 text-[#17201b] shadow-sm sm:p-8">
            {isLoading ? (
              <div className="flex flex-1 items-center justify-center text-xl font-semibold text-[#617066]">
                Loading queue...
              </div>
            ) : currentQuestion ? (
              <>
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="bg-[#f0e5d5] px-3 py-2 text-sm font-semibold text-[#724626]">
                      {currentQuestion.topic}
                    </span>
                    <span className="bg-[#e4f4ed] px-3 py-2 text-sm font-semibold text-[#174f40]">
                      {currentQuestion.votes} votes
                    </span>
                  </div>

                  <p className="mt-10 max-w-5xl text-4xl font-semibold leading-tight sm:text-6xl">
                    {currentQuestion.body}
                  </p>
                </div>

                <div className="mt-10 flex flex-col gap-4 border-t border-[#d8d0c2] pt-6 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#617066]">
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
                      className="h-12 border border-[#cfc6b7] bg-[#fffdf8] px-5 text-sm font-semibold text-[#415049] transition hover:border-[#2f6f5e] hover:text-[#174f40]"
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      onClick={() => void markAnswered()}
                      disabled={!isModerator}
                      className="h-12 bg-[#17201b] px-5 text-sm font-semibold text-white transition hover:bg-[#2f6f5e] disabled:cursor-not-allowed disabled:bg-[#9aa49d]"
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
                  <p className="mt-4 text-lg text-[#617066]">
                    New audience questions will appear here live.
                  </p>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <section className="border border-white/15 bg-white p-5 text-[#17201b] shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Join this room</h2>
                  <p className="mt-1 text-sm text-[#617066]">Scan or share link</p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyAudienceLink()}
                  className="h-10 border border-[#cfc6b7] bg-[#fffdf8] px-3 text-sm font-semibold text-[#415049] transition hover:border-[#2f6f5e] hover:text-[#174f40]"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <div className="mt-5 bg-white p-3">
                <QRCode value={audienceUrl} className="h-auto w-full" />
              </div>
              <p className="mt-3 break-all text-sm font-medium text-[#617066]">
                {audienceUrl}
              </p>
            </section>

            <section className="border border-white/15 bg-[#17201b] p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Room controls
                  </h2>
                  <p className="mt-1 text-sm text-[#dbe5de]">
                    Paid owner settings
                  </p>
                </div>
                <span className="border border-white/20 px-2 py-1 text-xs font-semibold text-[#dbe5de]">
                  {room.archivedAt
                    ? "Archived"
                    : room.isLocked
                      ? "Locked"
                      : "Open"}
                </span>
              </div>

              <form onSubmit={renameRoom} className="mt-4">
                <label className="block text-sm font-medium text-[#f6f3ee]">
                  Room name
                </label>
                <input
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  placeholder={displayRoomTitle}
                  className="mt-2 h-10 w-full border border-white/20 bg-[#111814] px-3 text-sm text-white outline-none transition placeholder:text-[#aeb8b1] focus:border-[#e6a08d] disabled:bg-white/5"
                  maxLength={48}
                  disabled={!isModerator}
                />
                <button
                  type="submit"
                  disabled={!isModerator || !roomName.trim()}
                  className="mt-3 h-10 w-full bg-white px-3 text-sm font-semibold text-[#17201b] transition hover:bg-[#f6f3ee] disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/60"
                >
                  Rename room
                </button>
              </form>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => void toggleRoomLock()}
                  disabled={!isModerator || Boolean(room.archivedAt)}
                  className="h-10 border border-white/20 px-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/40"
                >
                  {room.isLocked ? "Unlock" : "Lock"}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleRoomArchive()}
                  disabled={!isModerator}
                  className="h-10 border border-white/20 px-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/40"
                >
                  {room.archivedAt ? "Restore" : "Archive"}
                </button>
              </div>

              <button
                type="button"
                onClick={() => void clearAnsweredQuestions()}
                disabled={!isModerator || answeredQuestions === 0}
                className="mt-3 h-10 w-full border border-[#e6a08d] px-3 text-sm font-semibold text-[#ffd9d1] transition hover:bg-[#3b211d] disabled:cursor-not-allowed disabled:border-white/15 disabled:text-white/40"
              >
                Clear answered questions
              </button>

              {controlMessage ? (
                <p className="mt-3 text-sm font-medium text-[#ffd9d1]">
                  {controlMessage}
                </p>
              ) : null}
            </section>

            <section className="border border-white/15 bg-[#17201b] p-5 shadow-sm">
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
                    className="mt-4 h-10 w-full border border-white/20 px-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAuth} className="mt-4">
                  <div className="grid grid-cols-2 border border-white/20 p-1">
                    {(["sign-in", "sign-up"] as AuthMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setAuthMode(mode)}
                        className={`h-9 px-2 text-sm font-semibold transition ${
                          authMode === mode
                            ? "bg-white text-[#17201b]"
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
                    className="mt-4 h-11 w-full border border-white/20 bg-[#111814] px-3 text-base text-white outline-none transition placeholder:text-[#aeb8b1] focus:border-[#e6a08d]"
                    required
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    className="mt-3 h-11 w-full border border-white/20 bg-[#111814] px-3 text-base text-white outline-none transition placeholder:text-[#aeb8b1] focus:border-[#e6a08d]"
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
                    className="mt-4 h-11 w-full bg-white px-3 text-sm font-semibold text-[#17201b] transition hover:bg-[#f6f3ee]"
                  >
                    {authMode === "sign-in" ? "Sign in" : "Create account"}
                  </button>
                </form>
              )}
            </section>

            <section className="border border-white/15 bg-[#17201b] p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-white">Up next</h2>
              <div className="mt-4 space-y-3">
                {upcomingQuestions.length > 0 ? (
                  upcomingQuestions.map((question) => (
                    <div
                      key={question.id}
                      className="border border-white/15 bg-white/5 p-3"
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
    <div className="min-w-28 border border-white/15 bg-white/5 px-4 py-3">
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#dbe5de]">
        {label}
      </div>
    </div>
  );
}
