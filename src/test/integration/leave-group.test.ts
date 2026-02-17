/**
 * leave_group & transfer_group_ownership RPC — 統合テスト
 *
 * UUID 範囲: 99990400-04xx
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createAdminClient, createAnonClient, checkDbAvailable } from "./helpers";

// テスト用 UUID
const OWNER_USER = "99990400-0400-0400-0400-000000000001";
const MEMBER_USER = "99990400-0400-0400-0400-000000000002";
const OUTSIDER_USER = "99990400-0400-0400-0400-000000000003";
const SOLO_OWNER = "99990400-0400-0400-0400-000000000004";
const TRANSFER_OWNER = "99990400-0400-0400-0400-000000000005";
const TRANSFER_MEMBER = "99990400-0400-0400-0400-000000000006";

const GROUP_MULTI = "99990400-0400-0400-0400-000000000010";
const GROUP_SOLO = "99990400-0400-0400-0400-000000000011";
const GROUP_TRANSFER = "99990400-0400-0400-0400-000000000012";

const PASSWORD = "password123";

const USERS = [
  { id: OWNER_USER, name: "Owner", email: "test-leave-owner@example.com" },
  { id: MEMBER_USER, name: "Member", email: "test-leave-member@example.com" },
  { id: OUTSIDER_USER, name: "Outsider", email: "test-leave-outsider@example.com" },
  { id: SOLO_OWNER, name: "Solo", email: "test-leave-solo@example.com" },
  { id: TRANSFER_OWNER, name: "TransOwner", email: "test-transfer-owner@example.com" },
  { id: TRANSFER_MEMBER, name: "TransMember", email: "test-transfer-member@example.com" },
] as const;

/** Create a fresh anon client, sign in, and return it */
async function signedInClient(email: string) {
  const client = createAnonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

describe("leave_group & transfer_group_ownership RPC — 統合テスト", () => {
  let admin: SupabaseClient<Database>;
  let dbAvailable = false;

  beforeAll(async () => {
    admin = createAdminClient();
    dbAvailable = await checkDbAvailable(admin);
    if (!dbAvailable) return;

    // Clean up any previous test data (including orphaned profiles from failed runs)
    await admin.from("group_members").delete().in("group_id", [GROUP_MULTI, GROUP_SOLO, GROUP_TRANSFER]);
    await admin.from("groups").delete().in("id", [GROUP_MULTI, GROUP_SOLO, GROUP_TRANSFER]);
    const userIds = USERS.map((u) => u.id);
    for (const u of USERS) {
      await admin.auth.admin.deleteUser(u.id).catch(() => {});
    }
    await admin.from("profiles").delete().in("id", userIds);

    // Create test users
    for (const u of USERS) {
      const { error: createErr } = await admin.auth.admin.createUser({
        user_metadata: { display_name: u.name },
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
        id: u.id,
      });
      if (createErr) console.error(`createUser ${u.email}:`, createErr.message);
    }

    // GROUP_MULTI: owner + member
    await admin.from("groups").insert({
      id: GROUP_MULTI,
      name: "Multi Group",
      owner_id: OWNER_USER,
    });
    await admin.from("group_members").insert([
      { group_id: GROUP_MULTI, user_id: OWNER_USER, role: "owner" },
      { group_id: GROUP_MULTI, user_id: MEMBER_USER, role: "member" },
    ]);

    // GROUP_SOLO: solo owner
    await admin.from("groups").insert({
      id: GROUP_SOLO,
      name: "Solo Group",
      owner_id: SOLO_OWNER,
    });
    await admin.from("group_members").insert({
      group_id: GROUP_SOLO,
      user_id: SOLO_OWNER,
      role: "owner",
    });

    // GROUP_TRANSFER: owner + member for transfer tests
    await admin.from("groups").insert({
      id: GROUP_TRANSFER,
      name: "Transfer Group",
      owner_id: TRANSFER_OWNER,
    });
    await admin.from("group_members").insert([
      { group_id: GROUP_TRANSFER, user_id: TRANSFER_OWNER, role: "owner" },
      { group_id: GROUP_TRANSFER, user_id: TRANSFER_MEMBER, role: "member" },
    ]);
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await admin.from("group_members").delete().in("group_id", [GROUP_MULTI, GROUP_SOLO, GROUP_TRANSFER]);
    await admin.from("groups").delete().in("id", [GROUP_MULTI, GROUP_SOLO, GROUP_TRANSFER]);
    const userIds = USERS.map((u) => u.id);
    for (const u of USERS) {
      await admin.auth.admin.deleteUser(u.id).catch(() => {});
    }
    await admin.from("profiles").delete().in("id", userIds);
  });

  // ============================================================
  // leave_group テスト
  // ============================================================

  it("一般メンバーが退出できる", async () => {
    if (!dbAvailable) return;
    const client = await signedInClient("test-leave-member@example.com");
    const { error } = await client.rpc("leave_group", { p_group_id: GROUP_MULTI });
    expect(error).toBeNull();

    const { data } = await admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", GROUP_MULTI)
      .eq("user_id", MEMBER_USER);
    expect(data).toHaveLength(0);
  });

  it("唯一のオーナー + 他メンバーあり → エラー", async () => {
    if (!dbAvailable) return;
    // member を再追加
    await admin.from("group_members").insert({
      group_id: GROUP_MULTI,
      user_id: MEMBER_USER,
      role: "member",
    });

    const client = await signedInClient("test-leave-owner@example.com");
    const { error } = await client.rpc("leave_group", { p_group_id: GROUP_MULTI });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("Must transfer ownership");
  });

  it("非メンバーが退出 → エラー", async () => {
    if (!dbAvailable) return;
    const client = await signedInClient("test-leave-outsider@example.com");
    const { error } = await client.rpc("leave_group", { p_group_id: GROUP_MULTI });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("Not a member");
  });

  it("ソロオーナーが退出 → グループ削除（CASCADE）", async () => {
    if (!dbAvailable) return;
    const client = await signedInClient("test-leave-solo@example.com");
    const { error } = await client.rpc("leave_group", { p_group_id: GROUP_SOLO });
    expect(error).toBeNull();

    const { data } = await admin
      .from("groups")
      .select("id")
      .eq("id", GROUP_SOLO);
    expect(data).toHaveLength(0);
  });

  // ============================================================
  // transfer_group_ownership テスト
  // ============================================================

  it("オーナーが権限を譲渡できる", async () => {
    if (!dbAvailable) return;
    const client = await signedInClient("test-transfer-owner@example.com");
    const { error } = await client.rpc("transfer_group_ownership", {
      p_group_id: GROUP_TRANSFER,
      p_new_owner_id: TRANSFER_MEMBER,
    });
    expect(error).toBeNull();

    const { data: group } = await admin
      .from("groups")
      .select("owner_id")
      .eq("id", GROUP_TRANSFER)
      .single();
    expect(group!.owner_id).toBe(TRANSFER_MEMBER);

    const { data: oldOwner } = await admin
      .from("group_members")
      .select("role")
      .eq("group_id", GROUP_TRANSFER)
      .eq("user_id", TRANSFER_OWNER)
      .single();
    expect(oldOwner!.role).toBe("member");

    const { data: newOwner } = await admin
      .from("group_members")
      .select("role")
      .eq("group_id", GROUP_TRANSFER)
      .eq("user_id", TRANSFER_MEMBER)
      .single();
    expect(newOwner!.role).toBe("owner");
  });

  it("譲渡後、旧オーナー（member）が退出できる", async () => {
    if (!dbAvailable) return;
    const client = await signedInClient("test-transfer-owner@example.com");
    const { error } = await client.rpc("leave_group", { p_group_id: GROUP_TRANSFER });
    expect(error).toBeNull();

    const { data } = await admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", GROUP_TRANSFER)
      .eq("user_id", TRANSFER_OWNER);
    expect(data).toHaveLength(0);
  });

  it("非オーナーが譲渡 → エラー", async () => {
    if (!dbAvailable) return;
    // TRANSFER_OWNER を再追加 as member
    await admin.from("group_members").insert({
      group_id: GROUP_TRANSFER,
      user_id: TRANSFER_OWNER,
      role: "member",
    });

    const client = await signedInClient("test-transfer-owner@example.com");
    const { error } = await client.rpc("transfer_group_ownership", {
      p_group_id: GROUP_TRANSFER,
      p_new_owner_id: TRANSFER_MEMBER,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("Only the owner");
  });

  it("非メンバーへの譲渡 → エラー", async () => {
    if (!dbAvailable) return;
    const client = await signedInClient("test-transfer-member@example.com");
    const { error } = await client.rpc("transfer_group_ownership", {
      p_group_id: GROUP_TRANSFER,
      p_new_owner_id: OUTSIDER_USER,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("not a member");
  });

  it("自分への譲渡 → エラー", async () => {
    if (!dbAvailable) return;
    const client = await signedInClient("test-transfer-member@example.com");
    const { error } = await client.rpc("transfer_group_ownership", {
      p_group_id: GROUP_TRANSFER,
      p_new_owner_id: TRANSFER_MEMBER,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("Cannot transfer ownership to yourself");
  });
});
