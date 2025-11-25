// app/api/lib/stripe.ts
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Precios desde .env
export const PRICE_SINGLE = process.env.STRIPE_PRICE_SINGLE!;
export const PRICE_SUBSCRIPTION = process.env.STRIPE_PRICE_SUBSCRIPTION!;
