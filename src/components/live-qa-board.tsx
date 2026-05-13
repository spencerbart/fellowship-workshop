"use client";

import type { User } from "@supabase/supabase-js";
import { FormEvent, useMemo, useState } from "react";
import { AuthMode, defaultAuthor, roomTitle } from "./qa-types";
import { useRoomQa } from "./use-room-qa";

type Filter = "top" | "new" | "answered";

const filters: { label: string; value: Filter }[] = [
  { label: "Top", value: "top" },
  { label: "New", value: "new" },
  { label: "Answered", value: "answered" },
];

export default function LiveQaBoard({ roomSlug }: { roomSlug: string }) {
  const {
    supabase,
    room,
    user,
    isModerator,
    questions,
    votedIds,
    isLoading,
    isAuthLoading,
    errorMessage,
    setErrorMessage,
    loadQuestions,
  } = useRoomQa(roomSlug);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [filter, setFilter] = useState<Filter>("top");
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  const visibleQuestions = useMemo(() => {
    const filtered =
      filter === "answered"
        ? questions.filter((question) => question.answered)
        : questions.filter((question) => !question.answered);

    return [...filtered].sort((a, b) => {
      if (filter === "new") {
        return b.id - a.id;
      }

      return b.votes - a.votes;
    });
  }, [filter, questions]);

  const totalVotes = questions.reduce((sum, question) => sum + question.votes, 0);
  const openQuestions = questions.filter((question) => !question.answered).length;
  const answeredQuestions = questions.length - openQuestions;
  const displayRoomTitle = room.name || roomTitle(roomSlug) || roomSlug;
  const submissionsClosed = room.isLocked || Boolean(room.archivedAt);

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

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedBody = body.trim();
    const trimmedAuthor = author.trim();

    if (!trimmedBody || !user) {
      setErrorMessage("Sign in before submitting a question.");
      return;
    }

    if (submissionsClosed) {
      setErrorMessage("This room is not accepting new questions.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    const { data: insertedQuestion, error: insertError } = await supabase
      .from("questions")
      .insert({
        body: trimmedBody,
        author: trimmedAuthor || defaultAuthor(user),
        topic: "Audience",
        room_slug: roomSlug,
        user_id: user.id,
      })
      .select("id")
      .single();

    if (insertError) {
      setErrorMessage(insertError.message);
      setIsSubmitting(false);
      return;
    }

    await supabase.from("votes").insert({
      question_id: insertedQuestion.id,
      client_id: user.id,
      user_id: user.id,
    });

    setBody("");
    setAuthor("");
    setFilter("new");
    setIsSubmitting(false);
    await loadQuestions(user);
  }

  async function toggleVote(id: number) {
    if (!user) {
      setErrorMessage("Sign in before voting.");
      return;
    }

    const hasVoted = votedIds.includes(id);
    setErrorMessage("");

    const { error } = hasVoted
      ? await supabase
          .from("votes")
          .delete()
          .eq("question_id", id)
          .eq("user_id", user.id)
      : await supabase.from("votes").insert({
          question_id: id,
          client_id: user.id,
          user_id: user.id,
        });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadQuestions(user);
  }

  async function toggleAnswered(id: number) {
    const question = questions.find((currentQuestion) => currentQuestion.id === id);

    if (!question || !isModerator) {
      setErrorMessage("Only moderators can mark questions answered.");
      return;
    }

    setErrorMessage("");

    const { error } = await supabase
      .from("questions")
      .update({
        answered_at: question.answered ? null : new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadQuestions(user);
  }

  return (
    <main className="min-h-screen bg-[#f6f3ee] text-[#17201b]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-[#ded7cb] pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a14d38]">
              {displayRoomTitle}
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[#111814] sm:text-4xl">
              Live Q&A Board
            </h1>
          </div>

          <div className="grid grid-cols-3 overflow-hidden border border-[#d8d0c2] bg-white shadow-sm sm:w-[460px]">
            <Stat label="Open" value={openQuestions} />
            <Stat label="Answered" value={answeredQuestions} />
            <Stat label="Votes" value={totalVotes} />
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start">
            <AccountPanel
              authMode={authMode}
              email={email}
              password={password}
              authMessage={authMessage}
              isModerator={isModerator}
              user={user}
              onAuth={handleAuth}
              onAuthModeChange={setAuthMode}
              onEmailChange={setEmail}
              onPasswordChange={setPassword}
              onSignOut={() => void signOut()}
            />

            <form
              onSubmit={submitQuestion}
              className="border border-[#d8d0c2] bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Ask a question</h2>
                  <p className="mt-1 text-sm leading-6 text-[#617066]">
                    Authenticated submissions sync live.
                  </p>
                </div>
                <span className="border border-[#b7d9c1] bg-[#edf8f0] px-2 py-1 text-xs font-semibold text-[#27643a]">
                  Realtime
                </span>
              </div>

              {submissionsClosed ? (
                <div className="mt-4 border border-[#e4b5aa] bg-[#fff4f1] p-3 text-sm font-medium text-[#9b3c33]">
                  {room.archivedAt
                    ? "This room is archived. New questions are closed."
                    : "This room is locked. New questions are paused."}
                </div>
              ) : null}

              <label className="mt-5 block text-sm font-medium" htmlFor="question">
                Question
              </label>
              <textarea
                id="question"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={
                  user
                    ? "What do you want the presenter to explain?"
                    : "Sign in to submit a question."
                }
                className="mt-2 min-h-36 w-full resize-none border border-[#cfc6b7] bg-[#fffdf8] px-3 py-3 text-base leading-6 outline-none transition focus:border-[#2f6f5e] focus:ring-2 focus:ring-[#b8d8ce] disabled:bg-[#f3f0ea]"
                maxLength={220}
                disabled={!user || isAuthLoading || submissionsClosed}
              />
              <div className="mt-2 flex items-center justify-between text-xs text-[#6b766e]">
                <span>{body.length}/220</span>
                <span>Room: {roomSlug}</span>
              </div>

              <label className="mt-4 block text-sm font-medium" htmlFor="author">
                Display name
              </label>
              <input
                id="author"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder={defaultAuthor(user)}
                className="mt-2 h-11 w-full border border-[#cfc6b7] bg-[#fffdf8] px-3 text-base outline-none transition focus:border-[#2f6f5e] focus:ring-2 focus:ring-[#b8d8ce] disabled:bg-[#f3f0ea]"
                maxLength={28}
                disabled={!user || isAuthLoading || submissionsClosed}
              />

              <button
                type="submit"
                className="mt-5 flex h-11 w-full items-center justify-center bg-[#17201b] px-4 text-sm font-semibold text-white transition hover:bg-[#2f6f5e] disabled:cursor-not-allowed disabled:bg-[#9aa49d]"
                disabled={!user || !body.trim() || isSubmitting || submissionsClosed}
              >
                {isSubmitting ? "Submitting..." : "Submit question"}
              </button>
            </form>

            <section className="border border-[#d8d0c2] bg-[#17201b] p-5 text-white shadow-sm">
              <h2 className="text-lg font-semibold">Moderator queue</h2>
              <div className="mt-4 space-y-3 text-sm text-[#dbe5de]">
                <div className="flex items-center justify-between border-b border-white/15 pb-3">
                  <span>Next up</span>
                  <strong className="text-white">
                    {questions
                      .filter((question) => !question.answered)
                      .sort((a, b) => b.votes - a.votes)[0]?.topic ?? "Clear"}
                  </strong>
                </div>
                <div className="flex items-center justify-between border-b border-white/15 pb-3">
                  <span>Presenter mode</span>
                  <a
                    className="font-semibold text-white underline underline-offset-4"
                    href={`/rooms/${roomSlug}/presenter`}
                  >
                    Open
                  </a>
                </div>
                <div className="flex items-center justify-between">
                  <span>Answer controls</span>
                  <strong className="text-white">
                    {isModerator ? "Unlocked" : "Moderator only"}
                  </strong>
                </div>
              </div>
            </section>
          </aside>

          <section className="min-w-0">
            <div className="flex flex-col gap-4 border border-[#d8d0c2] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Questions</h2>
                <p className="mt-1 text-sm text-[#617066]">
                  Signed-in users can vote. Moderators can mark answers.
                </p>
              </div>

              <div className="grid grid-cols-3 border border-[#cfc6b7] bg-[#f6f3ee] p-1">
                {filters.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFilter(item.value)}
                    className={`h-9 px-4 text-sm font-semibold transition ${
                      filter === item.value
                        ? "bg-white text-[#17201b] shadow-sm"
                        : "text-[#617066] hover:text-[#17201b]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {errorMessage ? (
              <div className="mt-4 border border-[#e4b5aa] bg-[#fff4f1] p-4 text-sm font-medium text-[#9b3c33]">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {isLoading ? (
                <div className="border border-[#d8d0c2] bg-white p-8 text-center text-sm font-medium text-[#617066] shadow-sm">
                  Loading questions from Supabase...
                </div>
              ) : null}

              {!isLoading && visibleQuestions.length === 0 ? (
                <div className="border border-[#d8d0c2] bg-white p-8 text-center text-sm font-medium text-[#617066] shadow-sm">
                  No questions in this view yet.
                </div>
              ) : null}

              {visibleQuestions.map((question) => (
                <article
                  key={question.id}
                  className={`grid gap-4 border p-4 shadow-sm transition sm:grid-cols-[72px_minmax(0,1fr)_auto] ${
                    question.answered
                      ? "border-[#d8d0c2] bg-[#fbfaf6]"
                      : "border-[#cfd9d4] bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void toggleVote(question.id)}
                    disabled={!user}
                    className={`flex h-20 w-full flex-col items-center justify-center border text-sm font-semibold transition disabled:cursor-not-allowed sm:w-[72px] ${
                      votedIds.includes(question.id)
                        ? "border-[#2f6f5e] bg-[#e4f4ed] text-[#174f40]"
                        : "border-[#d8d0c2] bg-[#fffdf8] text-[#415049] hover:border-[#2f6f5e] disabled:bg-[#f3f0ea]"
                    }`}
                    aria-label={`Vote for question by ${question.author}`}
                  >
                    <span className="text-lg leading-none">↑</span>
                    <span className="mt-1 text-xl leading-none">{question.votes}</span>
                  </button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bg-[#f0e5d5] px-2 py-1 text-xs font-semibold text-[#724626]">
                        {question.topic}
                      </span>
                      {question.answered ? (
                        <span className="bg-[#e7ecf7] px-2 py-1 text-xs font-semibold text-[#344f85]">
                          Answered
                        </span>
                      ) : null}
                      {question.mine ? (
                        <span className="bg-[#f8e2df] px-2 py-1 text-xs font-semibold text-[#9b3c33]">
                          Voted
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-3 text-lg font-medium leading-7 text-[#17201b]">
                      {question.body}
                    </p>
                    <p className="mt-3 text-sm text-[#617066]">
                      Asked by {question.author} · {question.createdAt}
                    </p>
                  </div>

                  {isModerator ? (
                    <button
                      type="button"
                      onClick={() => void toggleAnswered(question.id)}
                      className={`h-10 whitespace-nowrap border px-3 text-sm font-semibold transition ${
                        question.answered
                          ? "border-[#b8c3d8] bg-[#f3f6fb] text-[#344f85] hover:bg-white"
                          : "border-[#cfc6b7] bg-[#fffdf8] text-[#415049] hover:border-[#2f6f5e] hover:text-[#174f40]"
                      }`}
                    >
                      {question.answered ? "Reopen" : "Mark answered"}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function AccountPanel({
  authMode,
  email,
  password,
  authMessage,
  isModerator,
  user,
  onAuth,
  onAuthModeChange,
  onEmailChange,
  onPasswordChange,
  onSignOut,
}: {
  authMode: AuthMode;
  email: string;
  password: string;
  authMessage: string;
  isModerator: boolean;
  user: User | null;
  onAuth: (event: FormEvent<HTMLFormElement>) => void;
  onAuthModeChange: (mode: AuthMode) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSignOut: () => void;
}) {
  return (
    <section className="border border-[#d8d0c2] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Account</h2>
          <p className="mt-1 text-sm leading-6 text-[#617066]">
            Sign in to submit questions and vote.
          </p>
        </div>
        {isModerator ? (
          <span className="border border-[#b8c3d8] bg-[#f3f6fb] px-2 py-1 text-xs font-semibold text-[#344f85]">
            Moderator
          </span>
        ) : null}
      </div>

      {user ? (
        <div className="mt-4">
          <p className="break-all text-sm font-semibold text-[#17201b]">
            {user.email}
          </p>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-4 h-10 w-full border border-[#cfc6b7] bg-[#fffdf8] px-3 text-sm font-semibold text-[#415049] transition hover:border-[#2f6f5e] hover:text-[#174f40]"
          >
            Sign out
          </button>
        </div>
      ) : (
        <form onSubmit={onAuth} className="mt-4">
          <div className="grid grid-cols-2 border border-[#cfc6b7] bg-[#f6f3ee] p-1">
            {(["sign-in", "sign-up"] as AuthMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onAuthModeChange(mode)}
                className={`h-9 px-3 text-sm font-semibold transition ${
                  authMode === mode
                    ? "bg-white text-[#17201b] shadow-sm"
                    : "text-[#617066] hover:text-[#17201b]"
                }`}
              >
                {mode === "sign-in" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <label className="mt-4 block text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            className="mt-2 h-11 w-full border border-[#cfc6b7] bg-[#fffdf8] px-3 text-base outline-none transition focus:border-[#2f6f5e] focus:ring-2 focus:ring-[#b8d8ce]"
            required
          />

          <label className="mt-4 block text-sm font-medium" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            className="mt-2 h-11 w-full border border-[#cfc6b7] bg-[#fffdf8] px-3 text-base outline-none transition focus:border-[#2f6f5e] focus:ring-2 focus:ring-[#b8d8ce]"
            minLength={6}
            required
          />

          {authMessage ? (
            <p className="mt-3 text-sm font-medium text-[#9b3c33]">
              {authMessage}
            </p>
          ) : null}

          <button
            type="submit"
            className="mt-5 flex h-11 w-full items-center justify-center bg-[#17201b] px-4 text-sm font-semibold text-white transition hover:bg-[#2f6f5e]"
          >
            {authMode === "sign-in" ? "Sign in" : "Create account"}
          </button>
        </form>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-[#d8d0c2] px-4 py-3 last:border-r-0">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#617066]">
        {label}
      </div>
    </div>
  );
}
