"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  formatTimeAgo,
  Question,
  QuestionRow,
  Room,
  roomTitle,
  VoteRow,
} from "./qa-types";

export function useRoomQa(roomSlug: string) {
  const supabase = useMemo(() => createClient(), []);
  const [room, setRoom] = useState<Room>({
    slug: roomSlug,
    name: roomTitle(roomSlug) || roomSlug,
    isLocked: false,
    archivedAt: null,
  });
  const [user, setUser] = useState<User | null>(null);
  const [isModerator, setIsModerator] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [votedIds, setVotedIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const ensureRoom = useCallback(async () => {
    if (roomSlug !== "main") {
      return;
    }

    await supabase.from("rooms").upsert(
      {
        slug: roomSlug,
        name: roomTitle(roomSlug) || roomSlug,
      },
      { ignoreDuplicates: true, onConflict: "slug" },
    );
  }, [roomSlug, supabase]);

  const loadRoom = useCallback(async () => {
    const { data, error } = await supabase
      .from("rooms")
      .select("slug, name, is_locked, archived_at")
      .eq("slug", roomSlug)
      .maybeSingle();

    if (error || !data) {
      return;
    }

    setRoom({
      slug: data.slug,
      name: data.name,
      isLocked: Boolean(data.is_locked),
      archivedAt: data.archived_at,
    });
  }, [roomSlug, supabase]);

  const loadModeratorStatus = useCallback(
    async (currentUser: User | null) => {
      if (!currentUser) {
        setIsModerator(false);
        return;
      }

      const { data, error } = await supabase.rpc("can_manage_room", {
        requested_room_slug: roomSlug,
      });

      if (!error) {
        setIsModerator(Boolean(data));
        return;
      }

      const { data: legacyData, error: legacyError } = await supabase
        .from("moderators")
        .select("user_id")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      setIsModerator(!legacyError && Boolean(legacyData));
    },
    [roomSlug, supabase],
  );

  const loadQuestions = useCallback(
    async (currentUser: User | null) => {
      setErrorMessage("");

      const [
        { data: questionRows, error: questionsError },
        { data: voteRows, error: votesError },
      ] = await Promise.all([
        supabase
          .from("questions")
          .select(
            "id, body, author, topic, room_slug, created_at, answered_at, moderation_status, moderation_score, moderation_reason",
          )
          .eq("room_slug", roomSlug)
          .order("created_at", { ascending: false }),
        supabase.from("votes").select("question_id, user_id"),
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

      const questionIds = new Set(
        ((questionRows ?? []) as QuestionRow[]).map((question) => question.id),
      );
      const votesByQuestion = new Map<number, number>();
      const myVotes = new Set<number>();

      for (const vote of (voteRows ?? []) as VoteRow[]) {
        if (!questionIds.has(vote.question_id)) {
          continue;
        }

        votesByQuestion.set(
          vote.question_id,
          (votesByQuestion.get(vote.question_id) ?? 0) + 1,
        );

        if (currentUser && vote.user_id === currentUser.id) {
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
          highlighted: question.moderation_status === "highlighted",
          moderationScore: question.moderation_score,
          moderationReason: question.moderation_reason,
          mine: myVotes.has(question.id),
        })),
      );
      setVotedIds([...myVotes]);
      setIsLoading(false);
    },
    [roomSlug, supabase],
  );

  useEffect(() => {
    let activeUser: User | null = null;

    queueMicrotask(async () => {
      await ensureRoom();
      await loadRoom();
      const { data } = await supabase.auth.getUser();
      activeUser = data.user;
      setUser(data.user);
      setIsAuthLoading(false);
      if (data.user) {
        await supabase.rpc("track_room_presence", {
          requested_room_slug: roomSlug,
        });
      }
      await Promise.all([
        loadQuestions(data.user),
        loadModeratorStatus(data.user),
      ]);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        activeUser = session?.user ?? null;
        setUser(activeUser);
        queueMicrotask(() => {
          if (activeUser) {
            void supabase.rpc("track_room_presence", {
              requested_room_slug: roomSlug,
            });
          }
          void loadQuestions(activeUser);
          void loadModeratorStatus(activeUser);
        });
      },
    );

    const channel = supabase
      .channel(`qa-board-${roomSlug}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms",
          filter: `slug=eq.${roomSlug}`,
        },
        () => void loadRoom(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "questions",
          filter: `room_slug=eq.${roomSlug}`,
        },
        () => void loadQuestions(activeUser),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes" },
        () => void loadQuestions(activeUser),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "moderators" },
        () => void loadModeratorStatus(activeUser),
      )
      .subscribe();

    return () => {
      listener.subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [
    ensureRoom,
    loadRoom,
    loadModeratorStatus,
    loadQuestions,
    roomSlug,
    supabase,
  ]);

  return {
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
    loadRoom,
    loadQuestions,
  };
}
