import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResetPasswordPage from "./page";

// next/navigation hooks: useRouter().push and useSearchParams().get("token")
const pushMock = jest.fn();
let tokenValue: string | null = null;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => ({
    get: (key: string) => (key === "token" ? tokenValue : null),
  }),
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

describe("ResetPasswordPage", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    pushMock.mockClear();
    tokenValue = null;
    global.fetch = jest.fn(async () =>
      makeResponse(200, { data: {} }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("missing token renders the invalid-link state with a /forgot link", () => {
    tokenValue = null;
    render(<ResetPasswordPage />);

    expect(screen.getByText("連結無效")).toBeInTheDocument();
    const recoveryLink = screen.getByRole("link", { name: /重新申請重設連結/ });
    expect(recoveryLink).toHaveAttribute("href", "/forgot");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("password shorter than 8 chars keeps submit disabled", async () => {
    tokenValue = "tok-1";
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("新密碼"), "short");
    await user.type(screen.getByLabelText("確認新密碼"), "short");

    const submit = screen.getByRole("button", { name: /更新密碼/ });
    expect(submit).toBeDisabled();
  });

  test("mismatched confirm keeps submit disabled", async () => {
    tokenValue = "tok-1";
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("新密碼"), "longenoughpw");
    await user.type(screen.getByLabelText("確認新密碼"), "longenoughpx");

    const submit = screen.getByRole("button", { name: /更新密碼/ });
    expect(submit).toBeDisabled();
  });

  test("valid matching ≥ 8 password with 200 response calls router.push('/login')", async () => {
    tokenValue = "tok-1";
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("新密碼"), "newpassword");
    await user.type(screen.getByLabelText("確認新密碼"), "newpassword");

    const submit = screen.getByRole("button", { name: /更新密碼/ });
    expect(submit).not.toBeDisabled();
    await user.click(submit);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/auth/reset-password");
    expect(JSON.parse(init.body)).toEqual({
      token: "tok-1",
      new_password: "newpassword",
    });
    expect(pushMock).toHaveBeenCalledWith("/login");
  });

  test("non-ok fetch renders failure message plus a /forgot link", async () => {
    tokenValue = "tok-1";
    global.fetch = jest.fn(async () =>
      makeResponse(404, { error: { code: "RESOURCE_NOT_FOUND", message: "x" } }),
    ) as unknown as typeof fetch;

    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("新密碼"), "newpassword");
    await user.type(screen.getByLabelText("確認新密碼"), "newpassword");
    await user.click(screen.getByRole("button", { name: /更新密碼/ }));

    expect(
      await screen.findByText(/連結已失效或過期/),
    ).toBeInTheDocument();
    const recoveryLink = screen.getByRole("link", { name: /重新申請重設連結/ });
    expect(recoveryLink).toHaveAttribute("href", "/forgot");
    expect(pushMock).not.toHaveBeenCalled();
  });
});
