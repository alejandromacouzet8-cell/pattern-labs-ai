import { NextRequest, NextResponse } from "next/server";
import { stripe, PRICE_SINGLE } from "../../../lib/stripe";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://pattern-labs-ai-beta.vercel.app";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json().catch(() => ({ email: null }));

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
