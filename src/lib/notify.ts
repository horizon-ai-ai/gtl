import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const from = process.env.RESEND_FROM_EMAIL || "noreply@platform.com";

type EmailPayload = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail(payload: EmailPayload) {
  if (!resend) {
    console.info("[email:noop]", payload.subject, payload.to);
    return { skipped: true };
  }

  try {
    return await resend.emails.send({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
  } catch (error) {
    console.error("[email:error]", payload.subject, payload.to, error);
    return { skipped: true, error: "send_failed" };
  }
}
