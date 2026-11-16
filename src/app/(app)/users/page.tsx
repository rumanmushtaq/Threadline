import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requirePageUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { listUsers, MAX_ACCOUNTS } from "@/server/users";
import { UsersBoard } from "./users-board";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requirePageUser("user.manage");
  const users = await listUsers(db);
  const slots = Array.from({ length: MAX_ACCOUNTS }, (_, i) => {
    const u = users.find((x) => x.slot === i + 1);
    return { slot: i + 1, user: u ? { ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString() } : null };
  });
  return (
    <>
      <PageHeader
        title="Users"
        description={`${users.length} of ${MAX_ACCOUNTS} accounts in use. The workspace allows exactly one admin and three users.`}
      />
      <UsersBoard slots={slots} meId={me.id} />
    </>
  );
}
