// app/api/lib/stripe.ts
import Stripe from "stripe";

// Lazy initialization - crear cliente solo cuando se necesita
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    console.log("🔧 Initializing Stripe with key:", secretKey.slice(0, 15) + "...");
    _stripe = new Stripe(secretKey);
  }
  return _stripe;
}

// Legacy export for compatibility (pero usa lazy init)
export const stripe = {
  checkout: {
    sessions: {
      create: async (params: Stripe.Checkout.SessionCreateParams) => {
        return getStripe().checkout.sessions.create(params);
      },
      retrieve: async (id: string) => {
        return getStripe().checkout.sessions.retrieve(id);
      },
    },
  },
};

// Precios desde .env - también lazy
export const PRICE_SINGLE = process.env.STRIPE_PRICE_SINGLE || "";
export const PRICE_SUBSCRIPTION = process.env.STRIPE_PRICE_SUBSCRIPTION || "";
