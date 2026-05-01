import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              request.cookies.set(name, value)
            );
          },
        },
      }
    );

    await supabase.auth.exchangeCodeForSession(code);

    // Obtener el usuario actual
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Verificar si ya tiene créditos
      const { data: existingCredits } = await supabase
        .from('credits')
        .select('balance')
        .eq('user_id', user.id)
        .single();

      // Si no tiene créditos, crear 5 gratis (primera vez con Google)
      if (!existingCredits) {
        try {
          const creditsRes = await fetch(`${requestUrl.origin}/api/credits/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          });

          if (!creditsRes.ok) {
            console.error('Error creando créditos para usuario de Google');
          }
        } catch (err) {
          console.error('Error en llamada a API créditos:', err);
        }
      }
    }
  }

  // Redirigir al home
  return NextResponse.redirect(requestUrl.origin);
}
