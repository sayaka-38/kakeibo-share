import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, useTheme, type ThemeId } from "@/lib/theme";

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

function TestConsumer() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button onClick={() => setTheme("12" as ThemeId)}>Set Dark</button>
      <button onClick={() => setTheme("15" as ThemeId)}>Set Rose</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("デフォルトテーマ 14 を返す", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId("current-theme")).toHaveTextContent("14");
  });

  it("localStorage からテーマを復元する", () => {
    localStorageMock.getItem.mockReturnValueOnce("12");
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId("current-theme")).toHaveTextContent("12");
  });

  it("無効なテーマ値はデフォルトにフォールバックする", () => {
    localStorageMock.getItem.mockReturnValueOnce("invalid");
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId("current-theme")).toHaveTextContent("14");
  });

  it("setTheme で data-theme 属性と localStorage を更新する", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );
    act(() => {
      fireEvent.click(screen.getByText("Set Dark"));
    });
    expect(screen.getByTestId("current-theme")).toHaveTextContent("12");
    expect(document.documentElement.getAttribute("data-theme")).toBe("12");
    expect(localStorageMock.setItem).toHaveBeenCalledWith("kakeibo-theme", "12");
  });

  it("useTheme を Provider の外で使うとエラーを投げる", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useTheme must be used within a ThemeProvider"
    );
    spy.mockRestore();
  });
});
