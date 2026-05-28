import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import VerifyEmailPage from "./page";

// next/navigation: useSearchParams().get("token")
let tokenValue: string | null = null;
jest.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "token" ? tokenValue : null),
  }),
}));

// next-auth/react: useSession()
type SessionShape =
  | { data: { user: { email: string } }; status: "authenticated" }
  | { data: null; status: "unauthenticated" }
  | { data: null; status: "loading" };

let sessionValue: SessionShape = { data: null, status: "unauthenticated" };
jest.mock("next-auth/react", () => ({
  useSession: () => sessionValue,
}));

// jsdom does not expose the Response global, so build a minimal stub that
// matches the shape the page reads (`ok`, `json()`).
function makeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("VerifyEmailPage", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    tokenValue = null;
    sessionValue = { data: null, status: "unauthenticated" };
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("missing token shows the dead-link state and fetch is never called", async () => {
    tokenValue = null;

    render(<VerifyEmailPage />);

    expect(await screen.findByText("連結已失效")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("200 with data.already_verified=false shows the verified state", async () => {
    tokenValue = "tok-good";
    (global.fetch as jest.Mock).mockResolvedValue(
      makeResponse(200, { data: { already_verified: false } }),
    );

    render(<VerifyEmailPage />);

    expect(await screen.findByText("Email 已驗證")).toBeInTheDocument();
    const loginLink = screen.getByRole("link", { name: /前往登入/ });
    expect(loginLink).toHaveAttribute("href", "/login");
  });

  test("200 with data.already_verified=true shows the already-verified state", async () => {
    tokenValue = "tok-good";
    (global.fetch as jest.Mock).mockResolvedValue(
      makeResponse(200, { data: { already_verified: true } }),
    );

    render(<VerifyEmailPage />);

    expect(await screen.findByText("Email 已完成驗證")).toBeInTheDocument();
    const loginLink = screen.getByRole("link", { name: /前往登入/ });
    expect(loginLink).toHaveAttribute("href", "/login");
  });

  test("non-ok fetch shows the dead-link state with a resend control visible", async () => {
    tokenValue = "tok-bad";
    (global.fetch as jest.Mock).mockResolvedValue(
      makeResponse(404, { error: { code: "RESOURCE_NOT_FOUND" } }),
    );

    render(<VerifyEmailPage />);

    expect(await screen.findByText("連結已失效")).toBeInTheDocument();
    // Resend affordance is the submit button on the dead-link card.
    expect(
      screen.getByRole("button", { name: /重新寄送驗證信/ }),
    ).toBeInTheDocument();
  });

  test("authenticated session renders the resend control as button-only", async () => {
    tokenValue = "tok-bad";
    sessionValue = {
      data: { user: { email: "bob@example.com" } },
      status: "authenticated",
    };
    (global.fetch as jest.Mock).mockResolvedValue(
      makeResponse(404, { error: { code: "RESOURCE_NOT_FOUND" } }),
    );

    render(<VerifyEmailPage />);

    expect(await screen.findByText("連結已失效")).toBeInTheDocument();
    // No email field when signed in — session resolves the target server-side.
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /重新寄送驗證信/ }),
    ).toBeInTheDocument();
  });

  test("unauthenticated session renders the email-field variant", async () => {
    tokenValue = "tok-bad";
    sessionValue = { data: null, status: "unauthenticated" };
    (global.fetch as jest.Mock).mockResolvedValue(
      makeResponse(404, { error: { code: "RESOURCE_NOT_FOUND" } }),
    );

    render(<VerifyEmailPage />);

    expect(await screen.findByText("連結已失效")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /重新寄送驗證信/ }),
    ).toBeInTheDocument();
  });

  test("StrictMode double-invoke still fires fetch exactly once (ran-once guard)", async () => {
    tokenValue = "tok-strict";
    (global.fetch as jest.Mock).mockResolvedValue(
      makeResponse(200, { data: { already_verified: false } }),
    );

    render(
      <StrictMode>
        <VerifyEmailPage />
      </StrictMode>,
    );

    // Wait until the page settles into the verified state, so the effect
    // has run to completion in both StrictMode passes.
    expect(await screen.findByText("Email 已驗證")).toBeInTheDocument();

    // The useRef ran-once guard collapses StrictMode's double-invoke into a
    // single GET against the mutating verify-email endpoint.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
