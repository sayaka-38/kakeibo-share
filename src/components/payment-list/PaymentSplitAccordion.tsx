"use client";

/**
 * PaymentSplitAccordion - カスタム割り勘の内訳アコーディオン
 *
 * 「内訳」バッジをタップすると、メンバーごとの負担額を展開表示する。
 * display:contents で badge と content を別々の flex 子要素として配置。
 *
 * Context パターンで badge（タイトル行内）と content（行外）が
 * 同じ開閉状態を共有できるようにする。
 */

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { formatCurrency } from "@/lib/format/currency";
import { t } from "@/lib/i18n";

// --------------------------------------------------
// Types
// --------------------------------------------------

export type SplitWithProfile = {
  user_id: string;
  amount: number;
  display_name: string | null;
  email: string;
};

// --------------------------------------------------
// Context: badge と content で開閉状態を共有
// --------------------------------------------------

type SplitAccordionContextValue = {
  isOpen: boolean;
  toggle: () => void;
};

const SplitAccordionContext = createContext<SplitAccordionContextValue>({
  isOpen: false,
  toggle: () => {},
});

/**
 * Provider — カスタム割り勘がある支払い行を包む
 */
export function SplitAccordionProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <SplitAccordionContext.Provider
      value={{ isOpen, toggle: () => setIsOpen((prev) => !prev) }}
    >
      {children}
    </SplitAccordionContext.Provider>
  );
}

/**
 * Badge — タイトル行内のバッジボタン（タップで展開/格納）
 */
export function SplitBadge() {
  const { isOpen, toggle } = useContext(SplitAccordionContext);

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors cursor-pointer"
      aria-expanded={isOpen}
    >
      {t("payments.display.customBadge")}
      <svg
        className={`w-3 h-3 transition-transform duration-200 ${
          isOpen ? "rotate-180" : ""
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>
  );
}

/**
 * Content — 展開時に表示されるメンバーごとの負担額
 *
 * CSS Grid の grid-rows trick でスムーズなアニメーションを実現。
 */
export function SplitContent({ splits }: { splits: SplitWithProfile[] }) {
  const { isOpen } = useContext(SplitAccordionContext);

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out ${
        isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="overflow-hidden">
        <div className="mt-1.5 bg-gray-50 rounded-md px-3 py-2 space-y-1">
          {splits.map((split, index) => (
            <div
              key={`${split.user_id}-${index}`}
              className="flex justify-between text-xs text-gray-600"
            >
              <span>{split.display_name || split.email}</span>
              <span className="font-medium">
                {formatCurrency(split.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
