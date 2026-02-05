import { NextRequest, NextResponse } from "next/server";
import { stripe, PRICE_SINGLE } from "../../../lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json().catch(() => ({ email: null }));

    // Detectar la URL base desde el request (funciona en local, móvil y producción)
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    const host = req.headers.get("host");

    // Prioridad: origin > referer > host > env > localhost
    let APP_URL: string;
    if (origin && !origin.includes("localhost")) {
      // Si viene de una IP de red (móvil), usar ese origin
      APP_URL = origin;
    } else if (referer) {
      APP_URL = referer.split("/").slice(0, 3).join("/");
    } else if (host && !host.includes("localhost")) {
      // Construir URL desde host (para móvil)
      const protocol = req.headers.get("x-forwarded-proto") || "http";
      APP_URL = `${protocol}://${host}`;
    } else {
      APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    }

    console.log("🔗 Stripe redirect URL:", APP_URL);

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
