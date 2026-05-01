import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Usar Service Role para crear usuario sin confirmación de email
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Crear usuario con email confirmado automáticamente
    const { data: userData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // ← AUTO-CONFIRMAR EMAIL
    });

    if (signUpError) {
      return NextResponse.json({ error: signUpError.message }, { status: 400 });
    }

    if (!userData.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    // Crear créditos iniciales
    const { error: creditsError } = await supabaseAdmin
      .from('credits')
      .insert({
        user_id: userData.user.id,
        balance: 5,
        description: '5 créditos gratis de bienvenida',
      });

    if (creditsError) {
      console.error('Error creating credits:', creditsError);
      // No fallar, solo loguear
    }

    // Registrar transacción
    await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: userData.user.id,
        type: 'grant',
        amount: 5,
        description: 'Créditos de bienvenida',
      });

    return NextResponse.json({
      success: true,
      message: 'Cuenta creada exitosamente',
      userId: userData.user.id,
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: error.message || 'Error creating account' },
      { status: 500 }
    );
  }
}
