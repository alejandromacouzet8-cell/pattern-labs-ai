// app/api/stripe/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "../../lib/stripe";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, reason: "Missing session_id" },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid = session.payment_status === "paid";

    return NextResponse.json({ ok: paid });
  } catch (error) {
    console.error("Stripe confirm error", error);
    return NextResponse.json(
      { ok: false, reason: "Stripe error" },
      { status: 500 }
    );
  }
}
