import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider } from "@/lib/theme";
import ThemeSelector from "@/components/ThemeSelector";

// localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

function renderWithProvider() {
  return render(
    <ThemeProvider>
      <ThemeSelector />
    </ThemeProvider>
  );
}

describe("ThemeSelector", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("5つのパレットボタンをレンダリングする", () => {
    renderWithProvider();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
  });

  it("各ボタンにaria-labelがある", () => {
    renderWithProvider();
    expect(screen.getByLabelText("Sunny")).toBeInTheDocument();
    expect(screen.getByLabelText("Night")).toBeInTheDocument();
    expect(screen.getByLabelText("Rose")).toBeInTheDocument();
    expect(screen.getByLabelText("Cocoa")).toBeInTheDocument();
    expect(screen.getByLabelText("Marine")).toBeInTheDocument();
  });

  it("ボタンクリックでテーマが切り替わる", () => {
    renderWithProvider();
    act(() => {
      fireEvent.click(screen.getByLabelText("Night"));
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("12");
  });

  it("選択中のボタンにscale-110クラスが付く", () => {
    renderWithProvider();
    // Default theme "14" = Sunny should have scale-110
    const sunnyButton = screen.getByLabelText("Sunny");
    expect(sunnyButton.className).toContain("scale-110");

    // Night should not have scale-110 initially
    const nightButton = screen.getByLabelText("Night");
    expect(nightButton.className).not.toContain("scale-110");
  });
});
