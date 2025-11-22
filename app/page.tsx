'use client';

import React, { useState, useRef, useEffect } from 'react';

/** Tipos del reporte */
type ReportBadge = {
  label: string;
  level: 'low' | 'medium' | 'high';
  emoji: string;
};

type ReportSection = {
  id: string;
  title: string;
  body: string;
};

type AnalyzeResult = {
  ok: boolean;
  fileName: string;
  length: number;
  score: number | null;
  tlDr: string[];
  strengths: string[];
  risks: string[];
  badges: ReportBadge[];
  sections: ReportSection[];
  rawAnalysis: string;
  fullChat: string;
};

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [openSectionId, setOpenSectionId] = useState<string | null>('resumen');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasFile = !!selectedFile;

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setResult(null);

    if (file) {
      setStatus(`Archivo seleccionado: "${file.name}". Ahora toca Analizar mi chat.`);
    } else {
      setStatus('');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setStatus('Primero selecciona un archivo .txt con tu chat de WhatsApp.');
      return;
    }

    try {
      setIsUploading(true);
      setStatus('Subiendo y procesando archivo…');
      setResult(null);

      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || 'Ocurrió un error al procesar el archivo.');
        return;
      }

      setStatus('Reporte generado correctamente. 🎯');
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
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
              Entiende tus
              <br />
              conversaciones
              <br />
              como{' '}
              <span className="bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-300 bg-clip-text text-transparent">
                nunca antes.
              </span>
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              by <span className="font-semibold text-slate-100">Pattern Labs AI</span>
            </p>

            {/* Descripción */}
            <p className="max-w-lg text-sm text-slate-300 sm:text-base">
              Analiza tus chats de <span className="font-semibold">WhatsApp</span> e identifica
              patrones emocionales, dinámicas de comunicación y señales ocultas que influyen en tus
              relaciones. Todo en un reporte claro, privado y accionable.
            </p>

            {/* Controles */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {/* Botón seleccionar archivo */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2 
                    text-sm font-semibold text-white 
                    bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-300
                    shadow-lg shadow-purple-500/20 hover:opacity-90 transition"
                >
                  Subir chat (.txt)
                </button>

                {/* input real oculto */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {/* Botón de analizar */}
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={isUploading || !hasFile}
                  className={`inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold shadow-md shadow-slate-900/40 transition
                    ${
                      hasFile
                        ? 'border-emerald-500/60 bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                        : 'border-slate-600 bg-slate-900/60 text-slate-100 hover:bg-slate-800'
                    }
                    disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {isUploading ? 'Analizando…' : 'Generar reporte'}
                  <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    Listo en 5 segundos
                  </span>
                </button>
              </div>

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

              {/* estado del uploader */}
              {status && (
                <p className="flex items-center gap-2 text-[13px] text-slate-200">
                  <span className="text-emerald-300">▸</span>
                  {status}
                </p>
              )}
            </div>
          </div>

          {/* Columna derecha: mockup estático SOLO si aún no hay reporte */}
          {!result && (
            <div className="mx-auto max-w-md flex-1">
              <div className="relative rounded-3xl border border-violet-500/40 bg-slate-900/80 p-5 shadow-[0_0_80px_rgba(129,140,248,0.6)]">
                <div className="mb-4 flex items-center justify-between text-xs text-slate-300">
                  <div>
                    <p className="text-[11px] font-medium tracking-[0.22em] text-slate-400">
                      PATTERN SCORE
                    </p>
                    <p>Relación · Últimos 90 días</p>
                  </div>
                  <span className="rounded-full border border-violet-400/60 bg-violet-500/30 px-3 py-1 text-[11px] font-semibold text-violet-50">
                    REPORTE DEMO
                  </span>
                </div>

                {/* Bloque principal */}
                <div className="mb-4 flex items-end justify-between gap-4 rounded-2xl bg-slate-900/90 px-4 py-3">
                  <div>
                    <p className="text-xs text-slate-400">Balance emocional</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-slate-50">8.3</span>
                      <span className="text-xs text-slate-400">/10</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-300">
                      Se observa una base emocional mayormente positiva, con momentos de tensión,
                      silencios largos y cambios de tono que marcan las distintas etapas de la
                      relación.
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      El informe combina señales del lenguaje, frecuencia de mensajes y contexto
                      para detectar cómo se sienten realmente las dos partes.
                    </p>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-xs text-emerald-300">
                      +32%
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500 text-center">
                      vs. últimos 30 días
                    </p>
                  </div>
                </div>

                <p className="mb-2 text-[11px] font-medium tracking-[0.22em] text-slate-400">
                  PRINCIPALES PATRONES DETECTADOS
                </p>

                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center justify-between rounded-xl bg-slate-900/80 px-3 py-2">
                    <div>
                      <p className="font-medium text-slate-100">Picos de ansiedad nocturna</p>
                      <p className="text-[10px] text-slate-400">
                        Conversaciones más intensas y emocionales entre 11:30 p.m y 1:00 a.m,
                        cuando bajan las defensas y se hablan temas delicados.
                      </p>
                    </div>
                    <span className="rounded-full bg-rose-500/20 px-2 py-1 text-[10px] font-semibold text-rose-200">
                      Emoción
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-slate-900/80 px-3 py-2">
                    <div>
                      <p className="font-medium text-slate-100">Desbalance en la iniciativa</p>
                      <p className="text-[10px] text-slate-400">
                        La mayoría de los comienzos de conversación vienen de una sola persona,
                        lo que puede generar sensación de carga o poca reciprocidad.
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-500/20 px-2 py-1 text-[10px] font-semibold text-amber-200">
                      Dinámica
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-slate-900/80 px-3 py-2">
                    <div>
                      <p className="font-medium text-slate-100">Momentos de conexión profunda</p>
                      <p className="text-[10px] text-slate-400">
                        Bloques de conversación largos con alta empatía, acuerdos importantes
                        y un tono mucho más vulnerable y honesto.
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-200">
                      Fortaleza
                    </span>
                  </div>
                </div>

                {/* Footer con mensaje de conversación */}
                <div className="mt-4 border-t border-slate-800 pt-2">
                  <div className="flex flex-col gap-1 text-[10px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                    <span>Reporte listo en menos de 30 segundos.</span>
                    <span className="text-slate-300">
                      Después de verlo, puedes{' '}
                      <span className="text-emerald-300 font-semibold">hablar con la IA</span>{' '}
                      sobre tu relación usando el chat completo.
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-right text-slate-500">
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
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-emerald-300">
                  Resumen de tu conversación
                </p>
                <p className="mt-1 text-xs text-emerald-200/80">
                  Archivo: <span className="font-mono">{result.fileName}</span> ·{' '}
                  {result.length.toLocaleString()} caracteres analizados
                </p>
              </div>

              {typeof result.score === 'number' && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-right">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-300">
                    PATTERN SCORE
                  </p>
                  <div className="flex items-end justify-end gap-1">
                    <span className="text-2xl font-bold text-emerald-200">
                      {result.score.toFixed(1)}
                    </span>
                    <span className="text-[11px] text-emerald-300/80">/10</span>
                  </div>
                </div>
              )}
            </div>

            {/* TL;DR */}
            {result.tlDr && result.tlDr.length > 0 && (
              <div className="mb-4 rounded-xl bg-slate-900/80 p-3">
                <p className="mb-1 text-xs font-semibold text-slate-200">
                  TL;DR de tu relación
                </p>
                <ul className="list-disc space-y-1 pl-4 text-xs text-slate-300">
                  {result.tlDr.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Badges */}
            {result.badges && result.badges.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {result.badges.map((badge, idx) => {
                  const levelColors: Record<string, string> = {
                    low: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/40',
                    medium: 'bg-amber-500/10 text-amber-200 border-amber-500/40',
                    high: 'bg-rose-500/10 text-rose-200 border-rose-500/40',
                  };
                  const colors = levelColors[badge.level] ?? levelColors.medium;
                  return (
                    <span
                      key={idx}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium ${colors}`}
                    >
                      <span>{badge.emoji}</span>
                      <span>{badge.label}</span>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Accordions */}
            <div className="space-y-2">
              {result.sections &&
                result.sections.map((section) => {
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

            {/* Chat sobre el reporte */}
            <div className="mt-5 border-t border-slate-800 pt-4">
              <ChatBox
                analysis={result.rawAnalysis ?? ''}
                fullChat={result.fullChat ?? ''}
              />
            </div>
          </div>
        </section>
      )}

      {/* Divider luminoso */}
      <div className="h-px w-full bg-gradient-to-r from-fuchsia-500/40 via-purple-500/40 to-cyan-300/40" />

      {/* Sección: cómo funciona Pattern Labs AI */}
      <section
        id="how-it-works"
        className="mx-auto mt-10 max-w-5xl px-6 pb-16"
      >
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-[0_0_60px_rgba(15,23,42,0.9)]">
          <h2 className="text-2xl font-bold sm:text-3xl">
            ¿Cómo funciona Pattern Labs AI?
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">
            En menos de un minuto pasas de un archivo .txt lleno de mensajes a un reporte claro,
            accionable y conversable. Así es el flujo:
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-950/60 p-5 border border-slate-800">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Paso 1
              </p>
              <h3 className="mt-2 text-sm font-semibold text-slate-100">
                Sube tu chat en .txt
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                Exportas tu conversación de WhatsApp sin archivos multimedia y subes el .txt de
                forma privada. No usamos tus datos para entrenar modelos.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-950/60 p-5 border border-slate-800">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Paso 2
              </p>
              <h3 className="mt-2 text-sm font-semibold text-slate-100">
                Generamos tu Pattern Score
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                Analizamos patrones emocionales, quién inicia más, cómo evolucionan las
                conversaciones y te mostramos un resumen claro con fortalezas y riesgos.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-950/60 p-5 border border-slate-800">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Paso 3
              </p>
              <h3 className="mt-2 text-sm font-semibold text-slate-100">
                Hablas con la IA sobre tu chat
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                Le puedes preguntar cosas concretas: quién se engancha más, qué podrías mejorar tú,
                qué dinámicas se repiten, etc. El contexto es tu chat completo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sección: privacidad */}
      <section
        id="privacy"
        className="mx-auto mb-10 max-w-5xl px-6"
      >
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-[0_0_60px_rgba(15,23,42,0.9)]">
          <h2 className="text-2xl font-bold sm:text-3xl">
            Privacidad y seguridad de tu chat
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">
            Sabemos que tus conversaciones son súper sensibles. Pattern Labs AI está diseñado para
            que tengas claridad sin sacrificar privacidad.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-950/60 p-5 border border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">Tu archivo es sólo tuyo</h3>
              <p className="mt-2 text-sm text-slate-300">
                Usamos tu archivo únicamente para generar tu reporte. No vendemos ni compartimos tus
                chats con terceros.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-950/60 p-5 border border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">Análisis en tiempo real</h3>
              <p className="mt-2 text-sm text-slate-300">
                El procesamiento se hace en el momento. Puedes cerrar la página cuando termines y
                nadie más verá tu reporte.
              </p>
            </div>

            <div className="rounded-2xl bg-slate-950/60 p-5 border border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">Control total</h3>
              <p className="mt-2 text-sm text-slate-300">
                Tú decides qué chat subir, cuándo analizarlo y qué hacer con la información. Pattern
                Labs AI es una herramienta para entender, no para juzgar.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sección: cómo exportar chat */}
      <section
        id="export-guide"
        className="mx-auto mb-16 max-w-5xl px-6"
      >
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-[0_0_60px_rgba(15,23,42,0.9)]">
          <h2 className="text-2xl font-bold sm:text-3xl">
            ¿Cómo exportar tu chat de WhatsApp?
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">
            Si nunca has exportado una conversación, aquí tienes la guía rápida para obtener tu
            archivo <span className="font-semibold">.txt</span> y subirlo a Pattern Labs AI:
          </p>

          <ol className="mt-6 space-y-4 text-sm text-slate-200">
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-100">
                1
              </span>
              <p>Abre WhatsApp y entra al chat que quieres analizar.</p>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-100">
                2
              </span>
              <p>Toca el nombre del contacto o grupo para abrir el menú del chat.</p>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-100">
                3
              </span>
              <p>Busca la opción “Exportar chat”.</p>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-100">
                4
              </span>
              <p>Elige “Sin archivos” para no incluir multimedia.</p>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-100">
                5
              </span>
              <p>Descarga el archivo .txt en tu computadora.</p>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-100">
                6
              </span>
              <p>Vuelve arriba, súbelo en “Generar reporte” y obtén tu análisis.</p>
            </li>
          </ol>
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
function ChatBox({
  analysis,
  fullChat,
}: {
  analysis: string;
  fullChat: string;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async () => {
    if (!question.trim()) return;
    try {
      setLoading(true);
      setError(null);
      setAnswer(null);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis,
          fullChat,
          question: question.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Ocurrió un error al responder tu pregunta.');
        return;
      }

      setAnswer(data.answer || '');
    } catch (err) {
      console.error(err);
      setError('Error de red o del servidor al responder tu pregunta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl bg-slate-950/70 p-4 border border-slate-800">
      <p className="mb-2 text-xs font-semibold text-slate-200">
        Hazle preguntas a tu reporte
      </p>
      <p className="mb-3 text-xs text-slate-400">
        Ejemplos: “¿Quién está más enganchado?”, “¿Qué tan sana ves esta relación?”, “¿Qué puedo
        trabajar yo para mejorar esto?”
      </p>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={2}
        className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        placeholder="Escribe tu pregunta aquí…"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Analizando…' : 'Preguntar a la IA'}
        </button>
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>

      {answer && (
        <div className="mt-4 rounded-lg bg-slate-900/80 px-3 py-2 text-xs text-slate-100 whitespace-pre-wrap">
          {answer}
        </div>
      )}
    </div>
  );
}
