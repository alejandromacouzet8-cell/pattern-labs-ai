import { createServerClient } from '@/lib/supabase/server';

export async function getCurrentUser() {
  const { session, error } = await getSession();
  
  if (error || !session) {
    return null;
  }

  return session.user;
}

export async function getSession() {
  const supabase = await createServerClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  
  return { session, error };
}

export async function getUserCredits(userId: string) {
  const supabase = await createServerClient();
  
  const { data, error } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Error fetching credits:', error);
    return 0;
  }

  return data?.balance || 0;
}

export async function deductCredit(userId: string) {
  const supabase = await createServerClient();
  
  // Obtener créditos actuales
  const { data: creditData, error: fetchError } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (fetchError || !creditData || creditData.balance < 1) {
    return { success: false, message: 'Insufficient credits' };
  }

  // Restar 1 crédito
  const { error: updateError } = await supabase
    .from('credits')
    .update({ balance: creditData.balance - 1 })
    .eq('user_id', userId);

  if (updateError) {
    return { success: false, message: 'Error deducting credit' };
  }

  // Registrar transacción
  await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      type: 'usage',
      amount: -1,
      description: 'API usage',
    });

  return { success: true, remaining: creditData.balance - 1 };
}

export async function addCredits(userId: string, amount: number, description: string) {
  const supabase = await createServerClient();
  
  // Obtener créditos actuales
  const { data: creditData, error: fetchError } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (fetchError) {
    return { success: false, message: 'User not found' };
  }

  // Sumar créditos
  const newBalance = (creditData?.balance || 0) + amount;
  const { error: updateError } = await supabase
    .from('credits')
    .update({ balance: newBalance })
    .eq('user_id', userId);

  if (updateError) {
    return { success: false, message: 'Error adding credits' };
  }

  // Registrar transacción
  await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      type: 'purchase',
      amount,
      description,
    });

  return { success: true, balance: newBalance };
}
