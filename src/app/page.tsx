"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";

type QuestionRow = {
  id: number;
  body: string;
  author: string;
  topic: string;
  created_at: string;
  answered_at: string | null;
};

type VoteRow = {
  question_id: number;
  client_id: string;
};

type Question = {
  id: number;
  body: string;
  author: string;
  topic: string;
  votes: number;
  createdAt: string;
  answered: boolean;
  mine?: boolean;
};

type Filter = "top" | "new" | "answered";

const filters: { label: string; value: Filter }[] = [
  { label: "Top", value: "top" },
  { label: "New", value: "new" },
  { label: "Answered", value: "answered" },
];

const clientIdKey = "workshop-qa-client-id";

function getClientId() {
  const existingId = window.localStorage.getItem(clientIdKey);

  if (existingId) {
    return existingId;
  }

  const nextId = crypto.randomUUID();
  window.localStorage.setItem(clientIdKey, nextId);
  return nextId;
}

function formatTimeAgo(value: string) {
  const created = new Date(value).getTime();
  const seconds = Math.max(1, Math.floor((Date.now() - created) / 1000));

  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function Home() {
  const supabase = useMemo(() => createClient(), []);
  const clientIdRef = useRef("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filter, setFilter] = useState<Filter>("top");
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [votedIds, setVotedIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadQuestions = useCallback(
    async (currentClientId: string) => {
      setErrorMessage("");

      const [
        { data: questionRows, error: questionsError },
        { data: voteRows, error: votesError },
      ] = await Promise.all([
        supabase
          .from("questions")
          .select("id, body, author, topic, created_at, answered_at")
          .order("created_at", { ascending: false }),
        supabase.from("votes").select("question_id, client_id"),
      ]);

      if (questionsError || votesError) {
        setErrorMessage(
          questionsError?.message ??
            votesError?.message ??
            "Could not load questions.",
        );
        setQuestions([]);
        setVotedIds([]);
        setIsLoading(false);
        return;
      }

      const votesByQuestion = new Map<number, number>();
      const myVotes = new Set<number>();

      for (const vote of (voteRows ?? []) as VoteRow[]) {
        votesByQuestion.set(
          vote.question_id,
          (votesByQuestion.get(vote.question_id) ?? 0) + 1,
        );

        if (vote.client_id === currentClientId) {
          myVotes.add(vote.question_id);
        }
      }

      setQuestions(
        ((questionRows ?? []) as QuestionRow[]).map((question) => ({
          id: question.id,
          body: question.body,
          author: question.author,
          topic: question.topic,
          votes: votesByQuestion.get(question.id) ?? 0,
          createdAt: formatTimeAgo(question.created_at),
          answered: Boolean(question.answered_at),
          mine: myVotes.has(question.id),
        })),
      );
      setVotedIds([...myVotes]);
      setIsLoading(false);
    },
    [supabase],
  );

  useEffect(() => {
    const currentClientId = getClientId();
    clientIdRef.current = currentClientId;
    queueMicrotask(() => void loadQuestions(currentClientId));

    const channel = supabase
      .channel("qa-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "questions" },
        () => void loadQuestions(currentClientId),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes" },
        () => void loadQuestions(currentClientId),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadQuestions, supabase]);

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

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedBody = body.trim();
    const trimmedAuthor = author.trim();

    const currentClientId = clientIdRef.current;

    if (!trimmedBody || !currentClientId) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    const { data: insertedQuestion, error: insertError } = await supabase
      .from("questions")
      .insert({
        body: trimmedBody,
        author: trimmedAuthor || "Anonymous",
        topic: "Audience",
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
      client_id: currentClientId,
    });

    setBody("");
    setAuthor("");
    setFilter("new");
    setIsSubmitting(false);
    await loadQuestions(currentClientId);
  }

  async function toggleVote(id: number) {
    const currentClientId = clientIdRef.current;

    if (!currentClientId) {
      return;
    }

    const hasVoted = votedIds.includes(id);
    setErrorMessage("");

    const { error } = hasVoted
      ? await supabase
          .from("votes")
          .delete()
          .eq("question_id", id)
          .eq("client_id", currentClientId)
      : await supabase.from("votes").insert({
          question_id: id,
          client_id: currentClientId,
        });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadQuestions(currentClientId);
  }

  async function toggleAnswered(id: number) {
    const question = questions.find((currentQuestion) => currentQuestion.id === id);
    const currentClientId = clientIdRef.current;

    if (!question || !currentClientId) {
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

    await loadQuestions(currentClientId);
  }

  return (
    <main className="min-h-screen bg-[#f6f3ee] text-[#17201b]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-[#ded7cb] pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a14d38]">
              Next.js / Supabase Workshop
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
            <form
              onSubmit={submitQuestion}
              className="border border-[#d8d0c2] bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Ask a question</h2>
                  <p className="mt-1 text-sm leading-6 text-[#617066]">
                    Connected to Supabase. New questions sync live.
                  </p>
                </div>
                <span className="border border-[#b7d9c1] bg-[#edf8f0] px-2 py-1 text-xs font-semibold text-[#27643a]">
                  Realtime
                </span>
              </div>

              <label className="mt-5 block text-sm font-medium" htmlFor="question">
                Question
              </label>
              <textarea
                id="question"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="What do you want the presenter to explain?"
                className="mt-2 min-h-36 w-full resize-none border border-[#cfc6b7] bg-[#fffdf8] px-3 py-3 text-base leading-6 outline-none transition focus:border-[#2f6f5e] focus:ring-2 focus:ring-[#b8d8ce]"
                maxLength={220}
              />
              <div className="mt-2 flex items-center justify-between text-xs text-[#6b766e]">
                <span>{body.length}/220</span>
                <span>Stored in Supabase</span>
              </div>

              <label className="mt-4 block text-sm font-medium" htmlFor="author">
                Name
              </label>
              <input
                id="author"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="Anonymous"
                className="mt-2 h-11 w-full border border-[#cfc6b7] bg-[#fffdf8] px-3 text-base outline-none transition focus:border-[#2f6f5e] focus:ring-2 focus:ring-[#b8d8ce]"
                maxLength={28}
              />

              <button
                type="submit"
                className="mt-5 flex h-11 w-full items-center justify-center bg-[#17201b] px-4 text-sm font-semibold text-white transition hover:bg-[#2f6f5e] disabled:cursor-not-allowed disabled:bg-[#9aa49d]"
                disabled={!body.trim() || isSubmitting}
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
                  <span>Audience pace</span>
                  <strong className="text-white">
                    {openQuestions > 0 ? "Active" : "Quiet"}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Data source</span>
                  <strong className="text-white">Supabase</strong>
                </div>
              </div>
            </section>
          </aside>

          <section className="min-w-0">
            <div className="flex flex-col gap-4 border border-[#d8d0c2] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Questions</h2>
                <p className="mt-1 text-sm text-[#617066]">
                  Vote, sort, and mark answered. Changes sync through realtime.
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
                    className={`flex h-20 w-full flex-col items-center justify-center border text-sm font-semibold transition sm:w-[72px] ${
                      votedIds.includes(question.id)
                        ? "border-[#2f6f5e] bg-[#e4f4ed] text-[#174f40]"
                        : "border-[#d8d0c2] bg-[#fffdf8] text-[#415049] hover:border-[#2f6f5e]"
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
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
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
