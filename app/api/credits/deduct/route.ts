import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '../../../../lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Obtener créditos del usuario
    const { data: creditData, error: creditError } = await supabase
      .from('credits')
      .select('balance')
      .eq('user_id', session.user.id)
      .single();

    if (creditError) {
      return NextResponse.json({ error: 'Could not fetch credits' }, { status: 500 });
    }

    const balance = creditData?.balance || 0;

    if (balance < 1) {
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 }
      );
    }

    // Restar 1 crédito
    const { error: updateError } = await supabase
      .from('credits')
      .update({ balance: balance - 1 })
      .eq('user_id', session.user.id);

    if (updateError) {
      return NextResponse.json({ error: 'Could not deduct credit' }, { status: 500 });
    }

    // Registrar transacción
    await supabase
      .from('transactions')
      .insert({
        user_id: session.user.id,
        type: 'usage',
        amount: -1,
        description: 'API call',
      });

    return NextResponse.json({
      success: true,
      remaining: balance - 1,
      userId: session.user.id,
    });
  } catch (error) {
    console.error('Error in credit deduction:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
