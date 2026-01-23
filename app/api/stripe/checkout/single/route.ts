import { NextRequest, NextResponse } from "next/server";
import { stripe, PRICE_SINGLE } from "../../../lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json().catch(() => ({ email: null }));

    // Detectar la URL base desde el request (funciona en local y producción)
    const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/") || "http://localhost:3000";
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || origin;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price: PRICE_SINGLE,
          quantity: 1,
        },
      ],
      customer_email: email || undefined,

      success_url: `${APP_URL}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/?canceled=1`,

      metadata: {
        type: "single_analysis",
      },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error: any) {
    console.error("Stripe single error:", error);
    return NextResponse.json(
      { error: error.message ?? "Stripe error" },
      { status: 500 }
    );
  }
}
