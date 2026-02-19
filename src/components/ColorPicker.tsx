"use client";

import { CATEGORY_COLORS } from "@/lib/format/color";

type ColorPickerProps = {
  value: string | null;
  onChange: (color: string) => void;
};

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          onClick={() => onChange(c.hex)}
          className={`w-8 h-8 rounded-full border-2 transition-all ${
            value === c.hex
              ? "border-theme-headline scale-110 ring-2 ring-theme-primary/30"
              : "border-transparent hover:border-theme-muted/50"
          }`}
          style={{ backgroundColor: c.hex }}
          aria-label={c.name}
          title={c.name}
        />
      ))}
    </div>
  );
}
