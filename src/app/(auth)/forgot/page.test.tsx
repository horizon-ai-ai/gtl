import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ForgotPasswordPage from "./page";

// jsdom does not expose the Response global, so build a minimal stub that
// matches the shape consumers read (`ok`, `json()`).
function makeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("ForgotPasswordPage", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(async () =>
      makeResponse(200, { data: {} }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("submits the typed email and renders the neutral confirmation", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    const emailField = screen.getByLabelText("Email");
    await user.type(emailField, "bob@example.com");
    await user.click(screen.getByRole("button", { name: /寄出重設連結/ }));

    // Neutral confirmation — never reveals account existence.
    expect(
      await screen.findByText(/若該 Email 有對應帳號，我們已寄出重設連結/),
    ).toBeInTheDocument();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/auth/forgot-password");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse(init.body)).toEqual({ email: "bob@example.com" });
  });
});
