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

async function renderWithProvider() {
  await act(async () => {
    render(
      <ThemeProvider>
        <ThemeSelector />
      </ThemeProvider>
    );
  });
}

describe("ThemeSelector", () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("5つのパレットボタンをレンダリングする", async () => {
    await renderWithProvider();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
  });

  it("各ボタンにaria-labelがある", async () => {
    await renderWithProvider();
    expect(screen.getByLabelText("Steel")).toBeInTheDocument();
    expect(screen.getByLabelText("Midnight")).toBeInTheDocument();
    expect(screen.getByLabelText("Forest")).toBeInTheDocument();
    expect(screen.getByLabelText("Studio")).toBeInTheDocument();
    expect(screen.getByLabelText("Slate")).toBeInTheDocument();
  });

  it("ボタンクリックでテーマが切り替わる", async () => {
    await renderWithProvider();
    act(() => {
      fireEvent.click(screen.getByLabelText("Midnight"));
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("12");
  });

  it("選択中のボタンにscale-110クラスが付く", async () => {
    await renderWithProvider();
    // Default theme "14" = Steel should have scale-110
    const steelButton = screen.getByLabelText("Steel");
    expect(steelButton.className).toContain("scale-110");

    // Midnight should not have scale-110 initially
    const midnightButton = screen.getByLabelText("Midnight");
    expect(midnightButton.className).not.toContain("scale-110");
  });
});
