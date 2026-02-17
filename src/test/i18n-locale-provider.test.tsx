import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider, useLocale, t, setCurrentLocale } from "@/lib/i18n";

// Always reset to ja after tests
afterEach(() => {
  setCurrentLocale("ja");
  try {
    localStorage.removeItem("kakeibo-locale");
  } catch {
    // no localStorage in test env
  }
});

function TestConsumer() {
  const { locale, setLocale } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="translated">{t("settings.title")}</span>
      <button onClick={() => setLocale("en")} data-testid="switch-en">
        English
      </button>
      <button onClick={() => setLocale("ja")} data-testid="switch-ja">
        日本語
      </button>
    </div>
  );
}

describe("LocaleProvider + useLocale", () => {
  it("provides default locale 'ja'", () => {
    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );
    expect(screen.getByTestId("locale").textContent).toBe("ja");
    expect(screen.getByTestId("translated").textContent).toBe("設定");
  });

  it("switches locale to English and re-renders with new translations", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );

    await user.click(screen.getByTestId("switch-en"));

    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("translated").textContent).toBe("Settings");
  });

  it("switches locale back to Japanese", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );

    await user.click(screen.getByTestId("switch-en"));
    expect(screen.getByTestId("translated").textContent).toBe("Settings");

    await user.click(screen.getByTestId("switch-ja"));
    expect(screen.getByTestId("locale").textContent).toBe("ja");
    expect(screen.getByTestId("translated").textContent).toBe("設定");
  });

  it("throws when useLocale is used outside LocaleProvider", () => {
    // Suppress React error boundary noise
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useLocale must be used within a LocaleProvider"
    );
    consoleSpy.mockRestore();
  });
});
