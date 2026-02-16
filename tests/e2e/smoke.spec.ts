import { test, expect, type Page } from "@playwright/test";

/** seed ユーザー Alice */
const ALICE = { email: "alice@example.com", password: "password123" };
const TEST_DESCRIPTION = "E2Eスモークテスト";
const TEST_AMOUNT = "999";

/**
 * 5xx レスポンス監視を設定する。
 * テスト終了時に collected errors をチェックすれば 500 エラーを検知できる。
 */
function trackServerErrors(page: Page) {
  const errors: string[] = [];
  page.on("response", (res) => {
    if (res.status() >= 500) {
      errors.push(`${res.status()} ${res.url()}`);
    }
  });
  return errors;
}

/**
 * テスト説明文を含む PaymentRow の根元 div を返す。
 * PaymentRow のルートは `<div class="px-4 py-3">` なので xpath ancestor で辿る。
 */
function getTestPaymentRow(page: Page) {
  return page
    .getByText(TEST_DESCRIPTION)
    .first()
    .locator('xpath=ancestor::div[contains(@class,"py-3")]')
    .first();
}

/**
 * テスト支払いをすべて削除する（前回の失敗で残ったデータのクリーンアップ）。
 * dialog ハンドラは事前に登録済みであること。
 */
async function cleanupTestPayments(page: Page) {
  await page.goto("/payments");

  for (;;) {
    const text = page.getByText(TEST_DESCRIPTION).first();
    if (!(await text.isVisible({ timeout: 2_000 }).catch(() => false))) break;

    const row = getTestPaymentRow(page);
    await row.locator('button[aria-label="削除"]').click();
    // 削除 API 完了 + router.refresh() を待つ
    await page.waitForTimeout(2_000);
  }
}

test.describe("スモークテスト: 支払い登録→確認→削除", () => {
  test("ログイン→支払い登録→清算確認→支払い削除", async ({ page }) => {
    const serverErrors = trackServerErrors(page);

    // window.confirm ダイアログを自動承認（テスト全体で1回だけ登録）
    page.on("dialog", (dialog) => dialog.accept());

    // ── 1. ログイン ──
    await page.goto("/login");
    await page.locator("#email").fill(ALICE.email);
    await page.locator("#password").fill(ALICE.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/dashboard");

    // ── クリーンアップ（前回の失敗で残ったテストデータを削除）──
    await cleanupTestPayments(page);

    // ── 2. 支払い登録 ──
    await page.goto("/payments/new");
    await page.locator("#amount").fill(TEST_AMOUNT);
    await page.locator("#description").fill(TEST_DESCRIPTION);
    // カテゴリ・日付・割り勘はデフォルトのまま
    await page.locator('button[type="submit"]').click();

    // /payments にリダイレクトされ、登録した支払いが表示される
    await page.waitForURL("**/payments");
    await expect(page.getByText(TEST_DESCRIPTION).first()).toBeVisible();

    // ── 3. 清算ページ確認 ──
    await page.goto("/settlement");
    // ページが 500 エラーなく描画されることを確認（h1 見出し「清算」が表示される）
    await expect(
      page.locator("h1", { hasText: "清算" })
    ).toBeVisible({ timeout: 15_000 });

    // ── 4. 支払い削除（アーカイブ）──
    await page.goto("/payments");
    await expect(page.getByText(TEST_DESCRIPTION).first()).toBeVisible();

    // テスト支払いの削除ボタンをクリック
    const paymentRow = getTestPaymentRow(page);
    await paymentRow.locator('button[aria-label="削除"]').click();

    // 支払いが一覧から消えることを確認
    await expect(page.getByText(TEST_DESCRIPTION)).toBeHidden({
      timeout: 10_000,
    });

    // ── 5. 500 エラー不在の確認 ──
    expect(serverErrors).toEqual([]);
  });
});
