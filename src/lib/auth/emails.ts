import { sendEmail } from "@/lib/notify";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${appUrl()}/auth/reset?token=${encodeURIComponent(token)}`;
  const subject = "Reset your password";
  const text = [
    "We received a request to reset your password.",
    "",
    `Click the link below to choose a new one (valid for 30 minutes):`,
    link,
    "",
    "If you did not request this, you can safely ignore this email.",
  ].join("\n");
  const html = `<p>We received a request to reset your password.</p>
<p>Click the link below to choose a new one (valid for 30 minutes):</p>
<p><a href="${link}">${link}</a></p>
<p>If you did not request this, you can safely ignore this email.</p>`;
  return sendEmail({ to, subject, text, html });
}

export async function sendVerifyEmail(to: string, token: string) {
  const link = `${appUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
  const subject = "Verify your email";
  const text = [
    "Welcome! Please verify your email address.",
    "",
    `Click the link below to confirm (valid for 24 hours):`,
    link,
    "",
    "If you did not create an account, you can safely ignore this email.",
  ].join("\n");
  const html = `<p>Welcome! Please verify your email address.</p>
<p>Click the link below to confirm (valid for 24 hours):</p>
<p><a href="${link}">${link}</a></p>
<p>If you did not create an account, you can safely ignore this email.</p>`;
  return sendEmail({ to, subject, text, html });
}
