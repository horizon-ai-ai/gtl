jest.mock("@/lib/notify", () => ({
  sendEmail: jest.fn(async () => ({ skipped: true })),
}));

import { sendEmail } from "@/lib/notify";
import { sendPasswordResetEmail, sendVerifyEmail } from "./emails";

const mockedSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

beforeEach(() => {
  mockedSendEmail.mockClear();
  process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
});

describe("sendPasswordResetEmail", () => {
  it("dispatches an email with a non-empty subject and a /auth/reset link containing the token", async () => {
    await sendPasswordResetEmail("alice@example.com", "deadbeef");
    expect(mockedSendEmail).toHaveBeenCalledTimes(1);
    const payload = mockedSendEmail.mock.calls[0][0];
    expect(payload.to).toBe("alice@example.com");
    expect(payload.subject.length).toBeGreaterThan(0);
    expect(payload.text).toContain("https://example.test/auth/reset?token=deadbeef");
    expect(payload.html).toContain("https://example.test/auth/reset?token=deadbeef");
  });
});

describe("sendVerifyEmail", () => {
  it("dispatches an email with a non-empty subject and a /auth/verify link containing the token", async () => {
    await sendVerifyEmail("bob@example.com", "deadbeef");
    expect(mockedSendEmail).toHaveBeenCalledTimes(1);
    const payload = mockedSendEmail.mock.calls[0][0];
    expect(payload.to).toBe("bob@example.com");
    expect(payload.subject.length).toBeGreaterThan(0);
    expect(payload.text).toContain("https://example.test/auth/verify?token=deadbeef");
    expect(payload.html).toContain("https://example.test/auth/verify?token=deadbeef");
  });
});
