"use client";

import { useEffect } from "react";

export type ActionSheetItem = {
  label: string;
  onClick: () => void;
  danger?: boolean;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  items: ActionSheetItem[];
};

export function ActionSheet({ isOpen, onClose, items }: Props) {
  // スクロールロック
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* オーバーレイ */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ボトムシート */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-theme-card-bg rounded-t-2xl shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="py-2">
          {items.map((item, index) => (
            <button
              key={index}
              type="button"
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className={`w-full min-h-[50px] px-6 flex items-center text-base transition-colors hover:bg-theme-primary/5 ${
                item.danger ? "text-red-500" : "text-theme-headline"
              }`}
            >
              {item.label}
            </button>
          ))}
          {/* キャンセルボタン */}
          <div className="border-t border-theme-card-border mt-2 pt-2 pb-safe">
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[50px] px-6 flex items-center text-base text-theme-muted hover:bg-theme-primary/5 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
