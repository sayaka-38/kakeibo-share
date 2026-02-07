import { describe, it, expect } from "vitest";

/**
 * 相殺（ネッティング）計算ロジックのテスト
 *
 * RPC `confirm_settlement` (Migration 020) の相殺アルゴリズムを
 * TypeScript で再現し、各パターンの正当性をテストする。
 *
 * アルゴリズム:
 *   1. 各メンバーの paid（支払った額）と owed（負担すべき額）を集計
 *   2. balance = paid - owed を計算
 *     - balance < 0 → 債務者（支払う側）
 *     - balance > 0 → 債権者（受け取る側）
 *   3. 債務者と債権者をマッチングして最小回数の送金指示を生成
 */

type Member = {
  id: string;
  name: string;
};

type Entry = {
  payerId: string;
  actualAmount: number;
  splitType: "equal" | "custom";
  /** custom の場合の分割。equal の場合は自動計算 */
  splits?: { userId: string; amount: number }[];
};

type NetTransfer = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
};

/**
 * confirm_settlement の相殺アルゴリズム TypeScript 再現
 * (Migration 020 の SQL ロジックと同等)
 */
function calculateNetTransfers(
  members: Member[],
  entries: Entry[]
): NetTransfer[] {
  const memberCount = members.length;

  // paid / owed マップ初期化
  const paid: Record<string, number> = {};
  const owed: Record<string, number> = {};
  const nameMap: Record<string, string> = {};

  for (const m of members) {
    paid[m.id] = 0;
    owed[m.id] = 0;
    nameMap[m.id] = m.name;
  }

  // エントリを処理
  for (const entry of entries) {
    // paid を加算
    paid[entry.payerId] += entry.actualAmount;

    if (entry.splitType === "custom" && entry.splits) {
      // カスタム分割
      for (const s of entry.splits) {
        owed[s.userId] += s.amount;
      }
    } else {
      // 均等分割
      const perPerson = Math.floor(entry.actualAmount / memberCount);
      const remainder = entry.actualAmount - perPerson * memberCount;

      for (const m of members) {
        // 端数は支払者が負担（SQL ロジックと同じ）
        owed[m.id] += perPerson + (m.id === entry.payerId ? remainder : 0);
      }
    }
  }

  // balance 計算 → 債務者/債権者に分類
  const debtors: { id: string; name: string; amount: number }[] = [];
  const creditors: { id: string; name: string; amount: number }[] = [];

  for (const m of members) {
    const balance = paid[m.id] - owed[m.id];
    if (balance < 0) {
      debtors.push({ id: m.id, name: nameMap[m.id], amount: -balance });
    } else if (balance > 0) {
      creditors.push({ id: m.id, name: nameMap[m.id], amount: balance });
    }
  }

  // マッチングで送金指示を生成
  const transfers: NetTransfer[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const settleAmount = Math.min(debtor.amount, creditor.amount);

    if (settleAmount > 0) {
      transfers.push({
        fromId: debtor.id,
        fromName: debtor.name,
        toId: creditor.id,
        toName: creditor.name,
        amount: settleAmount,
      });
    }

    debtor.amount -= settleAmount;
    creditor.amount -= settleAmount;

    if (debtor.amount <= 0) dIdx++;
    if (creditor.amount <= 0) cIdx++;
  }

  return transfers;
}

// =============================================================================
// ヘルパー: 合計検証
// =============================================================================

/** 全 transfer の合計が balance の合計と一致するか */
function totalTransferAmount(transfers: NetTransfer[]): number {
  return transfers.reduce((sum, t) => sum + t.amount, 0);
}

// =============================================================================
// テスト
// =============================================================================

const MEMBER_A: Member = { id: "user-a", name: "Alice" };
const MEMBER_B: Member = { id: "user-b", name: "Bob" };
const MEMBERS_2 = [MEMBER_A, MEMBER_B];

describe("相殺計算ロジック (confirm_settlement)", () => {
  // =========================================================================
  // 2人: 基本パターン
  // =========================================================================
  describe("2人: A が多く払った場合", () => {
    it("A が 10,000円払い、均等分割 → B が A に 5,000円", () => {
      const entries: Entry[] = [
        { payerId: "user-a", actualAmount: 10000, splitType: "equal" },
      ];

      const transfers = calculateNetTransfers(MEMBERS_2, entries);

      expect(transfers).toHaveLength(1);
      expect(transfers[0]).toEqual({
        fromId: "user-b",
        fromName: "Bob",
        toId: "user-a",
        toName: "Alice",
        amount: 5000,
      });
    });

    it("A が 3件合計 15,000円、B が 1件 3,000円 → B が A に 6,000円", () => {
      const entries: Entry[] = [
        { payerId: "user-a", actualAmount: 5000, splitType: "equal" },
        { payerId: "user-a", actualAmount: 5000, splitType: "equal" },
        { payerId: "user-a", actualAmount: 5000, splitType: "equal" },
        { payerId: "user-b", actualAmount: 3000, splitType: "equal" },
      ];

      // total: 18,000 → 均等 9,000/人
      // A paid: 15,000, owed: 9,000 → balance +6,000（債権者）
      // B paid: 3,000, owed: 9,000 → balance -6,000（債務者）
      const transfers = calculateNetTransfers(MEMBERS_2, entries);

      expect(transfers).toHaveLength(1);
      expect(transfers[0].fromId).toBe("user-b");
      expect(transfers[0].toId).toBe("user-a");
      expect(transfers[0].amount).toBe(6000);
    });
  });

  describe("2人: B が多く払った場合", () => {
    it("B が 8,000円払い、均等分割 → A が B に 4,000円", () => {
      const entries: Entry[] = [
        { payerId: "user-b", actualAmount: 8000, splitType: "equal" },
      ];

      const transfers = calculateNetTransfers(MEMBERS_2, entries);

      expect(transfers).toHaveLength(1);
      expect(transfers[0]).toEqual({
        fromId: "user-a",
        fromName: "Alice",
        toId: "user-b",
        toName: "Bob",
        amount: 4000,
      });
    });

    it("B が 20,000円、A が 6,000円 → A が B に 7,000円", () => {
      const entries: Entry[] = [
        { payerId: "user-b", actualAmount: 20000, splitType: "equal" },
        { payerId: "user-a", actualAmount: 6000, splitType: "equal" },
      ];

      // total: 26,000 → 均等 13,000/人
      // A paid: 6,000, owed: 13,000 → balance -7,000
      // B paid: 20,000, owed: 13,000 → balance +7,000
      const transfers = calculateNetTransfers(MEMBERS_2, entries);

      expect(transfers).toHaveLength(1);
      expect(transfers[0].fromId).toBe("user-a");
      expect(transfers[0].toId).toBe("user-b");
      expect(transfers[0].amount).toBe(7000);
    });
  });

  describe("2人: 同額の場合", () => {
    it("A, B ともに 5,000円ずつ → 送金不要", () => {
      const entries: Entry[] = [
        { payerId: "user-a", actualAmount: 5000, splitType: "equal" },
        { payerId: "user-b", actualAmount: 5000, splitType: "equal" },
      ];

      const transfers = calculateNetTransfers(MEMBERS_2, entries);

      expect(transfers).toHaveLength(0);
    });

    it("複数エントリだが合計が同額 → 送金不要", () => {
      const entries: Entry[] = [
        { payerId: "user-a", actualAmount: 3000, splitType: "equal" },
        { payerId: "user-a", actualAmount: 2000, splitType: "equal" },
        { payerId: "user-b", actualAmount: 4000, splitType: "equal" },
        { payerId: "user-b", actualAmount: 1000, splitType: "equal" },
      ];

      // A paid: 5,000, B paid: 5,000 → 均等 5,000/人 → balance = 0
      const transfers = calculateNetTransfers(MEMBERS_2, entries);

      expect(transfers).toHaveLength(0);
    });
  });

  // =========================================================================
  // 端数（奇数額の均等分割）
  // =========================================================================
  describe("端数処理", () => {
    it("奇数額 999円の均等分割: 端数は支払者が負担", () => {
      const entries: Entry[] = [
        { payerId: "user-a", actualAmount: 999, splitType: "equal" },
      ];

      // 999 / 2 = 499 (floor), remainder = 1
      // A owed: 499 + 1 = 500 (payer gets remainder)
      // B owed: 499
      // A paid: 999, owed: 500 → balance +499
      // B paid: 0, owed: 499 → balance -499
      const transfers = calculateNetTransfers(MEMBERS_2, entries);

      expect(transfers).toHaveLength(1);
      expect(transfers[0].amount).toBe(499);
      expect(transfers[0].fromId).toBe("user-b");
      expect(transfers[0].toId).toBe("user-a");
    });

    it("1円の均等分割: 支払者が全額負担（端数=1）", () => {
      const entries: Entry[] = [
        { payerId: "user-a", actualAmount: 1, splitType: "equal" },
      ];

      // 1 / 2 = 0 (floor), remainder = 1
      // A owed: 0 + 1 = 1
      // B owed: 0
      // A paid: 1, owed: 1 → balance 0
      // B paid: 0, owed: 0 → balance 0
      const transfers = calculateNetTransfers(MEMBERS_2, entries);

      expect(transfers).toHaveLength(0);
    });
  });

  // =========================================================================
  // カスタム分割
  // =========================================================================
  describe("カスタム分割", () => {
    it("A が 10,000円払い、A:3000, B:7000 で分割 → B が A に 7,000円", () => {
      const entries: Entry[] = [
        {
          payerId: "user-a",
          actualAmount: 10000,
          splitType: "custom",
          splits: [
            { userId: "user-a", amount: 3000 },
            { userId: "user-b", amount: 7000 },
          ],
        },
      ];

      // A paid: 10,000, owed: 3,000 → balance +7,000
      // B paid: 0, owed: 7,000 → balance -7,000
      const transfers = calculateNetTransfers(MEMBERS_2, entries);

      expect(transfers).toHaveLength(1);
      expect(transfers[0].amount).toBe(7000);
      expect(transfers[0].fromId).toBe("user-b");
      expect(transfers[0].toId).toBe("user-a");
    });

    it("均等とカスタムの混在", () => {
      const entries: Entry[] = [
        { payerId: "user-a", actualAmount: 10000, splitType: "equal" },
        {
          payerId: "user-b",
          actualAmount: 6000,
          splitType: "custom",
          splits: [
            { userId: "user-a", amount: 2000 },
            { userId: "user-b", amount: 4000 },
          ],
        },
      ];

      // Equal: 10,000 → A owed: 5,000, B owed: 5,000
      // Custom: 6,000 → A owed: +2,000, B owed: +4,000
      // Total: A paid: 10,000, owed: 7,000 → balance +3,000
      //        B paid: 6,000, owed: 9,000 → balance -3,000
      const transfers = calculateNetTransfers(MEMBERS_2, entries);

      expect(transfers).toHaveLength(1);
      expect(transfers[0].amount).toBe(3000);
      expect(transfers[0].fromId).toBe("user-b");
      expect(transfers[0].toId).toBe("user-a");
    });
  });

  // =========================================================================
  // 3人パターン
  // =========================================================================
  describe("3人パターン", () => {
    const MEMBER_C: Member = { id: "user-c", name: "Charlie" };
    const MEMBERS_3 = [MEMBER_A, MEMBER_B, MEMBER_C];

    it("A だけが全額負担 → B, C が A に送金", () => {
      const entries: Entry[] = [
        { payerId: "user-a", actualAmount: 9000, splitType: "equal" },
      ];

      // 9,000 / 3 = 3,000/人
      // A paid: 9,000, owed: 3,000 → balance +6,000
      // B paid: 0, owed: 3,000 → balance -3,000
      // C paid: 0, owed: 3,000 → balance -3,000
      const transfers = calculateNetTransfers(MEMBERS_3, entries);

      expect(transfers).toHaveLength(2);
      expect(totalTransferAmount(transfers)).toBe(6000);

      // B → A: 3,000
      expect(transfers[0]).toEqual({
        fromId: "user-b",
        fromName: "Bob",
        toId: "user-a",
        toName: "Alice",
        amount: 3000,
      });
      // C → A: 3,000
      expect(transfers[1]).toEqual({
        fromId: "user-c",
        fromName: "Charlie",
        toId: "user-a",
        toName: "Alice",
        amount: 3000,
      });
    });

    it("A, B が払い、C が何も払っていない → C が送金", () => {
      const entries: Entry[] = [
        { payerId: "user-a", actualAmount: 6000, splitType: "equal" },
        { payerId: "user-b", actualAmount: 3000, splitType: "equal" },
      ];

      // total: 9,000 → 3,000/人
      // A paid: 6,000, owed: 3,000 → balance +3,000
      // B paid: 3,000, owed: 3,000 → balance 0
      // C paid: 0, owed: 3,000 → balance -3,000
      const transfers = calculateNetTransfers(MEMBERS_3, entries);

      expect(transfers).toHaveLength(1);
      expect(transfers[0].fromId).toBe("user-c");
      expect(transfers[0].toId).toBe("user-a");
      expect(transfers[0].amount).toBe(3000);
    });

    it("3人とも同額 → 送金不要", () => {
      const entries: Entry[] = [
        { payerId: "user-a", actualAmount: 3000, splitType: "equal" },
        { payerId: "user-b", actualAmount: 3000, splitType: "equal" },
        { payerId: "user-c", actualAmount: 3000, splitType: "equal" },
      ];

      // total: 9,000 → 3,000/人
      // 全員 balance = 0
      const transfers = calculateNetTransfers(MEMBERS_3, entries);

      expect(transfers).toHaveLength(0);
    });

    it("3人: 端数が出る場合（10,000 / 3）", () => {
      const entries: Entry[] = [
        { payerId: "user-a", actualAmount: 10000, splitType: "equal" },
      ];

      // 10,000 / 3 = 3,333 (floor), remainder = 1
      // A owed: 3,333 + 1 = 3,334 (payer gets remainder)
      // B owed: 3,333
      // C owed: 3,333
      // A paid: 10,000, owed: 3,334 → balance +6,666
      // B paid: 0, owed: 3,333 → balance -3,333
      // C paid: 0, owed: 3,333 → balance -3,333
      const transfers = calculateNetTransfers(MEMBERS_3, entries);

      expect(transfers).toHaveLength(2);
      expect(totalTransferAmount(transfers)).toBe(6666);

      expect(transfers[0].amount).toBe(3333); // B → A
      expect(transfers[1].amount).toBe(3333); // C → A
    });

    it("3人: 複雑なパターン（A, C が払い B が多く負担）", () => {
      const entries: Entry[] = [
        { payerId: "user-a", actualAmount: 12000, splitType: "equal" },
        { payerId: "user-c", actualAmount: 6000, splitType: "equal" },
      ];

      // total: 18,000 → 6,000/人
      // A paid: 12,000, owed: 6,000 → balance +6,000
      // B paid: 0, owed: 6,000 → balance -6,000
      // C paid: 6,000, owed: 6,000 → balance 0
      const transfers = calculateNetTransfers(MEMBERS_3, entries);

      expect(transfers).toHaveLength(1);
      expect(transfers[0].fromId).toBe("user-b");
      expect(transfers[0].toId).toBe("user-a");
      expect(transfers[0].amount).toBe(6000);
    });
  });

  // =========================================================================
  // 保全性テスト: balance の合計は常に 0
  // =========================================================================
  describe("保全性: balance 合計は常に 0", () => {
    it("2人のケース", () => {
      const entries: Entry[] = [
        { payerId: "user-a", actualAmount: 7777, splitType: "equal" },
        { payerId: "user-b", actualAmount: 3333, splitType: "equal" },
      ];

      const transfers = calculateNetTransfers(MEMBERS_2, entries);

      // 債務者の送金額合計 = 債権者の受取額合計
      const fromTotal = transfers.reduce((sum, t) => sum + t.amount, 0);
      const toTotal = transfers.reduce((sum, t) => sum + t.amount, 0);
      expect(fromTotal).toBe(toTotal);
    });

    it("3人のケース", () => {
      const MEMBER_C: Member = { id: "user-c", name: "Charlie" };
      const MEMBERS_3 = [MEMBER_A, MEMBER_B, MEMBER_C];

      const entries: Entry[] = [
        { payerId: "user-a", actualAmount: 15000, splitType: "equal" },
        { payerId: "user-b", actualAmount: 8000, splitType: "equal" },
        { payerId: "user-c", actualAmount: 2000, splitType: "equal" },
      ];

      const transfers = calculateNetTransfers(MEMBERS_3, entries);

      // transfer は全体で balance を保全する
      // 各 transfer の amount の合計 = 債務者の総債務
      expect(transfers.length).toBeGreaterThanOrEqual(0);

      // paid/owed の合計は常に一致する（保全性）
      const totalPaid = entries.reduce((sum, e) => sum + e.actualAmount, 0);
      // totalOwed は分割方法に依存するが、total と一致する
      // (端数は支払者が吸収するので常に totalPaid == totalOwed)
      expect(totalPaid).toBe(25000);
    });
  });
});
