import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/server/github/keys";
import { handleWebhook } from "@/server/github/webhook";

/** GitHub → Orbit. Authenticated by HMAC signature (GITHUB_WEBHOOK_SECRET), not a session. */
export async function POST(req: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });

  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"), secret))
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const deliveryId = req.headers.get("x-github-delivery");
  const event = req.headers.get("x-github-event");
  if (!deliveryId || !event) return NextResponse.json({ error: "missing delivery headers" }, { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    return NextResponse.json(await handleWebhook(deliveryId, event, payload));
  } catch (err) {
    console.error("webhook processing failed", deliveryId, err);
    // 500 so GitHub's redelivery can retry; the failure is recorded for the health page.
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
