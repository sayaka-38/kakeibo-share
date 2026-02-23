"use client";

type Props = { message: string };

export function SuccessBanner({ message }: Props) {
  return (
    <div
      className="bg-green-500/10 border border-green-500/30 text-green-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2"
      role="status"
      aria-live="polite"
    >
      <svg
        className="w-4 h-4 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
      {message}
    </div>
  );
}
