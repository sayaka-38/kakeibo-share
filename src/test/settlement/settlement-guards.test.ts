/**
 * 清算済み支払いの編集・削除ガードテスト
 *
 * 清算が完了した支払い（settlement_id が設定されたもの）は
 * 編集・削除ができないことを検証する。
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const API_ROUTE_PATH = path.join(
  process.cwd(),
  "src/app/api/payments/[id]/route.ts"
);

const PAYMENT_LIST_PATH = path.join(
  process.cwd(),
  "src/components/payment-list/RecentPaymentList.tsx"
);

const PAYMENTS_PAGE_PATH = path.join(
  process.cwd(),
  "src/app/(protected)/payments/PaymentListWithFilter.tsx"
);

const PAYMENT_ROW_PATH = path.join(
  process.cwd(),
  "src/components/payment-list/PaymentRow.tsx"
);

const EDIT_PAGE_PATH = path.join(
  process.cwd(),
  "src/app/(protected)/payments/[id]/edit/page.tsx"
);

const CONFIRM_ROUTE_PATH = path.join(
  process.cwd(),
  "src/app/api/settlement-sessions/[id]/confirm/route.ts"
);

const SETTLEMENT_MANAGER_PATH = path.join(
  process.cwd(),
  "src/app/(protected)/groups/[id]/settlement/useSettlementSession.ts"
);

const HISTORY_DETAIL_PATH = path.join(
  process.cwd(),
  "src/app/(protected)/groups/[id]/settlement/history/[sessionId]/page.tsx"
);

const HISTORY_LIST_PATH = path.join(
  process.cwd(),
  "src/app/(protected)/groups/[id]/settlement/history/page.tsx"
);

const ZOMBIE_FIX_MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260101000024_fix_zombie_settlement_sessions.sql"
);

// =============================================================================
// API ガードテスト
// =============================================================================

describe("清算済み支払いの編集・削除ガード", () => {
  describe("DELETE /api/payments/[id] — settlement_id ガード", () => {
    it("settlement_id をSELECTで取得している", () => {
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      // DELETE ハンドラの SELECT に settlement_id が含まれる
      expect(content).toContain("settlement_id");
    });

    it("settlement_id がある場合に 403 を返すガードがある", () => {
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("清算済みの支払いは削除できません");
    });
  });

  describe("PUT /api/payments/[id] — settlement_id ガード", () => {
    it("settlement_id をSELECTで取得している", () => {
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      // PUT ハンドラのpayment取得にsettlement_idが含まれる
      const putSection = content.substring(content.indexOf("export async function PUT"));
      expect(putSection).toContain("settlement_id");
    });

    it("settlement_id がある場合に 403 を返すガードがある", () => {
      const content = fs.readFileSync(API_ROUTE_PATH, "utf-8");
      expect(content).toContain("清算済みの支払いは編集できません");
    });
  });
});

// =============================================================================
// フロントエンド表示ガードテスト
// =============================================================================

describe("フロントエンド清算済みガード", () => {
  describe("PaymentRow (共通部品) — 削除ボタン非表示", () => {
    it("settlement_id がある場合に削除ボタンを非表示にする条件がある", () => {
      const content = fs.readFileSync(PAYMENT_ROW_PATH, "utf-8");
      // isSettled が payment.settlement_id から導出され、!isSettled で制御
      expect(content).toContain("!!payment.settlement_id");
      expect(content).toContain("!isSettled");
      expect(content).toContain("DeletePaymentForm");
    });

    it("RecentPaymentList が PaymentRow を使用している", () => {
      const content = fs.readFileSync(PAYMENT_LIST_PATH, "utf-8");
      expect(content).toContain("PaymentRow");
    });

    it("清算済ラベルにチェックアイコンが含まれる", () => {
      const content = fs.readFileSync(PAYMENT_ROW_PATH, "utf-8");
      // チェックマークSVGパスが含まれる
      expect(content).toContain("M5 13l4 4L19 7");
      expect(content).toContain("清算済");
    });

    it("清算済ラベルがテーマカラー（深緑）を使用している", () => {
      const content = fs.readFileSync(PAYMENT_ROW_PATH, "utf-8");
      // settlement_id バッジ周辺で bg-theme-text/15 を使用
      expect(content).toContain("bg-theme-text/15 text-theme-text");
    });
  });

  describe("支払い一覧ページ (/payments) — 清算済みガード", () => {
    it("settlement_id を型定義に含んでいる (types.ts)", () => {
      // PaymentRowData の settlement_id は共通型ファイルで定義
      const typesPath = path.join(
        process.cwd(),
        "src/components/payment-list/types.ts"
      );
      const content = fs.readFileSync(typesPath, "utf-8");
      expect(content).toContain("settlement_id: string | null");
    });

    it("PaymentRow で清算済ラベル・編集/削除ガードが実装されている", () => {
      const content = fs.readFileSync(PAYMENT_ROW_PATH, "utf-8");
      // isSettled が payment.settlement_id から導出されている
      expect(content).toContain("!!payment.settlement_id");
      // edit リンクの近くで !isSettled ガードが使われている
      const editLinkIdx = content.indexOf("/payments/${payment.id}/edit");
      const guardIdx = content.lastIndexOf("!isSettled", editLinkIdx);
      expect(guardIdx).toBeGreaterThan(-1);
    });

    it("PaymentRow で削除ボタンに !isSettled ガードがある", () => {
      const content = fs.readFileSync(PAYMENT_ROW_PATH, "utf-8");
      // DeletePaymentForm の使用箇所（import ではなく JSX）の条件に !isSettled が含まれる
      const importEnd = content.indexOf("DeletePaymentForm") + "DeletePaymentForm".length;
      const usageIdx = content.indexOf("DeletePaymentForm", importEnd);
      expect(usageIdx).toBeGreaterThan(-1);
      const guardIdx = content.lastIndexOf("!isSettled", usageIdx);
      expect(guardIdx).toBeGreaterThan(-1);
    });

    it("PaymentListWithFilter が PaymentRow を使用している", () => {
      const content = fs.readFileSync(PAYMENTS_PAGE_PATH, "utf-8");
      expect(content).toContain("PaymentRow");
    });
  });

  describe("支払い編集ページ — settlement_id ガード", () => {
    it("settlement_id をSELECTで取得している", () => {
      const content = fs.readFileSync(EDIT_PAGE_PATH, "utf-8");
      expect(content).toContain("settlement_id");
    });

    it("settlement_id がある場合にリダイレクトする", () => {
      const content = fs.readFileSync(EDIT_PAGE_PATH, "utf-8");
      // settlement_id チェックがリダイレクト条件に含まれる
      expect(content).toContain("payment.settlement_id");
      expect(content).toContain('redirect("/payments")');
    });
  });
});

// =============================================================================
// confirm-receipt フィードバックテスト
// =============================================================================

describe("confirm-receipt 完了フィードバック", () => {
  it("confirm-receipt 後に履歴詳細ページへリダイレクトする", () => {
    const content = fs.readFileSync(SETTLEMENT_MANAGER_PATH, "utf-8");
    // handleConfirmReceipt 内で router.push が呼ばれる
    const receiptSection = content.substring(content.indexOf("handleConfirmReceipt"));
    expect(receiptSection).toContain("router.push");
    expect(receiptSection).toContain("/settlement/history/");
  });
});

// =============================================================================
// ゾンビ現象修正テスト
// =============================================================================

describe("ゾンビ清算セッション修正", () => {
  describe("confirm_settlement_receipt RPC — 同グループ一括 settled", () => {
    it("マイグレーションファイルが存在する", () => {
      expect(fs.existsSync(ZOMBIE_FIX_MIGRATION_PATH)).toBe(true);
    });

    it("同グループの他の pending_payment セッションも settled に更新する", () => {
      const content = fs.readFileSync(ZOMBIE_FIX_MIGRATION_PATH, "utf-8");
      // 同グループの他の pending_payment を一括更新する処理
      expect(content).toContain("AND id != p_session_id");
      expect(content).toContain("AND status = 'pending_payment'");
      expect(content).toContain("group_id = v_session.group_id");
    });

    it("SECURITY DEFINER で RLS をバイパスする", () => {
      const content = fs.readFileSync(ZOMBIE_FIX_MIGRATION_PATH, "utf-8");
      expect(content).toContain("SECURITY DEFINER");
    });
  });

  describe("settle_consolidated_sessions RPC", () => {
    it("バッチ処理用 RPC が定義されている", () => {
      const content = fs.readFileSync(ZOMBIE_FIX_MIGRATION_PATH, "utf-8");
      expect(content).toContain("settle_consolidated_sessions");
      expect(content).toContain("p_session_ids UUID[]");
    });

    it("net_transfers を空配列にクリアする", () => {
      const content = fs.readFileSync(ZOMBIE_FIX_MIGRATION_PATH, "utf-8");
      // settle_consolidated_sessions で net_transfers = '[]' を設定
      expect(content).toContain("'[]'::JSONB");
    });
  });

  describe("confirm route — RPC 経由で統合済みセッション更新", () => {
    it("settle_consolidated_sessions RPC を呼び出す", () => {
      const content = fs.readFileSync(CONFIRM_ROUTE_PATH, "utf-8");
      expect(content).toContain("settle_consolidated_sessions");
    });

    it("PostgREST の直接 update を使用しない", () => {
      const content = fs.readFileSync(CONFIRM_ROUTE_PATH, "utf-8");
      // 旧セッションの更新で .from("settlement_sessions").update を使わない
      // （新セッション自身の update は OK なので、統合処理部分のみ確認）
      const consolidationSection = content.substring(
        content.indexOf("旧 pending_payment セッションを")
      );
      expect(consolidationSection).not.toContain(".from(\"settlement_sessions\")");
      expect(consolidationSection).toContain("supabase.rpc");
    });
  });
});

// =============================================================================
// 合算（相殺統合）整合性テスト
// =============================================================================

describe("合算時の履歴整合性", () => {
  describe("履歴詳細ページ — 統合済みバナー", () => {
    it("統合済みセッションに対してバナーメッセージを表示する", () => {
      const content = fs.readFileSync(HISTORY_DETAIL_PATH, "utf-8");
      expect(content).toContain("後続の清算に統合されました");
    });

    it("ステータスバッジ（清算完了 / 支払い待ち）が表示される", () => {
      const content = fs.readFileSync(HISTORY_DETAIL_PATH, "utf-8");
      expect(content).toContain("清算完了");
      expect(content).toContain("支払い待ち");
    });

    it("settled_at の日時が表示される", () => {
      const content = fs.readFileSync(HISTORY_DETAIL_PATH, "utf-8");
      expect(content).toContain("settled_at");
      expect(content).toContain("受取完了日");
    });
  });

  describe("履歴詳細ページ — 日付ラベル改善", () => {
    it("「清算開始日」ラベルが表示される", () => {
      const content = fs.readFileSync(HISTORY_DETAIL_PATH, "utf-8");
      expect(content).toContain("清算開始日");
    });

    it("「受取完了日」ラベルが表示される", () => {
      const content = fs.readFileSync(HISTORY_DETAIL_PATH, "utf-8");
      expect(content).toContain("受取完了日");
    });
  });

  describe("履歴詳細ページ — 統合セッション内訳表示", () => {
    it("統合された清算の支払いセクションがある", () => {
      const content = fs.readFileSync(HISTORY_DETAIL_PATH, "utf-8");
      expect(content).toContain("統合された清算の支払い");
    });

    it("統合されたセッションの件数を表示する", () => {
      const content = fs.readFileSync(HISTORY_DETAIL_PATH, "utf-8");
      expect(content).toContain("件の清算を統合");
    });

    it("統合セッションのエントリを取得するクエリがある", () => {
      const content = fs.readFileSync(HISTORY_DETAIL_PATH, "utf-8");
      // settlement_entries から統合セッションのエントリを取得
      expect(content).toContain("consolidatedEntries");
      expect(content).toContain("mergedIds");
    });
  });

  describe("履歴一覧ページ — 統合済みバッジ", () => {
    it("統合済みセッションに「統合済み」バッジが表示される", () => {
      const content = fs.readFileSync(HISTORY_LIST_PATH, "utf-8");
      expect(content).toContain("統合済み");
      expect(content).toContain("is_consolidated");
    });
  });
});
