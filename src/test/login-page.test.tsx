import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ja from "@/locales/ja.json";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock Supabase client
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

// Import after mocks
import LoginPage from "@/app/login/page";

describe("LoginPage - i18n rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render app name from ja.json", () => {
    render(<LoginPage />);
    expect(screen.getByText(ja.common.appName)).toBeInTheDocument();
  });

  it("should render login subtitle from ja.json", () => {
    render(<LoginPage />);
    expect(screen.getByText(ja.auth.login.subtitle)).toBeInTheDocument();
  });

  it("should render email label from ja.json", () => {
    render(<LoginPage />);
    expect(screen.getByText(ja.auth.form.email)).toBeInTheDocument();
  });

  it("should render password label from ja.json", () => {
    render(<LoginPage />);
    expect(screen.getByText(ja.auth.form.password)).toBeInTheDocument();
  });

  it("should render login button text from ja.json", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: ja.auth.login.title })).toBeInTheDocument();
  });

  it("should render no account text from ja.json", () => {
    render(<LoginPage />);
    expect(screen.getByText(ja.auth.login.noAccount, { exact: false })).toBeInTheDocument();
  });

  it("should render signup link text from ja.json", () => {
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: ja.auth.login.signUpLink })).toBeInTheDocument();
  });

  it("should have email input with correct placeholder from ja.json", () => {
    render(<LoginPage />);
    const emailInput = screen.getByPlaceholderText(ja.auth.form.emailPlaceholder);
    expect(emailInput).toBeInTheDocument();
  });

  it("should have password input with correct placeholder from ja.json", () => {
    render(<LoginPage />);
    const passwordInput = screen.getByPlaceholderText(ja.auth.form.passwordPlaceholder);
    expect(passwordInput).toBeInTheDocument();
  });

  it("should render all Japanese text correctly - no hardcoded text", () => {
    render(<LoginPage />);

    // All visible text should come from ja.json
    const expectedTexts = [
      ja.common.appName,
      ja.auth.login.subtitle,
      ja.auth.form.email,
      ja.auth.form.password,
      ja.auth.login.title,
      ja.auth.login.signUpLink,
    ];

    expectedTexts.forEach((text) => {
      expect(screen.getByText(text, { exact: false })).toBeInTheDocument();
    });
  });
});
