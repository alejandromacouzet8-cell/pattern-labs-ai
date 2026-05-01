'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

type Transaction = {
  id: string;
  type: 'usage' | 'purchase' | 'bonus';
  amount: number;
  description: string;
  created_at: string;
};

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [credits, setCredits] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push('/auth');
        return;
      }

      setUser(session.user);

      // Fetch credits
      const { data: creditData } = await supabase
        .from('credits')
        .select('balance')
        .eq('user_id', session.user.id)
        .single();

      setCredits(creditData?.balance || 0);

      // Fetch transactions
      const { data: transactionData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      setTransactions(transactionData || []);
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  };

  const handleDeleteData = async () => {
    if (!confirm('¿Estás seguro? Esto eliminará todo tu historial y no se puede deshacer.')) return;

    setDeleteLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Eliminar transacciones
      await supabase
        .from('transactions')
        .delete()
        .eq('user_id', session.user.id);

      // Resetear créditos a 0 (o mantener con 1 si prefieres)
      await supabase
        .from('credits')
        .update({ balance: 0 })
        .eq('user_id', session.user.id);

      setCredits(0);
      setTransactions([]);
      alert('Datos eliminados correctamente');
    } catch (error) {
      console.error('Error deleting data:', error);
      alert('Error al eliminar datos');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-white text-xl">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-white">Dashboard</h1>
          <button
            onClick={handleLogout}
            className="px-6 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition"
          >
            Cerrar Sesión
          </button>
        </div>

        {/* User Info */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 mb-8">
          <p className="text-gray-300">
            Email: <span className="text-white font-semibold">{user?.email}</span>
          </p>
        </div>

        {/* Credits Card */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl p-8 text-white">
            <p className="text-lg opacity-90 mb-2">Créditos Disponibles</p>
            <p className="text-5xl font-bold">{credits}</p>
            <p className="text-sm opacity-75 mt-4">1 crédito = 1 pregunta gratis a la IA</p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
            <h3 className="text-xl font-bold text-white mb-4">Acciones</h3>
            <div className="space-y-3">
              <button
                onClick={() => router.push('/')}
                className="w-full px-4 py-3 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition"
              >
                Hacer una Pregunta
              </button>
              <button
                onClick={handleDeleteData}
                disabled={deleteLoading}
                className="w-full px-4 py-3 rounded-lg bg-red-600/50 text-white hover:bg-red-600 transition disabled:opacity-50"
              >
                {deleteLoading ? 'Eliminando...' : 'Eliminar mi Historial'}
              </button>
            </div>
          </div>
        </div>

        {/* Transactions */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
          <h3 className="text-2xl font-bold text-white mb-4">Historial de Transacciones</h3>
          {transactions.length === 0 ? (
            <p className="text-gray-400">No hay transacciones aún</p>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex justify-between items-center p-4 bg-white/5 rounded-lg border border-white/10"
                >
                  <div>
                    <p className="text-white font-semibold">{tx.description}</p>
                    <p className="text-gray-400 text-sm">
                      {new Date(tx.created_at).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                  <span
                    className={`font-bold text-lg ${
                      tx.amount > 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
