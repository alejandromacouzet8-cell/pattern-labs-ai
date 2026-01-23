'use client';

import React, { useState, useRef, useEffect } from 'react';

/** Flag solo para desarrollo (Next reemplaza esto en build) */
const isDev = process.env.NODE_ENV !== 'production';

/** Unified Schema - Demo & Paid use same structure */
type PatternItem = {
  title: string;
  description: string;
  category: "Emoción" | "Dinámica" | "Fortaleza" | "Riesgo";
  evidence?: string; // PAID ONLY
};

type PatternScore = {
  value: number; // 0-10
  label: string; // "Balance emocional"
  interpretation: string; // 1-2 sentences
};

type EvidenceItem = {
  pattern: string;
  quote: string;
  context: string;
};

type AnalyzeResult = {
  ok: boolean;
  version: "demo" | "full";
  fileName: string;
  length: number;

  // Core metric (ALWAYS present)
  patternScore: PatternScore;

  // Main patterns (demo: 3, paid: 6-8)
  patterns: PatternItem[];

  // Insights (PAID ONLY)
  tlDr?: string[];
  strengths?: string[];
  areasToWatch?: string[];

  // Evidence quotes (PAID ONLY)
  evidence?: EvidenceItem[];

  // Deep sections (PAID ONLY)
  sections?: Array<{
    id: string;
    title: string;
    body: string;
  }>;

  // Legacy/internal
  rawAnalysis?: string;
  fullChat: string;
  truncated?: boolean;
  processedLength?: number;
};

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [openSectionId, setOpenSectionId] = useState<string | null>('resumen');

  const [isPaying, setIsPaying] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  // 🔢 Créditos de preguntas a la IA (3 incluidos con el pago)
  const [credits, setCredits] = useState<number>(0);

  // 🎯 Controlar flujo del file input (aparece después del CTA)
  const [showFileInput, setShowFileInput] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasFile = !!selectedFile;

  // 🧠 Rehidratar acceso/credits desde localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('patternlabs_access');
      console.log('📦 localStorage leído:', stored);
      if (!stored) {
        console.log('📦 No hay datos en localStorage, usando defaults');
        return;
      }
      const parsed = JSON.parse(stored) as {
        hasAccess?: boolean;
        credits?: number;
      };
      console.log('📦 Datos parseados:', parsed);
      if (parsed.hasAccess) setHasAccess(true);
      if (typeof parsed.credits === 'number') setCredits(parsed.credits);
    } catch (err) {
      console.error('Error leyendo localStorage', err);
    }
  }, []);

  // Guardar cambios en localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload = JSON.stringify({ hasAccess, credits });
      window.localStorage.setItem('patternlabs_access', payload);
    } catch (err) {
      console.error('Error guardando localStorage', err);
    }
  }, [hasAccess, credits]);

  // Cuando haya resultado, bajamos automáticamente al reporte
  useEffect(() => {
    if (!result) return;
    const el = document.getElementById('conversation-report');
    if (el) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [result]);

  // Cuando regresa de Stripe con ?session_id=...
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');

    if (!sessionId) return;

    (async () => {
      try {
        const res = await fetch(`/api/stripe/confirm?session_id=${sessionId}`);
        const data = await res.json();

        if (data.ok) {
          setHasAccess(true);
          // Asignar 3 créditos con el pago
          setCredits(3);
          setStatus(
            'Pago confirmado ✅ Ya puedes ver el análisis completo y hacer 3 preguntas a la IA sobre tu chat.'
          );
          // Limpiar la query de la URL
          window.history.replaceState({}, '', window.location.pathname);
        } else {
          setStatus(
            data.error ||
              'No se pudo confirmar el pago. Si ya se te cobró, contáctanos.'
          );
        }
      } catch (error) {
        console.error(error);
        setStatus(
          'Ocurrió un problema al confirmar el pago. Intenta recargar la página.'
        );
      }
    })();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setResult(null);

    if (file) {
      setStatus(`Archivo seleccionado: "${file.name}". Generando reporte...`);
      // Automáticamente generar el reporte
      await handleUploadWithFile(file);
    } else {
      setStatus('');
    }
  };

  const handleUploadWithFile = async (file: File) => {
    try {
      setIsUploading(true);
      setStatus('Subiendo y procesando archivo…');
      setResult(null);

      const formData = new FormData();
      formData.append('file', file);
      // 👇 Modo demo si no ha pagado, modo full si ya pagó
      formData.append('mode', hasAccess ? 'full' : 'free');

      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || 'Ocurrió un error al procesar el archivo.');
        return;
      }

      setStatus(
        hasAccess
          ? 'Reporte completo generado correctamente. 🎯'
          : 'Reporte demo generado correctamente. 🎯'
      );
      setResult(data as AnalyzeResult);
      setOpenSectionId('resumen');
    } catch (error) {
      console.error(error);
      setStatus('Error de red o del servidor al analizar el archivo.');
    } finally {
      setIsUploading(false);
    }
  };

  const scrollToGuide = () => {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('export-guide');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const toggleSection = (id: string) => {
    setOpenSectionId((current) => (current === id ? null : id));
  };

  const handleCheckoutSingle = async () => {
    try {
      setIsPaying(true);
      setStatus('Creando sesión de pago segura…');

      // En desarrollo, simular pago directamente para pruebas
      if (isDev) {
        // Simular delay de procesamiento
        await new Promise(resolve => setTimeout(resolve, 1000));
        setHasAccess(true);
        setCredits(3);
        setStatus('✅ [DEV] Pago simulado exitoso. Tienes 3 preguntas disponibles.');
        setIsPaying(false);
        return;
      }

      const res = await fetch('/api/stripe/checkout/single', {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        console.error('Stripe error:', data);
        setStatus(
          data.error || 'No se pudo iniciar el pago. Intenta de nuevo.'
        );
        return;
      }

      // Redirigir a Stripe Checkout
      window.location.href = data.url;
    } catch (error) {
      console.error(error);
      setStatus('Error de red al conectar con Stripe.');
    } finally {
      setIsPaying(false);
    }
  };

  /** 🔧 Botón dev para borrar el estado local de acceso */
  const handleResetAccess = () => {
    console.log('🔄 Reseteando acceso...');
    setHasAccess(false);
    setCredits(0);
    setResult(null); // También limpiar el resultado
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('patternlabs_access');
      console.log('🗑️ localStorage limpiado');
    }
    setStatus('✅ Estado reiniciado. Sube un chat para ver el demo.');
  };

  const consumeCredit = () => {
    setCredits((prev) => Math.max(prev - 1, 0));
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* HERO */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_#4c1d95_0,_#020617_55%)] opacity-80" />

        <div className="relative mx-auto flex min-h-[80vh] max-w-6xl flex-col gap-16 px-6 pb-16 pt-10 lg:flex-row lg:items-center lg:pt-16">
          {/* Columna izquierda */}
          <div className="max-w-xl space-y-8">
            {/* Badge superior */}
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-1 text-xs text-emerald-200 shadow-lg shadow-emerald-500/20">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              Analiza tus chats en segundos · 100% privado
            </div>

            {/* Título */}
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl leading-tight">
              No solo analizamos tu chat.
              <br />
              <span className="bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-300 bg-clip-text text-transparent">
                Hablamos contigo sobre él.
              </span>
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              by <span className="font-semibold text-slate-100">Pattern Labs AI</span>
            </p>

            {/* Descripción con diferenciador */}
            <p className="max-w-lg text-base text-slate-300 sm:text-lg leading-relaxed">
              La única IA que <span className="font-bold text-emerald-300">responde tus preguntas específicas</span> sobre tu relación.
              Sube tu chat de WhatsApp, obtén tu análisis y <span className="font-bold text-cyan-300">pregúntale lo que quieras</span>.
            </p>

            {/* Feature highlight */}
            <div className="inline-flex items-center gap-3 rounded-2xl border border-purple-500/30 bg-purple-500/10 px-5 py-3 backdrop-blur-sm">
              <svg className="w-6 h-6 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <p className="text-sm font-semibold text-purple-200">
                "¿Quién está más enganchado?" "¿Qué debería cambiar yo?" → <span className="text-white">La IA te responde</span>
              </p>
            </div>

            {/* Quick links */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <button
                type="button"
                onClick={scrollToGuide}
                className="inline-flex items-center gap-1.5 text-slate-400 hover:text-emerald-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>¿Cómo exportar mi chat?</span>
              </button>
              <span className="text-slate-700">•</span>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('privacy');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-1.5 text-slate-400 hover:text-emerald-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Privacidad y seguridad</span>
              </button>
            </div>

            {/* Controles */}
            <div className="space-y-4">
              {/* CTA Principal: Prueba gratis */}
              <div className="space-y-3">
                {!showFileInput ? (
                  // PASO 1: Mostrar botones principales
                  <div className="flex flex-col gap-3 w-full max-w-md">
                    <button
                      type="button"
                      onClick={() => setShowFileInput(true)}
                      disabled={isUploading}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-full px-6 py-4 text-base sm:text-lg font-bold text-white
                        bg-gradient-to-r from-emerald-500 to-cyan-500
                        shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-105 active:scale-95 transition-all duration-300
                        disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <svg className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>Generar reporte demo gratis</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCheckoutSingle}
                      disabled={isPaying}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-purple-300
                        border-2 border-purple-500/50 bg-purple-500/10
                        hover:bg-purple-500/20 hover:border-purple-400 hover:scale-105 active:scale-95 transition-all duration-300
                        disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                      </svg>
                      <span>{isPaying ? 'Redirigiendo...' : 'Unlock Full Analysis + AI'}</span>
                    </button>
                  </div>
                ) : (
                  // PASO 2: Mostrar el file input cuando hacen click
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Botón seleccionar archivo */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="inline-flex items-center gap-2 rounded-full px-6 py-3
                        text-base font-semibold text-white
                        bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-300
                        shadow-lg shadow-purple-500/20 hover:opacity-90 transition
                        disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isUploading ? (
                        <>
                          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Analizando...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <span>{hasFile ? `"${selectedFile?.name}"` : 'Subir chat (.txt)'}</span>
                        </>
                      )}
                    </button>

                    {/* input real oculto */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={isUploading}
                    />
                  </div>
                )}

                {/* link guía rápida */}
                <p className="text-xs text-slate-400">
                  ¿No sabes cómo exportar tu chat de WhatsApp?{' '}
                  <button
                    type="button"
                    onClick={scrollToGuide}
                    className="font-semibold text-emerald-300 hover:text-emerald-200"
                  >
                    Ver guía rápida
                  </button>
                </p>

                {/* estado del uploader / pago */}
                {status && (
                  <p className="flex items-center gap-2 text-[13px] text-slate-200">
                    <span className="text-emerald-300">▸</span>
                    {status}
                  </p>
                )}
              </div>

              {/* Info discreta sobre el pago */}
              {!hasAccess && (
                <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-slate-900/60 to-slate-950/80 p-4 shadow-lg shadow-emerald-500/5 relative overflow-hidden">
                  {/* Orbes animados MÁS VISIBLES */}
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/40 rounded-full blur-2xl animate-pulse-glow pointer-events-none" />
                  <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-cyan-500/40 rounded-full blur-2xl animate-pulse-glow pointer-events-none" style={{animationDelay: '1.5s'}} />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl animate-pulse-glow pointer-events-none" style={{animationDelay: '0.7s'}} />

                  <div className="flex items-start gap-3 relative z-10">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="rounded-full bg-emerald-500/10 p-2">
                        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-100 mb-1">
                        El demo es 100% gratis
                      </p>
                      <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                        Prueba el análisis sin costo. Si quieres el reporte completo + chat con IA, puedes desbloquearlo después.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById('ai-chat-feature');
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        data-unlock-btn
                        className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-all duration-300 group relative"
                      >
                        <span>Ver qué incluye por MX$49</span>
                        <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {hasAccess && (
                <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 p-4 shadow-lg shadow-emerald-500/10">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="rounded-full bg-emerald-500/20 p-2">
                        <svg className="w-4 h-4 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-emerald-200 mb-1">
                        Acceso completo activado
                      </p>
                      <p className="text-xs text-emerald-300/80">
                        Preguntas disponibles con IA: <strong className="text-emerald-200">{credits} / 3</strong>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Botón dev para resetear el estado local de pruebas */}
              {isDev && (
                <button
                  type="button"
                  onClick={handleResetAccess}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-xs text-rose-300 hover:bg-rose-500/30 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset (Dev)
                </button>
              )}
            </div>
          </div>

          {/* Columna derecha: mockup estático SOLO si aún no hay reporte */}
          {!result && (
            <div className="mx-auto max-w-md flex-1 relative">
              {/* Orbes morados detrás del mockup - moviéndose lento */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-60">
                <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] bg-purple-500/30 rounded-full blur-3xl animate-pulse-glow" />
                <div className="absolute bottom-1/3 left-1/4 w-[250px] h-[250px] bg-violet-500/25 rounded-full blur-3xl animate-pulse-glow" style={{animationDelay: '2s'}} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-fuchsia-500/20 rounded-full blur-3xl animate-pulse-glow" style={{animationDelay: '1s'}} />
              </div>

              <div className="relative rounded-3xl border border-violet-500/40 bg-slate-900/80 p-6 shadow-[0_0_80px_rgba(129,140,248,0.6)]">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium tracking-wider text-slate-400">
                      PATTERN SCORE
                    </p>
                    <p className="text-sm text-slate-300">Relación · Últimos 90 días</p>
                  </div>
                  <span className="rounded-full border border-violet-400/60 bg-violet-500/30 px-4 py-1.5 text-xs font-semibold text-violet-50">
                    REPORTE DEMO
                  </span>
                </div>

                {/* Bloque principal */}
                <div className="mb-6 flex items-end justify-between gap-4 rounded-2xl bg-slate-900/90 px-5 py-4">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Balance emocional</p>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-5xl font-bold text-slate-50">8.3</span>
                      <span className="text-base text-slate-400">/10</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                      Se observa una base emocional mayormente positiva, con momentos de tensión,
                      silencios largos y cambios de tono que marcan las distintas etapas de la
                      relación.
                    </p>
                    <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                      El informe combina señales del lenguaje, frecuencia de mensajes y contexto
                      para detectar cómo se sienten realmente las dos partes.
                    </p>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-bold text-emerald-300">
                      +32%
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500 text-center">
                      vs. últimos 30 días
                    </p>
                  </div>
                </div>

                <p className="mb-3 text-sm font-medium tracking-wider text-slate-400">
                  PRINCIPALES PATRONES DETECTADOS
                </p>

                <div className="space-y-3">
                  <div className="flex flex-col gap-2 rounded-xl bg-slate-900/80 px-4 py-3 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-100 text-sm">Picos de ansiedad nocturna</p>
                      <span className="rounded-full bg-rose-500/20 px-2.5 py-1 text-xs font-semibold text-rose-200">
                        Emoción
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Conversaciones más intensas y emocionales entre 11:30 p.m y 1:00 a.m,
                      cuando bajan las defensas y se hablan temas delicados.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 rounded-xl bg-slate-900/80 px-4 py-3 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-100 text-sm">Desbalance en la iniciativa</p>
                      <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-200">
                        Dinámica
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      La mayoría de los comienzos de conversación vienen de una sola persona,
                      lo que puede generar sensación de carga o poca reciprocidad.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 rounded-xl bg-slate-900/80 px-4 py-3 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-100 text-sm">Momentos de conexión profunda</p>
                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                        Fortaleza
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      Bloques de conversación largos con alta empatía, acuerdos importantes
                      y un tono mucho más vulnerable y honesto.
                    </p>
                  </div>
                </div>

                {/* Footer con mensaje de conversación */}
                <div className="mt-5 border-t border-slate-800 pt-4">
                  <div className="flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                    <span>Reporte listo en menos de 30 segundos.</span>
                    <span className="text-sm text-slate-300">
                      Después de verlo, puedes{' '}
                      <span className="text-emerald-300 font-semibold">hablar con la IA</span>{' '}
                      sobre tu relación usando el chat completo.
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-right text-slate-500">
                    Pattern Labs AI · v0.1
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECCIÓN DEL REPORTE COMPLETO */}
      {result && (
        <section
          id="conversation-report"
          className="mx-auto mt-8 max-w-5xl px-6 pb-16"
        >
          <div className="rounded-3xl border border-emerald-500/30 bg-slate-950/80 p-6 shadow-[0_0_80px_rgba(16,185,129,0.35)]">
            {/* Header */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-medium tracking-[0.22em] text-slate-400 uppercase">
                  PATTERN SCORE
                </p>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                  result.version === 'full'
                    ? 'border-emerald-400/60 bg-emerald-500/30 text-emerald-50'
                    : 'border-violet-400/60 bg-violet-500/30 text-violet-50'
                }`}>
                  {result.version === 'full' ? 'REPORTE COMPLETO' : 'REPORTE DEMO'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mb-4">
                {result.fileName} · {result.length.toLocaleString()} caracteres
              </p>

              {/* Pattern Score Card */}
              <div className="rounded-2xl bg-slate-900/90 px-4 py-3 mb-4">
                <div className="flex items-end justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 mb-1">{result.patternScore.label}</p>
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-3xl font-bold text-slate-50">
                        {result.patternScore.value.toFixed(1)}
                      </span>
                      <span className="text-xs text-slate-400">/10</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {result.patternScore.interpretation}
                    </p>
                  </div>
                </div>
              </div>

              {/* Status messages */}
              {result.truncated && (
                <p className="text-[11px] text-orange-400 flex items-start gap-1 bg-orange-500/10 rounded px-2 py-1 mb-2">
                  <span>⚠️</span>
                  <span>Chat largo: analizados los últimos {result.processedLength?.toLocaleString()} caracteres.</span>
                </p>
              )}
              {!hasAccess && (
                <p className="text-[11px] text-slate-400">
                  💡 Versión demo. Desbloquea para ver más patrones + chat con IA.
                </p>
              )}
              {hasAccess && (
                <p className="text-[11px] text-emerald-300">
                  ✅ Acceso completo · Preguntas: <strong>{credits} / 3</strong>
                </p>
              )}
            </div>

            {/* Main Patterns - UNIFIED STRUCTURE */}
            <div className="mb-4">
              <p className="mb-3 text-sm font-medium tracking-wider text-slate-400 uppercase">
                PRINCIPALES PATRONES DETECTADOS
              </p>

              <div className="space-y-3">
                {result.patterns && result.patterns.map((pattern, idx) => {
                  const categoryColors: Record<string, string> = {
                    Emoción: 'bg-rose-500/20 text-rose-200',
                    Dinámica: 'bg-amber-500/20 text-amber-200',
                    Fortaleza: 'bg-emerald-500/20 text-emerald-200',
                    Riesgo: 'bg-orange-500/20 text-orange-200',
                  };
                  const categoryColor = categoryColors[pattern.category] || categoryColors.Dinámica;

                  return (
                    <div
                      key={idx}
                      className="rounded-xl bg-slate-900/80 px-4 py-3 border border-slate-800"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-slate-100 text-sm">
                          {pattern.title}
                        </p>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${categoryColor}`}>
                          {pattern.category}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        {pattern.description}
                      </p>
                      {pattern.evidence && (
                        <blockquote className="mt-2 text-sm text-slate-500 italic border-l-2 border-emerald-500/40 pl-3">
                          "{pattern.evidence}"
                        </blockquote>
                      )}
                    </div>
                  );
                })}

                {/* Paywall MEJORADO - MÁS TENTADOR */}
                {!hasAccess && result.patterns && result.patterns.length === 3 && (
                  <div className="rounded-2xl bg-gradient-to-br from-purple-950/60 via-emerald-950/40 to-slate-950/60 px-5 py-6 border border-purple-500/40 shadow-2xl shadow-purple-500/20 relative overflow-hidden">
                    {/* Orbe de fondo */}
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/30 rounded-full blur-2xl pointer-events-none" />
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />

                    <div className="relative z-10">
                      {/* Header */}
                      <div className="text-center mb-4">
                        <div className="inline-flex items-center gap-2 mb-3 px-4 py-1.5 rounded-full bg-purple-500/20 border border-purple-500/40">
                          <svg className="w-4 h-4 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span className="text-xs font-bold text-purple-200">Esto es solo el inicio</span>
                        </div>
                        <h4 className="text-xl font-extrabold text-white mb-2">
                          ¿Viste el demo? Ahora imagina esto...
                        </h4>
                        <p className="text-sm text-slate-300 max-w-md mx-auto">
                          +5 patrones más + <span className="font-bold text-purple-300">HABLAR CON LA IA</span> sobre lo que quieras saber
                        </p>
                      </div>

                      {/* Lo que obtienes */}
                      <div className="mb-5 space-y-3 bg-slate-900/60 rounded-xl p-4 border border-slate-700/50">
                        <div className="flex items-start gap-2.5">
                          <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <p className="text-sm font-bold text-white">Análisis completo (8 patrones)</p>
                            <p className="text-xs text-slate-400">Con evidencia citada directamente de tu chat</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <svg className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <p className="text-sm font-bold text-white">3 preguntas a la IA</p>
                            <p className="text-xs text-slate-400">La IA tiene TODO el contexto de tu conversación</p>
                          </div>
                        </div>
                      </div>

                      {/* Ejemplos de preguntas - EL DIFERENCIADOR */}
                      <div className="mb-5 rounded-xl bg-gradient-to-br from-purple-950/60 to-slate-900/60 p-4 border border-purple-500/30">
                        <p className="text-sm font-bold text-purple-300 mb-3 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                          Preguntas que podrás hacerle a la IA:
                        </p>
                        <div className="space-y-2.5">
                          <div className="flex items-start gap-2 text-sm text-slate-200 bg-slate-800/70 rounded-lg px-3 py-2.5 border border-purple-500/20 hover:border-purple-500/40 transition-colors">
                            <span className="text-purple-400 font-bold">→</span>
                            <span><strong className="text-white">"¿Quién está más enganchado?"</strong></span>
                          </div>
                          <div className="flex items-start gap-2 text-sm text-slate-200 bg-slate-800/70 rounded-lg px-3 py-2.5 border border-purple-500/20 hover:border-purple-500/40 transition-colors">
                            <span className="text-purple-400 font-bold">→</span>
                            <span><strong className="text-white">"¿A qué hora está de mejor humor?"</strong></span>
                          </div>
                          <div className="flex items-start gap-2 text-sm text-slate-200 bg-slate-800/70 rounded-lg px-3 py-2.5 border border-purple-500/20 hover:border-purple-500/40 transition-colors">
                            <span className="text-purple-400 font-bold">→</span>
                            <span><strong className="text-white">"¿Qué debería cambiar yo específicamente?"</strong></span>
                          </div>
                          <div className="flex items-start gap-2 text-sm text-slate-200 bg-slate-800/70 rounded-lg px-3 py-2.5 border border-purple-500/20 hover:border-purple-500/40 transition-colors">
                            <span className="text-purple-400 font-bold">→</span>
                            <span><strong className="text-white">"¿Cuándo fue el momento más tenso?"</strong></span>
                          </div>
                          <div className="flex items-start gap-2 text-sm text-slate-200 bg-slate-800/70 rounded-lg px-3 py-2.5 border border-purple-500/20 hover:border-purple-500/40 transition-colors">
                            <span className="text-purple-400 font-bold">→</span>
                            <span><strong className="text-white">"¿Esta relación tiene futuro real?"</strong></span>
                          </div>
                        </div>
                        <div className="mt-3 p-3 rounded-lg bg-purple-950/50 border border-purple-500/30">
                          <p className="text-xs text-center text-purple-200 font-semibold">
                            La IA tiene TODO el contexto de tu chat 🤯
                          </p>
                          <p className="text-xs text-center text-slate-400 mt-1">
                            Responde basándose en tus mensajes reales, no en consejos genéricos
                          </p>
                        </div>
                      </div>

                      {/* CTA Button */}
                      <button
                        onClick={handleCheckoutSingle}
                        disabled={isPaying}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-purple-500 px-5 py-4 text-base font-extrabold text-white hover:shadow-2xl hover:shadow-purple-500/60 hover:scale-[1.03] active:scale-[0.97] transition-all duration-300 shadow-xl shadow-purple-500/40 disabled:opacity-60 relative overflow-hidden group"
                      >
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                        <svg className="w-5 h-5 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <span className="relative z-10">{isPaying ? 'Redirigiendo a pago...' : 'Desbloquear por MX$49'}</span>
                      </button>
                      <p className="text-center text-[10px] text-slate-500 mt-3">
                        Pago único · Sin suscripciones · Stripe seguro · <span className="text-emerald-400 font-semibold">Acceso inmediato</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* TL;DR - PAID ONLY */}
            {result.tlDr && result.tlDr.length > 0 && (
              <div className="mb-4 rounded-xl bg-slate-900/80 p-3 border border-emerald-500/20">
                <p className="mb-2 text-xs font-semibold text-emerald-300">
                  💡 TL;DR
                </p>
                <ul className="list-disc space-y-1 pl-4 text-xs text-slate-300">
                  {result.tlDr.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Deep Sections - PAID ONLY */}
            {result.sections && result.sections.length > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-[11px] font-medium tracking-[0.22em] text-slate-400 uppercase">
                  ANÁLISIS PROFUNDO
                </p>
                {result.sections.map((section) => {
                  const isOpen = openSectionId === section.id;
                  return (
                    <div
                      key={section.id}
                      className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSection(section.id)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-100 hover:bg-slate-900/80"
                      >
                        <span>{section.title}</span>
                        <span className="text-[10px] text-slate-400">
                          {isOpen ? '−' : '+'}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="border-t border-slate-800 px-3 py-3 text-xs text-slate-300 whitespace-pre-wrap">
                          {section.body}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Chat sobre el reporte */}
            <div className="mt-5 border-t border-slate-800 pt-4">
              <ChatBox
                analysis={result.rawAnalysis ?? ''}
                fullChat={result.fullChat ?? ''}
                hasAccess={hasAccess}
                credits={credits}
                onConsumeCredit={consumeCredit}
                onUnlockClick={handleCheckoutSingle}
              />
            </div>
          </div>
        </section>
      )}

      {/* Divider luminoso */}
      <div className="h-px w-full bg-gradient-to-r from-fuchsia-500/40 via-purple-500/40 to-cyan-300/40" />

      {/* Sección: La diferencia - Preguntas a la IA - MEJORADA */}
      <section className="mx-auto mt-16 max-w-6xl px-6">
        <div className="rounded-3xl border border-purple-500/40 bg-gradient-to-br from-purple-950/40 via-slate-900/60 to-slate-950/80 p-8 md:p-12 shadow-[0_0_80px_rgba(168,85,247,0.4)] relative overflow-hidden">
          {/* Orbes */}
          <div className="absolute -top-20 -left-20 w-[400px] h-[400px] bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -right-20 w-[350px] h-[350px] bg-fuchsia-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            {/* Header */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-purple-500/20 to-fuchsia-500/20 border border-purple-500/40 mb-5">
                <svg className="w-5 h-5 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <span className="text-sm font-bold text-purple-200">Lo que otros NO tienen</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-extrabold mb-4">
                Después del reporte,{' '}
                <span className="bg-gradient-to-r from-purple-200 via-fuchsia-200 to-purple-200 bg-clip-text text-transparent">
                  pregúntale lo que quieras
                </span>
              </h2>
              <p className="text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
                La IA lee <span className="font-bold text-purple-300">TODO tu chat</span> y responde preguntas específicas sobre tu relación.
                No son respuestas genéricas, <span className="font-bold text-white">son sobre TI</span>.
              </p>
            </div>

            {/* Preguntas en Grid */}
            <div className="grid md:grid-cols-2 gap-4 mb-10">
              {[
                { q: "¿Quién está más enganchado?", tag: "Popular" },
                { q: "¿Qué debería cambiar yo específicamente?", tag: "Accionable" },
                { q: "¿Esta relación tiene futuro?", tag: "Importante" },
                { q: "¿Qué patrones se repiten cuando hay conflicto?", tag: "Insight" },
                { q: "¿Hay manipulación emocional en el chat?", tag: "Red flag" },
                { q: "¿Qué hace que la conexión sea más fuerte?", tag: "Positivo" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="group relative flex items-start gap-3 rounded-xl bg-slate-900/60 border border-slate-700/50 p-4 hover:border-purple-500/50 hover:bg-slate-800/60 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-fuchsia-500/20 border border-purple-500/30 flex items-center justify-center">
                    <span className="text-purple-300 font-bold text-sm">{idx + 1}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-100 mb-1">{item.q}</p>
                    <span className="inline-block px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-[10px] font-semibold text-purple-300">
                      {item.tag}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA final */}
            <div className="text-center rounded-2xl bg-gradient-to-r from-purple-950/60 to-fuchsia-950/60 border border-purple-500/40 p-8">
              <p className="text-2xl md:text-3xl font-bold text-white mb-3">
                Todo esto por <span className="text-purple-300">MX$49</span>
              </p>
              <p className="text-slate-300 mb-5 max-w-md mx-auto">
                Reporte completo + <strong className="text-white">3 preguntas a la IA</strong> que conoce TODO tu chat
              </p>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 px-8 py-3.5 text-base font-bold text-white shadow-2xl shadow-purple-500/40 hover:shadow-purple-500/60 hover:scale-105 active:scale-95 transition-all duration-300"
              >
                <span>Empezar gratis ahora</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
              <p className="text-xs text-slate-500 mt-3">Demo gratis • Paga solo si quieres las preguntas a la IA</p>
            </div>
          </div>
        </div>
      </section>

      {/* Divider luminoso */}
      <div className="h-px w-full bg-gradient-to-r from-fuchsia-500/40 via-purple-500/40 to-cyan-300/40 mt-16" />

      {/* SECCIÓN ESTRELLA: EL PODER DE HABLAR CON LA IA */}
      <section id="ai-chat-feature" className="mx-auto mt-16 max-w-7xl px-6 pb-16">
        <div className="relative rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-slate-900/60 to-slate-950/80 p-8 md:p-12 shadow-[0_0_100px_rgba(168,85,247,0.3)] overflow-hidden">
          {/* Orbes de fondo MUY visible */}
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-purple-500/20 rounded-full blur-3xl pointer-events-none animate-pulse-glow" />
          <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-fuchsia-500/20 rounded-full blur-3xl pointer-events-none animate-pulse-glow" style={{animationDelay: '1.5s'}} />

          <div className="relative z-10">
            {/* Header */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-500/20 to-fuchsia-500/20 border border-purple-500/40 mb-6 backdrop-blur-sm">
                <svg className="w-5 h-5 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm font-bold text-purple-200">Nuestro diferenciador</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-extrabold mb-6 bg-gradient-to-r from-purple-200 via-fuchsia-200 to-purple-200 bg-clip-text text-transparent">
                No es solo un análisis estático.
                <br />
                Es una conversación con IA.
              </h2>
              <p className="text-lg md:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
                Otras apps te dan un PDF y ya. Nosotros te dejamos <span className="font-bold text-purple-300">PREGUNTARLE A LA IA</span> lo que quieras sobre tu relación.
              </p>
            </div>

            {/* Comparación: Otros vs. Nosotros */}
            <div className="grid md:grid-cols-2 gap-8 mb-12">
              {/* Otros servicios */}
              <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                    <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-300">Otros servicios</h3>
                </div>
                <ul className="space-y-3 text-sm text-slate-400">
                  <li className="flex items-start gap-2">
                    <span className="text-slate-600">→</span>
                    <span>Te dan un análisis genérico</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-600">→</span>
                    <span>No puedes hacer preguntas específicas</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-600">→</span>
                    <span>Si tienes dudas... estás solo</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-slate-600">→</span>
                    <span>Un PDF estático y listo</span>
                  </li>
                </ul>
              </div>

              {/* Pattern Labs AI */}
              <div className="rounded-2xl border border-purple-500/40 bg-gradient-to-br from-purple-950/60 to-fuchsia-950/40 p-6 shadow-lg shadow-purple-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-purple-200">Pattern Labs AI</h3>
                </div>
                <ul className="space-y-3 text-sm text-purple-100">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">✓</span>
                    <span><strong className="text-white">Análisis personalizado</strong> de tu chat</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">✓</span>
                    <span><strong className="text-white">Pregúntale lo que quieras</strong> a la IA</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">✓</span>
                    <span>La IA tiene <strong className="text-white">TODO el contexto</strong> de tu chat</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">✓</span>
                    <span><strong className="text-white">3 preguntas incluidas</strong> por MX$49</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Preview de conversación */}
            <div className="rounded-2xl border border-purple-500/30 bg-slate-900/60 p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-lg font-bold text-purple-200">Ejemplo de conversación real</h4>
                  <p className="text-sm text-slate-400">Así puedes hablar con la IA sobre tu relación</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Pregunta 1 */}
                <div className="flex justify-end">
                  <div className="max-w-md rounded-2xl rounded-tr-sm bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-3 shadow-lg">
                    <p className="text-sm font-medium text-slate-950">
                      "¿Quién está más enganchado en esta relación?"
                    </p>
                  </div>
                </div>
                {/* Respuesta IA 1 */}
                <div className="flex justify-start">
                  <div className="max-w-lg rounded-2xl rounded-tl-sm bg-gradient-to-br from-purple-950/80 via-slate-800 to-slate-900 border-2 border-purple-500/50 px-5 py-4 shadow-xl shadow-purple-500/20">
                    <div className="space-y-3">
                      <p className="text-sm text-slate-300">
                        Basado en el análisis:
                      </p>
                      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/50 shadow-lg shadow-red-500/10">
                        <span className="text-2xl font-black text-white">73%</span>
                        <span className="text-sm font-bold text-red-200">más invertido/a</span>
                      </div>
                      <ul className="space-y-2 text-sm text-slate-200">
                        <li className="flex items-start gap-2">
                          <span className="text-purple-400 text-lg">•</span>
                          <span>Inicias el <strong className="text-white font-bold">84%</strong> de las conversaciones</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-purple-400 text-lg">•</span>
                          <span>Tus mensajes son <strong className="text-white font-bold">3x más largos</strong></span>
                        </li>
                      </ul>
                      <div className="pt-2 border-t border-slate-700/50">
                        <p className="text-xs text-slate-300 italic flex items-start gap-2">
                          <span className="text-yellow-400">⚠️</span>
                          <span>Esto sugiere un <strong className="text-yellow-300">desequilibrio emocional</strong> que podría afectar la dinámica a largo plazo.</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pregunta 2 */}
                <div className="flex justify-end">
                  <div className="max-w-md rounded-2xl rounded-tr-sm bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-3 shadow-lg">
                    <p className="text-sm font-medium text-slate-950">
                      "¿Qué debería cambiar yo específicamente?"
                    </p>
                  </div>
                </div>
                {/* Respuesta IA 2 */}
                <div className="flex justify-start">
                  <div className="max-w-lg rounded-2xl rounded-tl-sm bg-gradient-to-br from-purple-950/80 via-slate-800 to-slate-900 border-2 border-purple-500/50 px-5 py-4 shadow-xl shadow-purple-500/20">
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-purple-200 mb-3">
                        💡 Recomendaciones personalizadas:
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-start gap-3 bg-slate-900/60 rounded-lg p-3 border border-emerald-500/30">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center">
                            <span className="text-emerald-300 font-bold text-sm">1</span>
                          </div>
                          <div>
                            <p className="text-sm text-slate-200"><strong className="text-white font-bold">Espera a que él/ella inicie</strong> algunas conversaciones</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 bg-slate-900/60 rounded-lg p-3 border border-emerald-500/30">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center">
                            <span className="text-emerald-300 font-bold text-sm">2</span>
                          </div>
                          <div>
                            <p className="text-sm text-slate-200"><strong className="text-white font-bold">Mensajes más cortos</strong> para ver si hay reciprocidad</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 bg-slate-900/60 rounded-lg p-3 border border-emerald-500/30">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center">
                            <span className="text-emerald-300 font-bold text-sm">3</span>
                          </div>
                          <div>
                            <p className="text-sm text-slate-200"><strong className="text-white font-bold">Observa</strong> si el interés sube cuando tú bajas tu intensidad</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pregunta 3 */}
                <div className="flex justify-end">
                  <div className="max-w-md rounded-2xl rounded-tr-sm bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-3 shadow-lg">
                    <p className="text-sm font-medium text-slate-950">
                      "¿Esta relación tiene futuro?"
                    </p>
                  </div>
                </div>
                {/* Respuesta IA 3 - con typing indicator */}
                <div className="flex justify-start">
                  <div className="max-w-lg rounded-2xl rounded-tl-sm bg-gradient-to-br from-purple-950/80 via-slate-800 to-slate-900 border-2 border-purple-500/50 px-5 py-4 shadow-xl shadow-purple-500/20">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-yellow-400 text-xl">⚠️</span>
                        <p className="text-sm font-semibold text-yellow-300">
                          Análisis de futuro
                        </p>
                      </div>
                      <p className="text-sm text-slate-200 leading-relaxed">
                        Los patrones actuales muestran <strong className="text-yellow-300 font-bold">señales de alerta</strong>, pero no son definitivos.
                      </p>
                      <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pattern Score</span>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-black text-red-400">23</span>
                            <span className="text-sm text-slate-500">/100</span>
                          </div>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-red-500 to-orange-500" style={{ width: '23%' }}></div>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-700/50">
                        <p className="text-sm text-slate-200 flex items-start gap-2">
                          <span className="text-emerald-400 text-lg">✓</span>
                          <span><strong className="text-white font-bold">Puede mejorar</strong> si ambos se comprometen a balancear la comunicación...</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Final */}
            <div className="mt-12 text-center">
              <p className="text-2xl md:text-3xl font-bold text-white mb-4">
                ¿Ves el poder? Imagina tener esto con TU chat.
              </p>
              <p className="text-slate-300 mb-6 text-lg">
                Por solo <span className="text-2xl font-bold text-purple-300">MX$49</span> obtienes el análisis completo + 3 preguntas a la IA
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 px-8 py-4 text-lg font-bold text-white shadow-2xl shadow-purple-500/40 hover:shadow-purple-500/60 hover:scale-105 active:scale-95 transition-all duration-300"
                >
                  <span>Probar demo gratis</span>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={handleCheckoutSingle}
                  disabled={isPaying}
                  className="inline-flex items-center gap-2 rounded-full border-2 border-emerald-500 bg-emerald-500/10 px-8 py-4 text-lg font-bold text-emerald-300 hover:bg-emerald-500/20 hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-60"
                >
                  <span>{isPaying ? 'Redirigiendo...' : 'Comprar acceso MX$49'}</span>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-4">Demo gratis • Sin suscripciones • Pago único</p>
            </div>
          </div>
        </div>
      </section>

      {/* Sección: cómo funciona Pattern Labs AI - DISEÑO PREMIUM */}
      <section
        id="how-it-works"
        className="mx-auto mt-10 max-w-6xl px-6 pb-16"
      >
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 md:p-12 shadow-[0_0_60px_rgba(15,23,42,0.9)] relative overflow-hidden">
          {/* Orbes de fondo */}
          <div className="absolute -top-20 -right-20 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-[350px] h-[350px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            {/* Header */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4">
                <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm font-semibold text-purple-300">Simple y poderoso</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                ¿Cómo funciona Pattern Labs AI?
              </h2>
              <p className="max-w-2xl mx-auto text-slate-300">
                En menos de un minuto pasas de un archivo .txt lleno de mensajes a un reporte claro,
                accionable y conversable.
              </p>
            </div>

            {/* Flow Steps */}
            <div className="grid md:grid-cols-3 gap-6">
              {/* Step 1 */}
              <div className="group relative">
                <div className="rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/60 to-slate-900/60 p-6 hover:border-emerald-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10 h-full">
                  {/* Icon Circle */}
                  <div className="mb-5 inline-flex">
                    <div className="relative">
                      <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl blur-xl" />
                      <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="mb-2">
                    <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-300 text-xs font-semibold border border-emerald-500/20">
                      Paso 1
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-slate-100 mb-3">
                    Sube tu chat en .txt
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Exportas tu conversación de WhatsApp sin archivos multimedia y subes el .txt de
                    forma <span className="text-emerald-300 font-semibold">100% privada</span>. No usamos tus datos para entrenar modelos.
                  </p>
                </div>

                {/* Arrow connector (desktop) */}
                <div className="hidden md:block absolute top-1/2 -right-3 -translate-y-1/2 z-10">
                  <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>

              {/* Step 2 */}
              <div className="group relative">
                <div className="rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/60 to-slate-900/60 p-6 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10 h-full">
                  {/* Icon Circle */}
                  <div className="mb-5 inline-flex">
                    <div className="relative">
                      <div className="absolute inset-0 bg-purple-500/20 rounded-2xl blur-xl" />
                      <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="mb-2">
                    <span className="inline-block px-3 py-1 rounded-full bg-purple-500/10 text-purple-300 text-xs font-semibold border border-purple-500/20">
                      Paso 2
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-slate-100 mb-3">
                    IA genera tu Pattern Score
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Analizamos patrones emocionales, quién inicia más, cómo evolucionan las
                    conversaciones y te mostramos un <span className="text-purple-300 font-semibold">resumen claro</span> con fortalezas y riesgos.
                  </p>
                </div>

                {/* Arrow connector (desktop) */}
                <div className="hidden md:block absolute top-1/2 -right-3 -translate-y-1/2 z-10">
                  <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>

              {/* Step 3 */}
              <div className="group relative">
                <div className="rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/60 to-slate-900/60 p-6 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10 h-full">
                  {/* Icon Circle */}
                  <div className="mb-5 inline-flex">
                    <div className="relative">
                      <div className="absolute inset-0 bg-cyan-500/20 rounded-2xl blur-xl" />
                      <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="mb-2">
                    <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 text-xs font-semibold border border-cyan-500/20">
                      Paso 3
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-slate-100 mb-3">
                    Chatea con la IA
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Pregúntale lo que quieras: quién se engancha más, qué podrías mejorar tú,
                    qué dinámicas se repiten. El contexto es <span className="text-cyan-300 font-semibold">tu chat completo</span>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sección: privacidad - DISEÑO PREMIUM CON SEGURIDAD */}
      <section
        id="privacy"
        className="mx-auto mb-10 max-w-6xl px-6"
      >
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 md:p-12 shadow-[0_0_60px_rgba(15,23,42,0.9)] relative overflow-hidden">
          {/* Orbes de fondo */}
          <div className="absolute top-0 left-0 w-[350px] h-[350px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            {/* Header */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="text-sm font-semibold text-emerald-300">Seguridad garantizada</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Privacidad y seguridad de tu chat
              </h2>
              <p className="max-w-2xl mx-auto text-slate-300">
                Sabemos que tus conversaciones son súper sensibles. Pattern Labs AI está diseñado para
                que tengas claridad <span className="text-emerald-300 font-semibold">sin sacrificar privacidad</span>.
              </p>
            </div>

            {/* Cards de Seguridad */}
            <div className="grid md:grid-cols-3 gap-6">
              {/* Privacy Card 1 */}
              <div className="group relative rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/60 to-slate-900/60 p-6 hover:border-emerald-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10">
                {/* Icon */}
                <div className="mb-5 inline-flex">
                  <div className="relative">
                    <div className="absolute inset-0 bg-emerald-500/20 rounded-xl blur-lg" />
                    <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
                      <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-slate-100 mb-3">
                  Tu archivo es sólo tuyo
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Usamos tu archivo únicamente para generar tu reporte. <span className="text-emerald-300 font-semibold">No vendemos</span> ni compartimos tus
                  chats con terceros. Nunca.
                </p>

                {/* Check badge */}
                <div className="mt-4 inline-flex items-center gap-2 text-xs text-emerald-400 font-medium">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>0 datos compartidos</span>
                </div>
              </div>

              {/* Privacy Card 2 */}
              <div className="group relative rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/60 to-slate-900/60 p-6 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10">
                {/* Icon */}
                <div className="mb-5 inline-flex">
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-500/20 rounded-xl blur-lg" />
                    <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 border border-cyan-500/30 flex items-center justify-center">
                      <svg className="w-7 h-7 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-slate-100 mb-3">
                  Análisis en tiempo real
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  El procesamiento se hace en el momento. Puedes cerrar la página cuando termines y
                  <span className="text-cyan-300 font-semibold"> nadie más verá</span> tu reporte.
                </p>

                {/* Check badge */}
                <div className="mt-4 inline-flex items-center gap-2 text-xs text-cyan-400 font-medium">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Sesión privada</span>
                </div>
              </div>

              {/* Privacy Card 3 */}
              <div className="group relative rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/60 to-slate-900/60 p-6 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10">
                {/* Icon */}
                <div className="mb-5 inline-flex">
                  <div className="relative">
                    <div className="absolute inset-0 bg-purple-500/20 rounded-xl blur-lg" />
                    <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30 flex items-center justify-center">
                      <svg className="w-7 h-7 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-slate-100 mb-3">
                  Control total
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Tú decides qué chat subir, cuándo analizarlo y qué hacer con la información. Pattern
                  Labs AI es una herramienta <span className="text-purple-300 font-semibold">para entender</span>, no para juzgar.
                </p>

                {/* Check badge */}
                <div className="mt-4 inline-flex items-center gap-2 text-xs text-purple-400 font-medium">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Tú tienes el control</span>
                </div>
              </div>
            </div>

            {/* Nota de confianza */}
            <div className="mt-8 p-6 rounded-2xl bg-gradient-to-br from-emerald-950/40 to-slate-900/40 border border-emerald-500/30">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="text-base font-bold text-slate-100 mb-2">
                    Compromiso de privacidad
                  </h4>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    No almacenamos tus chats en nuestros servidores. No usamos tus conversaciones para entrenar modelos de IA.
                    Tu privacidad es <span className="text-emerald-300 font-semibold">no negociable</span>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sección: cómo exportar chat - DISEÑO PREMIUM CON VISUAL STEPS */}
      <section
        id="export-guide"
        className="mx-auto mb-16 max-w-6xl px-6"
      >
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 md:p-12 shadow-[0_0_60px_rgba(15,23,42,0.9)] relative overflow-hidden">
          {/* Orbes de fondo sutiles */}
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            {/* Header */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <span className="text-sm font-semibold text-emerald-300">Guía paso a paso</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                ¿Cómo exportar tu chat de WhatsApp?
              </h2>
              <p className="max-w-2xl mx-auto text-slate-300">
                Si nunca has exportado una conversación, aquí tienes la guía visual para obtener tu
                archivo <span className="font-semibold text-emerald-300">.txt</span> en menos de 2 minutos:
              </p>
            </div>

            {/* Steps Grid */}
            <div className="grid md:grid-cols-2 gap-6 mt-8">
              {/* Step 1 */}
              <div className="group relative rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/40 to-slate-900/40 p-6 hover:border-emerald-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-bold text-lg shadow-lg shadow-emerald-500/30">
                      1
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-100 mb-2">Abre tu chat</h3>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      Abre WhatsApp y entra a la conversación que quieres analizar.
                    </p>
                    {/* Placeholder para screenshot */}
                    <div className="mt-4 rounded-xl bg-slate-950/60 border border-slate-700/50 p-4 flex items-center justify-center h-32 group-hover:border-emerald-500/30 transition-colors">
                      <svg className="w-12 h-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="group relative rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/40 to-slate-900/40 p-6 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 text-white font-bold text-lg shadow-lg shadow-cyan-500/30">
                      2
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-100 mb-2">Abre el menú</h3>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      Toca el nombre del contacto o grupo en la parte superior para abrir la info del chat.
                    </p>
                    {/* Placeholder para screenshot */}
                    <div className="mt-4 rounded-xl bg-slate-950/60 border border-slate-700/50 p-4 flex items-center justify-center h-32 group-hover:border-cyan-500/30 transition-colors">
                      <svg className="w-12 h-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="group relative rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/40 to-slate-900/40 p-6 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 text-white font-bold text-lg shadow-lg shadow-purple-500/30">
                      3
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-100 mb-2">Exportar chat</h3>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      Desplázate hacia abajo y busca la opción <span className="font-semibold text-purple-300">"Exportar chat"</span>.
                    </p>
                    {/* Placeholder para screenshot */}
                    <div className="mt-4 rounded-xl bg-slate-950/60 border border-slate-700/50 p-4 flex items-center justify-center h-32 group-hover:border-purple-500/30 transition-colors">
                      <svg className="w-12 h-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="group relative rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/40 to-slate-900/40 p-6 hover:border-emerald-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-bold text-lg shadow-lg shadow-emerald-500/30">
                      4
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-100 mb-2">Sin archivos</h3>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      Selecciona <span className="font-semibold text-emerald-300">"Sin archivos"</span> para exportar solo los mensajes (sin fotos/videos).
                    </p>
                    {/* Placeholder para screenshot */}
                    <div className="mt-4 rounded-xl bg-slate-950/60 border border-slate-700/50 p-4 flex items-center justify-center h-32 group-hover:border-emerald-500/30 transition-colors">
                      <svg className="w-12 h-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div className="group relative rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/40 to-slate-900/40 p-6 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 text-white font-bold text-lg shadow-lg shadow-cyan-500/30">
                      5
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-100 mb-2">Guarda el archivo</h3>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      Guarda el archivo <span className="font-mono text-cyan-300">.txt</span> en tu dispositivo (computadora, iCloud, Google Drive, etc.).
                    </p>
                    {/* Placeholder para screenshot */}
                    <div className="mt-4 rounded-xl bg-slate-950/60 border border-slate-700/50 p-4 flex items-center justify-center h-32 group-hover:border-cyan-500/30 transition-colors">
                      <svg className="w-12 h-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 6 - CTA Final */}
              <div className="group relative rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-slate-900/40 p-6 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all duration-300">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-bold text-lg shadow-lg shadow-emerald-500/40">
                      ✓
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-emerald-300 mb-2">¡Listo para analizar!</h3>
                    <p className="text-sm text-slate-300 leading-relaxed mb-4">
                      Vuelve arriba, sube tu archivo en <span className="font-semibold">"Generar reporte"</span> y obtén tu análisis en segundos.
                    </p>
                    <button
                      type="button"
                      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors group"
                    >
                      <span>Ir al inicio</span>
                      <svg className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Nota final */}
            <div className="mt-8 p-4 rounded-xl bg-slate-800/40 border border-slate-700/50">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-slate-300">
                  <span className="font-semibold text-slate-100">Tip:</span> El archivo exportado puede tener varios MB dependiendo del tamaño del chat. Esto es normal y no afecta el análisis.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer simple */}
      <footer className="border-t border-slate-900/80 bg-slate-950/90">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-4 text-[11px] text-slate-500 sm:flex-row">
          <span>© 2025 Pattern Labs AI. All rights reserved.</span>
          <div className="flex gap-4">
            <button
              className="hover:text-slate-300"
              onClick={() => {
                const el = document.getElementById('privacy');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Privacidad
            </button>
            <button
              className="hover:text-slate-300"
              onClick={() => {
                const el = document.getElementById('how-it-works');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Cómo funciona
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}

/**
 * ChatBox: barra para conversar sobre el análisis + respuesta larga
 */
type ChatMessage = {
  question: string;
  answer: string;
};

function ChatBox({
  analysis,
  fullChat,
  hasAccess,
  credits,
  onConsumeCredit,
  onUnlockClick,
}: {
  analysis: string;
  fullChat: string;
  hasAccess: boolean;
  credits: number;
  onConsumeCredit: () => void;
  onUnlockClick: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Log para debug
  console.log('🎯 ChatBox render - hasAccess:', hasAccess, 'credits:', credits, 'historial:', chatHistory.length);

  const handleAsk = async () => {
    if (!question.trim()) return;

    if (!hasAccess) {
      setError(
        'Para hacerle preguntas a la IA primero desbloquea tu análisis completo 🧠'
      );
      return;
    }

    if (credits <= 0) {
      setError(
        'Ya utilizaste tus 3 preguntas incluidas. Muy pronto podrás comprar más preguntas para seguir explorando tu chat. 🙌'
      );
      return;
    }

    const currentQuestion = question.trim();

    try {
      setLoading(true);
      setError(null);
      setQuestion(''); // Limpiar pregunta inmediatamente

      console.log('📤 Enviando pregunta:', currentQuestion);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store', // Evitar cache
        body: JSON.stringify({
          analysis,
          fullChat,
          question: currentQuestion,
        }),
      });

      const data = await res.json();
      console.log('📥 Respuesta recibida:', data.answer?.slice(0, 100));

      if (!res.ok) {
        setError(data.error || 'Ocurrió un error al responder tu pregunta.');
        setQuestion(currentQuestion); // Restaurar pregunta si hay error
        return;
      }

      // Agregar al historial con la respuesta nueva
      const newMessage = {
        question: currentQuestion,
        answer: data.answer || 'Sin respuesta'
      };
      console.log('💾 Agregando al historial:', newMessage.question);
      setChatHistory(prevHistory => [...prevHistory, newMessage]);
      onConsumeCredit();
    } catch (err) {
      console.error('❌ Error en chat:', err);
      setError('Error de red o del servidor al responder tu pregunta.');
      setQuestion(currentQuestion); // Restaurar pregunta si hay error
    } finally {
      setLoading(false);
    }
  };

  // Si no tiene acceso, mostrar paywall llamativo
  if (!hasAccess) {
    return (
      <div className="rounded-xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 border border-emerald-500/40 shadow-xl">
        <div>
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40">
              <svg className="w-3.5 h-3.5 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-xs font-semibold text-emerald-300">¿Te gustó el demo?</span>
            </div>
            <h3 className="text-xl font-bold text-slate-100 mb-2 leading-tight">
              Desbloquea el análisis completo + chat con IA
            </h3>
            <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
              Pregúntale cualquier cosa a la IA sobre tu relación usando el contexto completo del chat
            </p>
          </div>

          {/* What you get */}
          <div className="space-y-3 mb-5 bg-slate-900/80 rounded-xl p-4 border border-slate-800">
            <p className="text-sm font-semibold text-emerald-300 mb-3">Con MX$49 obtienes:</p>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100 mb-0.5">Chat con IA</p>
                <p className="text-xs text-slate-400">
                  3 preguntas sobre tu relación con respuestas personalizadas
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100 mb-0.5">Análisis profundo</p>
                <p className="text-xs text-slate-400">
                  Todos los patrones, evidencia citada y secciones desbloqueadas
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100 mb-0.5">Pago único</p>
                <p className="text-xs text-slate-400">
                  No suscripciones, no cargos ocultos
                </p>
              </div>
            </div>
          </div>

          {/* Example questions preview */}
          <div className="mb-5">
            <p className="text-xs font-medium text-slate-400 mb-2.5">Ejemplos de preguntas que podrás hacer:</p>
            <div className="space-y-2">
              {[
                "¿Quién está más enganchado en esta relación?",
                "¿Qué patrones se repiten cuando hay conflicto?",
                "¿Qué debería cambiar yo específicamente?",
              ].map((q, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300 bg-slate-900/40 rounded-lg px-3 py-2 border border-slate-800/50">
                  <span className="text-emerald-400 font-bold">→</span>
                  <span>{q}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA button */}
          <button
            type="button"
            onClick={onUnlockClick}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-3.5 text-base font-bold text-slate-950 hover:shadow-xl hover:shadow-emerald-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-lg shadow-emerald-500/30 mb-2 relative overflow-hidden group"
          >
            {/* Efecto shimmer animado */}
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            <svg className="w-5 h-5 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
            <span className="relative z-10">Desbloquear por MX$49</span>
          </button>

          <p className="text-center text-xs text-slate-500">
            Pago único · Sin suscripciones · 100% seguro con Stripe
          </p>
        </div>
      </div>
    );
  }

  // Si tiene acceso pero NO tiene créditos, mostrar mensaje especial
  if (credits <= 0) {
    return (
      <div className="rounded-xl bg-slate-950/70 p-4 border border-amber-500/30">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40">
            <span className="text-amber-300 text-lg">🎉</span>
            <span className="text-xs font-semibold text-amber-300">Análisis desbloqueado</span>
          </div>
          <h3 className="text-lg font-bold text-slate-100 mb-2">
            ¡Usaste tus 3 preguntas!
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Gracias por usar Pattern Labs AI. Muy pronto podrás comprar más preguntas.
          </p>
          {chatHistory.length > 0 && (
            <div className="mt-4 space-y-4 text-left">
              <p className="text-xs font-semibold text-slate-400">Tu historial:</p>
              {chatHistory.map((msg, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-emerald-500 to-cyan-500 px-3 py-2 shadow-md">
                      <p className="text-xs font-medium text-slate-950">{msg.question}</p>
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[95%] rounded-2xl rounded-tl-sm bg-slate-900/80 border border-slate-700 px-3 py-2">
                      <p className="text-xs text-slate-100 whitespace-pre-wrap leading-relaxed">{msg.answer}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Si tiene acceso Y tiene créditos, mostrar el chat funcional
  return (
    <div className="rounded-xl bg-slate-950/70 p-4 border border-emerald-500/30">
      <p className="mb-2 text-sm font-semibold text-emerald-300">
        💬 Hazle preguntas a tu reporte
      </p>
      <p className="mb-3 text-sm text-slate-400">
        Ejemplos: "¿Quién está más enganchado?", "¿Qué tan sana ves esta relación?", "¿Qué puedo
        trabajar yo para mejorar esto?"
      </p>

      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-emerald-300">Preguntas disponibles:</span>
        <div className="flex gap-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                i <= credits
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-700 text-slate-500'
              }`}
            >
              {i}
            </div>
          ))}
        </div>
      </div>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={2}
        className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        placeholder="Escribe tu pregunta aquí…"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleAsk}
          disabled={loading || !question.trim() || credits <= 0}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Analizando…' : 'Preguntar a la IA'}
        </button>
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>

      {/* Historial de preguntas y respuestas */}
      {chatHistory.length > 0 && (
        <div className="mt-4 space-y-4">
          {chatHistory.map((msg, idx) => (
            <div key={idx} className="space-y-2">
              {/* Pregunta del usuario */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-emerald-500 to-cyan-500 px-3 py-2 shadow-md">
                  <p className="text-xs font-medium text-slate-950">{msg.question}</p>
                </div>
              </div>
              {/* Respuesta de la IA */}
              <div className="flex justify-start">
                <div className="max-w-[95%] rounded-2xl rounded-tl-sm bg-slate-900/80 border border-slate-700 px-3 py-2">
                  <p className="text-xs text-slate-100 whitespace-pre-wrap leading-relaxed">{msg.answer}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Indicador de carga */}
      {loading && (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>La IA está analizando tu pregunta...</span>
        </div>
      )}
    </div>
  );
}
