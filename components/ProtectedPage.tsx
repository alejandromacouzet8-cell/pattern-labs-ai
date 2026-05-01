'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase/client';

interface ProtectedPageProps {
  children: React.ReactNode;
}

export default function ProtectedPage({ children }: ProtectedPageProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);
  const [credits, setCredits] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          router.push('/auth');
          return;
        }

        setIsAuthenticated(true);
        setUser(session.user);

        // Fetch credits
        const { data: creditData } = await supabase
          .from('credits')
          .select('balance')
          .eq('user_id', session.user.id)
          .single();

        setCredits(creditData?.balance || 0);
      } catch (error) {
        console.error('Auth check error:', error);
        router.push('/auth');
      }
    };

    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        setIsAuthenticated(false);
        router.push('/auth');
      } else {
        setIsAuthenticated(true);
        setUser(session.user);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [router]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-white text-xl">Cargando...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div>
      {/* Header with credits and logout */}
      <div className="fixed top-0 right-0 m-4 z-50 flex items-center gap-4">
        <div className="bg-white/10 backdrop-blur-md rounded-lg px-4 py-2 border border-white/20">
          <span className="text-white font-semibold">Créditos: {credits}</span>
        </div>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.push('/auth');
          }}
          className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition text-sm"
        >
          Cerrar Sesión
        </button>
        <a
          href="/dashboard"
          className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition text-sm"
        >
          Dashboard
        </a>
      </div>

      {/* Main content */}
      {children}
    </div>
  );
}
