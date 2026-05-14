"use client";

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isActiveSubscriptionStatus } from "@/lib/billing";
import { AuthMode, roomTitle } from "./qa-types";

type Organization = {
  org_id: string;
  org_name: string;
  role: string;
  subscription_status: string | null;
};

type OwnedRoom = {
  slug: string;
  name: string;
  is_locked: boolean;
  archived_at: string | null;
};

type OrgMember = {
  user_id: string;
  email: string;
  role: "owner" | "admin";
  created_at: string;
};

export default function OwnerDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [roomSlug, setRoomSlug] = useState("");
  const [roomName, setRoomName] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [roomsByOrg, setRoomsByOrg] = useState<Record<string, OwnedRoom[]>>({});
  const [membersByOrg, setMembersByOrg] = useState<Record<string, OrgMember[]>>({});
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [deletingRoomSlug, setDeletingRoomSlug] = useState("");

  const selectedOrg = organizations.find((org) => org.org_id === selectedOrgId);
  const selectedOrgRooms = selectedOrg ? roomsByOrg[selectedOrg.org_id] ?? [] : [];
  const selectedOrgMembers = selectedOrg
    ? membersByOrg[selectedOrg.org_id] ?? []
    : [];
  const subscriptionActive = isActiveSubscriptionStatus(
    selectedOrg?.subscription_status,
  );
  const canManageAdmins = selectedOrg?.role === "owner";
  const canManageBilling = selectedOrg?.role === "owner";

  useEffect(() => {
    let active = true;

    queueMicrotask(async () => {
      const { data } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      setUser(data.user);
      setIsLoading(false);

      if (data.user) {
        await loadOwnerData();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          void loadOwnerData();
        } else {
          setOrganizations([]);
          setRoomsByOrg({});
          setMembersByOrg({});
          setSelectedOrgId("");
        }
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
    // loadOwnerData is intentionally called from auth events to avoid stale sessions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function loadOwnerData() {
    setMessage("");
    const { data, error } = await supabase.rpc("list_my_organizations");

    if (error) {
      setMessage(error.message);
      return;
    }

    const nextOrganizations = (data ?? []) as Organization[];
    setOrganizations(nextOrganizations);
    const nextSelectedOrgId =
      selectedOrgId && nextOrganizations.some((org) => org.org_id === selectedOrgId)
        ? selectedOrgId
        : nextOrganizations[0]?.org_id ?? "";
    setSelectedOrgId(nextSelectedOrgId);

    const [roomEntries, memberEntries] = await Promise.all([
      nextOrganizations.map(async (org) => {
        const { data: rooms, error: roomsError } = await supabase.rpc(
          "list_my_org_rooms",
          { requested_org_id: org.org_id },
        );

        return [org.org_id, roomsError ? [] : ((rooms ?? []) as OwnedRoom[])] as const;
      }),
      nextOrganizations.map(async (org) => {
        const { data: members, error: membersError } = await supabase.rpc(
          "list_my_org_members",
          { requested_org_id: org.org_id },
        );

        return [
          org.org_id,
          membersError ? [] : ((members ?? []) as OrgMember[]),
        ] as const;
      }),
    ]);

    setRoomsByOrg(Object.fromEntries(await Promise.all(roomEntries)));
    setMembersByOrg(Object.fromEntries(await Promise.all(memberEntries)));
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const credentials = { email: email.trim(), password };
    const { error } =
      authMode === "sign-in"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    if (error) {
      setMessage(error.message);
      return;
    }

    setPassword("");
    setMessage(
      authMode === "sign-up"
        ? "Account created. Check your email if confirmation is enabled."
        : "Signed in.",
    );
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextOrgName = orgName.trim();

    if (!nextOrgName) {
      return;
    }

    setIsWorking(true);
    setMessage("");
    const { error } = await supabase.rpc("create_organization", {
      org_name: nextOrgName,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setOrgName("");
      setMessage("Organization created. Add billing to create managed rooms.");
      await loadOwnerData();
    }

    setIsWorking(false);
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrg) {
      return;
    }

    const nextSlug = roomSlug.trim().toLowerCase();
    const nextName = roomName.trim() || roomTitle(nextSlug) || nextSlug;

    setIsWorking(true);
    setMessage("");
    const { error } = await supabase.rpc("create_owned_room", {
      requested_org_id: selectedOrg.org_id,
      room_slug: nextSlug,
      room_name: nextName,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setRoomSlug("");
      setRoomName("");
      setMessage("Room created.");
      await loadOwnerData();
    }

    setIsWorking(false);
  }

  async function deleteRoom(slug: string) {
    if (!selectedOrg) {
      return;
    }

    const confirmed = window.confirm(
      `Delete /rooms/${slug}? This also deletes its questions and votes.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingRoomSlug(slug);
    setMessage("");
    const { error } = await supabase.rpc("delete_owned_room", {
      requested_org_id: selectedOrg.org_id,
      room_slug: slug,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Room deleted.");
      await loadOwnerData();
    }

    setDeletingRoomSlug("");
  }

  async function addAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrg) {
      return;
    }

    const nextAdminEmail = adminEmail.trim();

    if (!nextAdminEmail) {
      return;
    }

    setIsWorking(true);
    setMessage("");
    const { error } = await supabase.rpc("add_org_admin", {
      requested_org_id: selectedOrg.org_id,
      admin_email: nextAdminEmail,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setAdminEmail("");
      setMessage("Admin added.");
      await loadOwnerData();
    }

    setIsWorking(false);
  }

  async function removeAdmin(member: OrgMember) {
    if (!selectedOrg || member.role !== "admin") {
      return;
    }

    setIsWorking(true);
    setMessage("");
    const { error } = await supabase.rpc("remove_org_admin", {
      requested_org_id: selectedOrg.org_id,
      admin_user_id: member.user_id,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Admin removed.");
      await loadOwnerData();
    }

    setIsWorking(false);
  }

  async function openStripe(path: "checkout" | "portal", orgId: string) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setMessage("Sign in before managing billing.");
      return;
    }

    setIsWorking(true);
    setMessage("");

    const response = await fetch(`/api/stripe/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orgId }),
    });
    const payload = (await response.json()) as { url?: string; error?: string };

    if (!response.ok || !payload.url) {
      setMessage(payload.error ?? "Could not open Stripe.");
      setIsWorking(false);
      return;
    }

    window.location.href = payload.url;
  }

  return (
    <main className="app-page">
      <div className="app-shell max-w-6xl">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              Owner Console
            </p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
              Organizations and billing
            </h1>
          </div>
          <Link
            href="/rooms/main"
            className="btn-secondary"
          >
            Audience room
          </Link>
        </header>

        {message ? (
          <div className="rounded-md border border-[#e0b1a9] bg-[#fff8f6] p-4 text-sm font-medium text-[#a43d34]">
            {message}
          </div>
        ) : null}

        {isLoading ? (
          <section className="card p-6">
            Loading account...
          </section>
        ) : user ? (
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="space-y-5">
              <section className="card p-5">
                <h2 className="text-lg font-semibold">Account</h2>
                <p className="mt-3 break-all text-sm font-semibold">
                  {user.email}
                </p>
                <button
                  type="button"
                  onClick={() => void supabase.auth.signOut()}
                  className="btn-secondary mt-4 w-full"
                >
                  Sign out
                </button>
              </section>

              <form
                onSubmit={createOrganization}
                className="card p-5"
              >
                <h2 className="text-lg font-semibold">New organization</h2>
                <label className="mt-4 block text-sm font-medium" htmlFor="org-name">
                  Name
                </label>
                <input
                  id="org-name"
                  value={orgName}
                  onChange={(event) => setOrgName(event.target.value)}
                  className="field mt-2 h-11 px-3 text-base"
                  maxLength={80}
                  required
                />
                <button
                  type="submit"
                  disabled={isWorking || !orgName.trim()}
                  className="btn-primary mt-4 w-full"
                >
                  Create organization
                </button>
              </form>
            </aside>

            <section className="min-w-0 space-y-5">
              <div className="card p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Organizations</h2>
                    <p className="mt-1 text-sm muted">
                      The $5/month subscription is per organization owner account.
                    </p>
                  </div>
                  {organizations.length > 0 ? (
                    <select
                      value={selectedOrgId}
                      onChange={(event) => setSelectedOrgId(event.target.value)}
                      className="field h-11 px-3 text-sm font-semibold"
                    >
                      {organizations.map((org) => (
                        <option key={org.org_id} value={org.org_id}>
                          {org.org_name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>

                {organizations.length === 0 ? (
                  <p className="mt-5 text-sm muted">
                    Create an organization to start billing and manage rooms.
                  </p>
                ) : null}

                {selectedOrg ? (
                  <div className="mt-5 card-muted p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold">
                          {selectedOrg.org_name}
                        </h3>
                        <p className="mt-1 text-sm font-medium muted">
                          Billing:{" "}
                          {selectedOrg.subscription_status ?? "not started"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => void openStripe("checkout", selectedOrg.org_id)}
                          disabled={!canManageBilling || isWorking}
                          className="btn-primary h-10"
                        >
                          {subscriptionActive ? "Update plan" : "Start $5/month"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void openStripe("portal", selectedOrg.org_id)}
                          disabled={!canManageBilling || isWorking}
                          className="btn-secondary h-10"
                        >
                          Billing portal
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {selectedOrg ? (
                <section className="card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">Admins</h2>
                      <p className="mt-1 text-sm muted">
                        Owners can add existing users as organization admins.
                      </p>
                    </div>
                    <span className="pill">
                      {selectedOrgMembers.length}
                    </span>
                  </div>

                  <form
                    onSubmit={addAdmin}
                    className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div>
                      <label
                        className="block text-sm font-medium"
                        htmlFor="admin-email"
                      >
                        Admin email
                      </label>
                      <input
                        id="admin-email"
                        type="email"
                        value={adminEmail}
                        onChange={(event) => setAdminEmail(event.target.value)}
                        placeholder="admin@example.com"
                        className="field mt-2 h-11 px-3 text-base"
                        disabled={!canManageAdmins}
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!canManageAdmins || isWorking || !adminEmail.trim()}
                      className="btn-primary h-11 self-end"
                    >
                      Add admin
                    </button>
                  </form>

                  {!canManageAdmins ? (
                    <p className="mt-3 text-sm muted">
                      Only organization owners can add or remove admins.
                    </p>
                  ) : null}

                  <div className="mt-5 space-y-3">
                    {selectedOrgMembers.map((member) => (
                      <div
                        key={member.user_id}
                        className="flex flex-col gap-3 card-muted p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <h3 className="break-all font-semibold">
                            {member.email}
                          </h3>
                          <p className="mt-1 text-sm muted">
                            {member.role === "owner" ? "Owner" : "Admin"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeAdmin(member)}
                          disabled={
                            !canManageAdmins || isWorking || member.role === "owner"
                          }
                          className="btn-secondary h-10"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {selectedOrg ? (
                <form
                  onSubmit={createRoom}
                  className="card p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">Rooms</h2>
                      <p className="mt-1 text-sm muted">
                        Paid owners can create and manage presenter rooms.
                      </p>
                    </div>
                    <span
                      className={`pill ${
                        subscriptionActive
                          ? "pill-success"
                          : "border-[#e0b1a9] bg-[#fff8f6] text-[#a43d34]"
                      }`}
                    >
                      {subscriptionActive ? "Active" : "Paywalled"}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium" htmlFor="room-slug">
                        Room slug
                      </label>
                      <input
                        id="room-slug"
                        value={roomSlug}
                        onChange={(event) => setRoomSlug(event.target.value)}
                        placeholder="workshop-day-1"
                        className="field mt-2 h-11 px-3 text-base"
                        pattern="[a-z0-9][a-z0-9-]{0,62}"
                        disabled={!subscriptionActive}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium" htmlFor="room-name">
                        Display name
                      </label>
                      <input
                        id="room-name"
                        value={roomName}
                        onChange={(event) => setRoomName(event.target.value)}
                        placeholder="Workshop Day 1"
                        className="field mt-2 h-11 px-3 text-base"
                        maxLength={48}
                        disabled={!subscriptionActive}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      !subscriptionActive ||
                      isWorking ||
                      !roomSlug.trim() ||
                      !selectedOrg
                    }
                    className="btn-primary mt-4 h-11"
                  >
                    Create room
                  </button>

                  <div className="mt-5 space-y-3">
                    {selectedOrgRooms.length === 0 ? (
                      <p className="text-sm muted">
                        No owned rooms yet.
                      </p>
                    ) : (
                      selectedOrgRooms.map((room) => (
                        <div
                          key={room.slug}
                          className="flex flex-col gap-3 card-muted p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <h3 className="font-semibold">{room.name}</h3>
                            <p className="mt-1 text-sm muted">
                              /rooms/{room.slug}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <Link
                              href={`/rooms/${room.slug}`}
                              className="btn-secondary h-10"
                            >
                              Audience
                            </Link>
                            <Link
                              href={`/rooms/${room.slug}/presenter`}
                              className="btn-primary h-10"
                            >
                              Presenter
                            </Link>
                            <button
                              type="button"
                              onClick={() => void deleteRoom(room.slug)}
                              disabled={
                                !subscriptionActive ||
                                Boolean(deletingRoomSlug) ||
                                isWorking
                              }
                              className="btn-danger h-10"
                            >
                              {deletingRoomSlug === room.slug
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </form>
              ) : null}
            </section>
          </div>
        ) : (
          <form
            onSubmit={handleAuth}
            className="max-w-md card p-5"
          >
            <h2 className="text-lg font-semibold">Owner account</h2>
            <div className="mt-4 grid grid-cols-2 rounded-md border border-[#cbbfaf] bg-[#eee8dc] p-1">
              {(["sign-in", "sign-up"] as AuthMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAuthMode(mode)}
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

            <label className="mt-4 block text-sm font-medium" htmlFor="owner-email">
              Email
            </label>
            <input
              id="owner-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field mt-2 h-11 px-3 text-base"
              required
            />

            <label className="mt-4 block text-sm font-medium" htmlFor="owner-password">
              Password
            </label>
            <input
              id="owner-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field mt-2 h-11 px-3 text-base"
              minLength={6}
              required
            />

            <button
              type="submit"
              className="btn-primary mt-5 w-full"
            >
              {authMode === "sign-in" ? "Sign in" : "Create account"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
