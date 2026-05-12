"use client";

import { FormEvent, useMemo, useState } from "react";

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

const initialQuestions: Question[] = [
  {
    id: 1,
    body: "What is the cleanest way to structure Supabase clients for server components, route handlers, and browser interactions?",
    author: "Mina",
    topic: "Architecture",
    votes: 28,
    createdAt: "2 min ago",
    answered: false,
  },
  {
    id: 2,
    body: "Can we use realtime subscriptions with row-level security without leaking events for rows a user cannot read?",
    author: "Drew",
    topic: "Realtime",
    votes: 21,
    createdAt: "6 min ago",
    answered: false,
  },
  {
    id: 3,
    body: "Where should form validation live when using server actions and Supabase inserts together?",
    author: "Priya",
    topic: "Forms",
    votes: 17,
    createdAt: "9 min ago",
    answered: true,
  },
  {
    id: 4,
    body: "How would you model one vote per person if we start anonymous and add auth later?",
    author: "Sam",
    topic: "Data model",
    votes: 15,
    createdAt: "14 min ago",
    answered: false,
  },
  {
    id: 5,
    body: "What should we cache in Next.js when the data is also updating live through Supabase realtime?",
    author: "Jules",
    topic: "Caching",
    votes: 11,
    createdAt: "18 min ago",
    answered: false,
  },
  {
    id: 6,
    body: "Can storage uploads be private while still showing thumbnails in a public project gallery?",
    author: "Noah",
    topic: "Storage",
    votes: 8,
    createdAt: "24 min ago",
    answered: true,
  },
];

const filters: { label: string; value: Filter }[] = [
  { label: "Top", value: "top" },
  { label: "New", value: "new" },
  { label: "Answered", value: "answered" },
];

export default function Home() {
  const [questions, setQuestions] = useState(initialQuestions);
  const [filter, setFilter] = useState<Filter>("top");
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [votedIds, setVotedIds] = useState<number[]>([2]);

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

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedBody = body.trim();
    const trimmedAuthor = author.trim();

    if (!trimmedBody) {
      return;
    }

    const nextQuestion: Question = {
      id: Date.now(),
      body: trimmedBody,
      author: trimmedAuthor || "Anonymous",
      topic: "Audience",
      votes: 1,
      createdAt: "just now",
      answered: false,
      mine: true,
    };

    setQuestions((currentQuestions) => [nextQuestion, ...currentQuestions]);
    setVotedIds((currentIds) => [...currentIds, nextQuestion.id]);
    setBody("");
    setAuthor("");
    setFilter("new");
  }

  function toggleVote(id: number) {
    const hasVoted = votedIds.includes(id);

    setQuestions((currentQuestions) =>
      currentQuestions.map((question) =>
        question.id === id
          ? {
              ...question,
              votes: question.votes + (hasVoted ? -1 : 1),
            }
          : question,
      ),
    );

    setVotedIds((currentIds) =>
      hasVoted
        ? currentIds.filter((currentId) => currentId !== id)
        : [...currentIds, id],
    );
  }

  function toggleAnswered(id: number) {
    setQuestions((currentQuestions) =>
      currentQuestions.map((question) =>
        question.id === id
          ? {
              ...question,
              answered: !question.answered,
            }
          : question,
      ),
    );
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
                    Dummy data today. Supabase inserts later.
                  </p>
                </div>
                <span className="border border-[#b7d9c1] bg-[#edf8f0] px-2 py-1 text-xs font-semibold text-[#27643a]">
                  Live-ready
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
                <span>Shows instantly in the board</span>
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
                disabled={!body.trim()}
              >
                Submit question
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
                  <strong className="text-white">Active</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Demo stage</span>
                  <strong className="text-white">UI prototype</strong>
                </div>
              </div>
            </section>
          </aside>

          <section className="min-w-0">
            <div className="flex flex-col gap-4 border border-[#d8d0c2] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Questions</h2>
                <p className="mt-1 text-sm text-[#617066]">
                  Vote, sort, and mark answered. State is local for this first pass.
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

            <div className="mt-4 space-y-3">
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
                    onClick={() => toggleVote(question.id)}
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
                          Yours
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
                    onClick={() => toggleAnswered(question.id)}
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
