import { NextResponse, NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function withAuth(handler: Function) {
  return async (req: NextRequest) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(supabaseUrl, supabaseKey);
    
    const { data: { session }, error } = await client.auth.getSession();

    if (error || !session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Pasar session y user al handler
    return handler(req, { session, user: session.user });
  };
}
