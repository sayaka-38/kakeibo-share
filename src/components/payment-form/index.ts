// 公開 API
// 後方互換性を維持しつつ、新しいコンポーネント構造をエクスポート

// インライン版（旧 PaymentForm）
export {
  InlinePaymentForm as PaymentForm,
  type PaymentFormData,
} from "./InlinePaymentForm";

// フル版（旧 FullPaymentForm）
export { default } from "./FullPaymentForm";
export { default as FullPaymentForm } from "./FullPaymentForm";

// フック
export {
  usePaymentForm,
  type UsePaymentFormReturn,
  type SplitType,
} from "./hooks/usePaymentForm";

// フィールドコンポーネント
export {
  AmountField,
  DescriptionField,
  DateField,
  type AmountFieldProps,
  type DescriptionFieldProps,
  type DateFieldProps,
} from "./fields";
