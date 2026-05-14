"use client";

import type { User } from "@supabase/supabase-js";
import { FormEvent, useMemo, useState } from "react";
import { AuthMode, defaultAuthor, roomTitle } from "./qa-types";
import { useRoomQa } from "./use-room-qa";

type Filter = "top" | "highlighted" | "new" | "answered";

const filters: { label: string; value: Filter }[] = [
  { label: "Top", value: "top" },
  { label: "AI picks", value: "highlighted" },
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
        : questions.filter(
            (question) =>
              !question.answered &&
              (filter !== "highlighted" || question.highlighted),
          );

    return [...filtered].sort((a, b) => {
      if (filter === "new") {
        return b.id - a.id;
      }

      if (a.highlighted !== b.highlighted) {
        return Number(b.highlighted) - Number(a.highlighted);
      }

      return b.votes - a.votes;
    });
  }, [filter, questions]);

  const totalVotes = questions.reduce((sum, question) => sum + question.votes, 0);
  const openQuestions = questions.filter((question) => !question.answered).length;
  const highlightedQuestions = questions.filter(
    (question) => !question.answered && question.highlighted,
  ).length;
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

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setErrorMessage("Sign in before submitting a question.");
      setIsSubmitting(false);
      return;
    }

    const response = await fetch("/api/questions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        body: trimmedBody,
        author: trimmedAuthor || defaultAuthor(user),
        roomSlug,
      }),
    });

    const result = (await response.json().catch(() => null)) as
      | {
          question?: { id: number };
          moderation?: { action?: "allow" | "highlight" | "reject" };
          error?: string;
        }
      | null;

    if (!response.ok || !result?.question) {
      setErrorMessage(result?.error ?? "Could not submit that question.");
      setIsSubmitting(false);
      return;
    }

    const { error: voteError } = await supabase.from("votes").insert({
      question_id: result.question.id,
      client_id: user.id,
      user_id: user.id,
    });

    if (voteError) {
      setErrorMessage(voteError.message);
    }

    setBody("");
    setAuthor("");
    setFilter(result.moderation?.action === "highlight" ? "highlighted" : "new");
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
      setErrorMessage("Only paid organization owners can mark questions answered.");
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
    <main className="app-page">
      <div className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {displayRoomTitle}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Live Q&A Board
            </h1>
          </div>

          <div className="card grid grid-cols-4 overflow-hidden sm:w-[560px]">
            <Stat label="Open" value={openQuestions} />
            <Stat label="AI picks" value={highlightedQuestions} />
            <Stat label="Answered" value={answeredQuestions} />
            <Stat label="Votes" value={totalVotes} />
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
          <section className="min-w-0">
            <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Questions</h2>
                <p className="mt-1 text-sm muted">
                  Vote for what you want answered next.
                </p>
              </div>

              <div className="grid grid-cols-2 rounded-md border border-[#cbbfaf] bg-[#eee8dc] p-1 sm:grid-cols-4">
                {filters.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFilter(item.value)}
                    className={`h-9 px-4 text-sm font-semibold transition ${
                      filter === item.value
                        ? "rounded bg-white text-[#18211d] shadow-sm"
                        : "muted hover:text-[#18211d]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {errorMessage ? (
              <div className="mt-4 rounded-md border border-[#e0b1a9] bg-[#fff8f6] p-4 text-sm font-medium text-[#a43d34]">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {isLoading ? (
                <div className="card p-8 text-center text-sm font-medium muted shadow-sm">
                  Loading questions from Supabase...
                </div>
              ) : null}

              {!isLoading && visibleQuestions.length === 0 ? (
                <div className="card p-8 text-center text-sm font-medium muted shadow-sm">
                  No questions in this view yet.
                </div>
              ) : null}

              {visibleQuestions.map((question) => (
                <article
                  key={question.id}
                  className={`grid gap-4 rounded-lg border p-4 shadow-sm transition sm:grid-cols-[72px_minmax(0,1fr)_auto] ${
                    question.answered
                      ? "border-[#d8d0c2] bg-[#f8f5ee]"
                      : "border-[#d1ddd8] bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void toggleVote(question.id)}
                    disabled={!user}
                    className={`flex h-20 w-full flex-col items-center justify-center rounded-md border text-sm font-semibold transition disabled:cursor-not-allowed sm:w-[72px] ${
                      votedIds.includes(question.id)
                        ? "border-[#17483f] bg-[#eef8f1] text-[#17483f]"
                        : "border-[#d8d0c2] bg-[#fffefa] text-[#3c4942] hover:border-[#17483f] disabled:bg-[#eee8dc]"
                    }`}
                    aria-label={`Vote for question by ${question.author}`}
                  >
                    <span className="text-lg leading-none">↑</span>
                    <span className="mt-1 text-xl leading-none">{question.votes}</span>
                  </button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="pill pill-warn">
                        {question.topic}
                      </span>
                      {question.answered ? (
                        <span className="pill pill-info">
                          Answered
                        </span>
                      ) : null}
                      {question.highlighted ? (
                        <span className="pill pill-success">
                          AI pick
                        </span>
                      ) : null}
                      {question.mine ? (
                        <span className="pill">
                          Voted
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-3 text-lg font-medium leading-7">
                      {question.body}
                    </p>
                    <p className="mt-3 text-sm muted">
                      Asked by {question.author} · {question.createdAt}
                    </p>
                  </div>

                  {isModerator ? (
                    <button
                      type="button"
                      onClick={() => void toggleAnswered(question.id)}
                      className={`h-10 whitespace-nowrap border px-3 text-sm font-semibold transition ${
                        question.answered
                          ? "btn-secondary border-[#b9c9df] bg-[#f0f5fb] text-[#365783]"
                          : "btn-secondary"
                      }`}
                    >
                      {question.answered ? "Reopen" : "Mark answered"}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start">
            <form
              onSubmit={submitQuestion}
              className="card p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Ask a question</h2>
                  <p className="mt-1 text-sm leading-6 muted">
                    {user
                      ? "AI screens each submission before it enters the queue."
                      : "Sign in below to submit and vote."}
                  </p>
                </div>
                <span className="pill pill-success">
                  Realtime
                </span>
              </div>

              {submissionsClosed ? (
                <div className="mt-4 rounded-md border border-[#e0b1a9] bg-[#fff8f6] p-3 text-sm font-medium text-[#a43d34]">
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
                className="field mt-2 min-h-36 resize-none px-3 py-3 text-base leading-6"
                maxLength={220}
                disabled={!user || isAuthLoading || submissionsClosed}
              />
              <div className="muted mt-2 flex items-center justify-between text-xs">
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
                className="field mt-2 h-11 px-3 text-base"
                maxLength={28}
                disabled={!user || isAuthLoading || submissionsClosed}
              />

              <button
                type="submit"
                className="btn-primary mt-5 w-full"
                disabled={!user || !body.trim() || isSubmitting || submissionsClosed}
              >
                {isSubmitting ? "Submitting..." : "Submit question"}
              </button>
            </form>

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
          </aside>
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
    <section className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {user ? "Signed in" : "Sign in to participate"}
          </h2>
          <p className="mt-1 text-sm leading-6 muted">
            {user
              ? "Your votes and questions are tied to this account."
              : "Required for submitting questions and voting."}
          </p>
        </div>
        {isModerator ? (
          <span className="pill pill-info">
            Moderator
          </span>
        ) : null}
      </div>

      {user ? (
        <div className="mt-4">
          <p className="break-all text-sm font-semibold">
            {user.email}
          </p>
          <button
            type="button"
            onClick={onSignOut}
            className="btn-secondary mt-4 w-full"
          >
            Sign out
          </button>
        </div>
      ) : (
        <form onSubmit={onAuth} className="mt-4">
          <div className="grid grid-cols-2 rounded-md border border-[#cbbfaf] bg-[#eee8dc] p-1">
            {(["sign-in", "sign-up"] as AuthMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onAuthModeChange(mode)}
                className={`h-9 px-3 text-sm font-semibold transition ${
                  authMode === mode
                    ? "rounded bg-white text-[#18211d] shadow-sm"
                    : "muted hover:text-[#18211d]"
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
            className="field mt-2 h-11 px-3 text-base"
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
            className="field mt-2 h-11 px-3 text-base"
            minLength={6}
            required
          />

          {authMessage ? (
            <p className="mt-3 text-sm font-medium text-[#a43d34]">
              {authMessage}
            </p>
          ) : null}

          <button
            type="submit"
            className="btn-primary mt-5 w-full"
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
      <div className="muted mt-1 text-xs font-semibold uppercase tracking-[0.12em]">
        {label}
      </div>
    </div>
  );
}
