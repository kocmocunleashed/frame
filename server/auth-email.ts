/** Transactional authentication mail; never expose provider responses or link tokens. */
export async function sendAuthEmail(to: string, subject: string, url: string) {
  const key = process.env.RESEND_API_KEY,
    from = process.env.AUTH_EMAIL_FROM;
  if (!key || !from)
    throw new Error("Authentication email delivery is not configured.");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: `${subject}\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error();
  } catch {
    throw new Error(
      "Authentication email could not be delivered. Try again later.",
    );
  }
}
