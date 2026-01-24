/**
 * PaymentForm - 後方互換性のための re-export
 *
 * 新しい実装は src/components/payment-form/ に分割されています。
 * このファイルは既存のインポートパスを維持するためのブリッジです。
 *
 * 新規コードでは直接 payment-form モジュールをインポートすることを推奨:
 * import { PaymentForm, usePaymentForm } from "@/components/payment-form";
 */

// インライン版（名前付きエクスポート）
export { PaymentForm, type PaymentFormData } from "./payment-form";

// フル版（デフォルトエクスポート）
export { default } from "./payment-form";
