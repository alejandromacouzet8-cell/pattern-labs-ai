import { NextResponse } from "next/server";

export async function GET() {
  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  const priceId = process.env.STRIPE_PRICE_SINGLE || "";

  return NextResponse.json({
    secretKeyExists: !!secretKey,
    secretKeyLength: secretKey.length,
    secretKeyStart: secretKey.slice(0, 15),
    secretKeyEnd: secretKey.slice(-10),
    priceIdExists: !!priceId,
    priceIdValue: priceId,
    priceIdLength: priceId.length,
    // Check for hidden characters
    secretKeyHasSpaces: secretKey !== secretKey.trim(),
    priceIdHasSpaces: priceId !== priceId.trim(),
  });
}
