'use client';

import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';

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

  // Estadísticas pre-calculadas del chat completo
  chatStats?: {
    totalMessages: number;
    participants: {
      name: string;
      messageCount: number;
      wordCount: number;
      avgWordsPerMessage: number;
      mostActiveHours?: string;
    }[];
    totalWords: number;
    dateRange: { first: string | null; last: string | null };
    phraseCounts?: {
      phrase: string;
      total: number;
      byParticipant: Record<string, number>;
    }[];
  };
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

  // 🎁 Estado para pregunta demo gratis (con respuesta blurreada)
  const [demoQuestion, setDemoQuestion] = useState('');
  const [demoAsked, setDemoAsked] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [savedDemoQuestion, setSavedDemoQuestion] = useState('');

  // 📦 Estado para el modal de subida
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [exportGuideTab, setExportGuideTab] = useState<'android' | 'iphone'>('android');

  // 📊 Estado para la barra de progreso
  const [showProgressBar, setShowProgressBar] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [messageCount, setMessageCount] = useState<number | null>(null);

  // 🔒 Estado para mini-modal de patrón bloqueado
  const [showLockedModal, setShowLockedModal] = useState(false);
  const [lockedPatternName, setLockedPatternName] = useState<string>('');

  // 📱 Estado para sticky CTA móvil (aparece al hacer scroll)
  const [showStickyCTA, setShowStickyCTA] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modalFileInputRef = useRef<HTMLInputElement | null>(null);
  const hasFile = !!selectedFile;

  // 🧠 Rehidratar acceso/credits/resultado desde localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      // Restaurar acceso y créditos
      const stored = window.localStorage.getItem('patternlabs_access');
      if (stored) {
        const parsed = JSON.parse(stored) as {
          hasAccess?: boolean;
          credits?: number;
        };

        if (parsed.hasAccess && typeof parsed.credits === 'number' && parsed.credits >= 0) {
          setHasAccess(true);
          setCredits(parsed.credits);
        } else {
          window.localStorage.removeItem('patternlabs_access');
        }
      }

      // Restaurar resultado del análisis (para continuar después de pagar más preguntas)
      const storedResult = window.localStorage.getItem('patternlabs_result');
      if (storedResult) {
        const parsedResult = JSON.parse(storedResult) as AnalyzeResult;
        setResult(parsedResult);
        console.log('📦 Resultado restaurado desde localStorage');
      }
    } catch (err) {
      console.error('Error leyendo localStorage', err);
      window.localStorage.removeItem('patternlabs_access');
      window.localStorage.removeItem('patternlabs_result');
    }
  }, []);

  // Guardar cambios en localStorage (acceso y créditos)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload = JSON.stringify({ hasAccess, credits });
      window.localStorage.setItem('patternlabs_access', payload);
    } catch (err) {
      console.error('Error guardando localStorage', err);
    }
  }, [hasAccess, credits]);

  // Guardar resultado del análisis en localStorage (para persistir entre pagos)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!result) return;
    try {
      window.localStorage.setItem('patternlabs_result', JSON.stringify(result));
      console.log('💾 Resultado guardado en localStorage');
    } catch (err) {
      console.error('Error guardando resultado en localStorage', err);
    }
  }, [result]);

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
          // Sumar 3 créditos con el pago (no resetear, por si compra más)
          setCredits(prev => prev + 3);

          // Limpiar resultado anterior para mostrar pantalla de éxito
          // (el usuario puede subir nuevo chat o re-subir el anterior)
          setResult(null);
          setSelectedFile(null);
          setDemoAsked(false);
          setDemoQuestion('');
          setSavedDemoQuestion('');
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem('patternlabs_result');
            window.localStorage.removeItem('patternlabs_chat_history');
          }

          setStatus('');
          // Limpiar la query de la URL
          window.history.replaceState({}, '', window.location.pathname);

          // Scroll hacia arriba para mostrar pantalla de éxito completa
          setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }, 100);
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

  // 📦 Abrir modal de subida
  const openUploadModal = () => {
    setShowUploadModal(true);
    setUploadError(null);
    setFileToUpload(null);
    setShowProgressBar(false);
    setProgressPercent(0);
    setCurrentStep(0);
    setAnalysisComplete(false);
  };

  // 📦 Cerrar modal
  const closeUploadModal = () => {
    if (isUploading) return; // No cerrar durante upload
    setShowUploadModal(false);
    setIsDragging(false);
    setUploadError(null);
    setFileToUpload(null);
  };

  // 📦 Validar archivo (acepta .txt y .zip)
  const validateFile = (file: File): string | null => {
    const isValid = file.name.endsWith('.txt') || file.name.endsWith('.zip');
    if (!isValid) {
      return 'Archivo no válido. Sube el .txt o .zip exportado de WhatsApp.';
    }
    if (file.size < 500) {
      return 'El archivo es demasiado pequeño. Asegúrate de que sea un chat de WhatsApp exportado.';
    }
    if (file.size > 50 * 1024 * 1024) {
      return 'El archivo es demasiado grande (máx 50MB).';
    }
    return null;
  };

  // 📦 Extraer .txt de un archivo .zip
  const extractTxtFromZip = async (zipFile: File): Promise<File | null> => {
    try {
      const zip = await JSZip.loadAsync(zipFile);
      const txtFiles = Object.keys(zip.files).filter(name => name.endsWith('.txt'));

      if (txtFiles.length === 0) {
        return null;
      }

      // Tomar el primer .txt encontrado (WhatsApp exporta solo uno)
      const txtFileName = txtFiles[0];
      const txtContent = await zip.files[txtFileName].async('blob');

      // Crear un nuevo File object con el contenido extraído
      return new File([txtContent], txtFileName, { type: 'text/plain' });
    } catch (error) {
      console.error('Error extrayendo ZIP:', error);
      return null;
    }
  };

  // 📦 Manejar selección de archivo en modal (soporta .txt y .zip)
  const handleModalFileSelect = async (file: File) => {
    const error = validateFile(file);
    if (error) {
      setUploadError(error);
      setFileToUpload(null);
      return;
    }

    // Si es ZIP, extraer el .txt automáticamente
    if (file.name.endsWith('.zip')) {
      setUploadError(null);
      setStatus('Extrayendo chat del ZIP...');

      const extractedFile = await extractTxtFromZip(file);
      if (!extractedFile) {
        setUploadError('No se encontró un archivo .txt dentro del ZIP. Asegúrate de exportar el chat de WhatsApp.');
        setFileToUpload(null);
        setStatus('');
        return;
      }

      setFileToUpload(extractedFile);
      setStatus('');
      return;
    }

    setUploadError(null);
    setFileToUpload(file);
  };

  // 📦 Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleModalFileSelect(file);
  };

  // 📊 Fases de la barra de progreso (fast start, slow finish)
  const PROGRESS_PHASES = [
    { target: 20, duration: 800 },
    { target: 45, duration: 1200 },
    { target: 65, duration: 1500 },
    { target: 80, duration: 2500 },
    { target: 92, duration: 4000 },
  ];

  // 📊 Pasos del análisis
  const ANALYSIS_STEPS = [
    { label: 'Leyendo mensajes...', threshold: 0 },
    { label: 'Identificando participantes...', threshold: 20 },
    { label: 'Detectando patrones emocionales...', threshold: 45 },
    { label: 'Calculando Pattern Score...', threshold: 65 },
    { label: 'Generando reporte...', threshold: 80 },
  ];

  // 📊 Animación de progreso con fases
  const runProgressAnimation = (onComplete: () => void) => {
    let currentPhase = 0;
    let startTime = Date.now();
    let startValue = 0;
    let backendDone = false;
    let backendResult: AnalyzeResult | null = null;
    let backendError: string | null = null;

    const animate = () => {
      if (backendDone && backendResult) {
        // Backend terminó exitosamente - saltar a 100%
        setProgressPercent(100);
        setCurrentStep(ANALYSIS_STEPS.length - 1);
        setAnalysisComplete(true);
        setTimeout(() => {
          onComplete();
        }, 800);
        return;
      }

      if (backendDone && backendError) {
        // Backend falló
        setUploadError(backendError);
        setShowProgressBar(false);
        setIsUploading(false);
        return;
      }

      if (currentPhase >= PROGRESS_PHASES.length) {
        // Fase de espera - micro incrementos entre 92-95%
        const current = progressPercent;
        if (current < 95) {
          setProgressPercent(prev => Math.min(prev + (Math.random() * 1 + 0.5), 95));
        }
        setTimeout(animate, 1500 + Math.random() * 1000);
        return;
      }

      const phase = PROGRESS_PHASES[currentPhase];
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / phase.duration, 1);

      // Easing ease-out para las primeras fases, ease-in para las últimas
      const eased = currentPhase < 3
        ? 1 - Math.pow(1 - progress, 3) // ease-out
        : Math.pow(progress, 2); // ease-in

      const newValue = startValue + (phase.target - startValue) * eased;
      setProgressPercent(newValue);

      // Actualizar paso actual basado en el progreso
      const stepIndex = ANALYSIS_STEPS.findIndex((step, i) => {
        const nextStep = ANALYSIS_STEPS[i + 1];
        return nextStep ? newValue < nextStep.threshold : true;
      });
      setCurrentStep(stepIndex);

      if (progress >= 1) {
        currentPhase++;
        startTime = Date.now();
        startValue = phase.target;
      }

      requestAnimationFrame(animate);
    };

    // Iniciar animación
    requestAnimationFrame(animate);

    // Retornar función para marcar backend como completado
    return {
      complete: (result: AnalyzeResult) => {
        backendDone = true;
        backendResult = result;
      },
      error: (err: string) => {
        backendDone = true;
        backendError = err;
      }
    };
  };

  // 📦 Confirmar y subir archivo
  const handleConfirmUpload = async () => {
    if (!fileToUpload) return;

    setShowProgressBar(true);
    setIsUploading(true);
    setProgressPercent(0);
    setCurrentStep(0);
    setAnalysisComplete(false);

    // Intentar contar mensajes del archivo para mostrar en el UI
    try {
      const text = await fileToUpload.text();
      const lines = text.split('\n');
      const msgCount = lines.filter(line =>
        /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line) ||
        /^\[\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)
      ).length;
      if (msgCount > 0) setMessageCount(msgCount);
    } catch {
      // Ignorar error de lectura
    }

    // Iniciar animación de progreso
    const progressController = runProgressAnimation(() => {
      // Callback cuando la animación termina (backend respondió)
      setShowUploadModal(false);
      setIsUploading(false);
      // Scroll suave a los resultados
      setTimeout(() => {
        const el = document.getElementById('analysis-results');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    });

    // Hacer la petición real al backend
    try {
      const formData = new FormData();
      formData.append('file', fileToUpload);
      formData.append('mode', hasAccess ? 'full' : 'free');

      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        progressController.error(data.error || 'Ocurrió un error al procesar el archivo.');
        return;
      }

      setSelectedFile(fileToUpload);
      setResult(data as AnalyzeResult);
      setOpenSectionId('resumen');
      setStatus(hasAccess ? 'Reporte completo generado. 🎯' : 'Reporte demo generado. 🎯');
      progressController.complete(data as AnalyzeResult);
    } catch (error) {
      console.error(error);
      progressController.error('Error de red o del servidor al analizar el archivo.');
    }
  };

  // Legacy handlers para mantener compatibilidad
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      handleModalFileSelect(file);
      if (!uploadError) {
        setFileToUpload(file);
      }
    }
  };

  const handleUploadWithFile = async (file: File) => {
    setFileToUpload(file);
    await handleConfirmUpload();
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

  /** 🔧 Resetear estado para nuevo análisis */
  const handleResetAccess = () => {
    console.log('🔄 Reseteando para nuevo análisis...');
    // NO resetear hasAccess ni credits si ya pagó - solo el resultado
    setResult(null);
    setSelectedFile(null);
    setDemoAsked(false);
    setDemoQuestion('');
    setSavedDemoQuestion('');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('patternlabs_result');
      window.localStorage.removeItem('patternlabs_chat_history');
      console.log('🗑️ localStorage limpiado (resultado, historial)');
    }
    setStatus('');
    // Abrir modal de subida directamente
    setTimeout(() => {
      openUploadModal();
    }, 100);
  };

  /** 🔧 Resetear TODO (incluyendo acceso) - para debugging */
  const handleFullReset = () => {
    console.log('🔄 Reset completo...');
    setHasAccess(false);
    setCredits(0);
    setResult(null);
    setSelectedFile(null);
    setDemoAsked(false);
    setDemoQuestion('');
    setSavedDemoQuestion('');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('patternlabs_access');
      window.localStorage.removeItem('patternlabs_result');
      window.localStorage.removeItem('patternlabs_chat_history');
      console.log('🗑️ localStorage limpiado completamente');
    }
    setStatus('✅ Estado reiniciado completamente.');
  };

  /** 🔧 Botón dev para simular pago exitoso */
  const handleSimulatePurchase = () => {
    setHasAccess(true);
    setCredits(3);
    setStatus('✅ [DEV] Pago simulado. Tienes 3 preguntas con la IA.');
  };

  const consumeCredit = () => {
    setCredits((prev) => Math.max(prev - 1, 0));
  };

  // 🔒 Manejar click en patrón bloqueado - abre mini-modal contextual
  const handleLockedPatternClick = (patternName: string) => {
    setLockedPatternName(patternName);
    setShowLockedModal(true);
  };

  // 🎁 Manejar pregunta demo gratis (fake processing + blur)
  const handleDemoAsk = async () => {
    if (!demoQuestion.trim()) return;

    const askedQuestion = demoQuestion.trim();
    setSavedDemoQuestion(askedQuestion);
    setDemoQuestion('');
    setDemoLoading(true);

    // Simular procesamiento (fake loading 2.5 segundos)
    await new Promise(resolve => setTimeout(resolve, 2500));

    setDemoLoading(false);
    setDemoAsked(true);

    // Scroll al CTA después de mostrar la respuesta blurreada
    setTimeout(() => {
      const el = document.getElementById('unlock-cta');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* HERO */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_#4c1d95_0,_#020617_55%)] opacity-80" />

        <div className="relative mx-auto flex max-w-6xl flex-col gap-16 px-6 pb-16 pt-10 lg:flex-row lg:items-center lg:pt-16">

          {/* =============================================== */}
          {/* PANTALLA DE ÉXITO POST-PAGO (hasAccess && !result) - COMPACTA */}
          {/* =============================================== */}
          {hasAccess && !result && (
            <div className="w-full flex flex-col items-center justify-center text-center py-4">
              {/* Orbes de fondo */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-emerald-500/30 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-[350px] h-[350px] bg-cyan-500/25 rounded-full blur-3xl" />
              </div>

              <div className="relative z-10 max-w-2xl mx-auto">
                {/* Header compacto: Icono + Badge + Título en una línea */}
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center shadow-xl">
                    <svg className="w-8 h-8 text-slate-900" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/50 mb-1">
                      <span>⭐</span>
                      <span className="text-sm font-bold text-amber-200">PRO ACTIVADO</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">
                      ¡Felicidades!
                    </h1>
                  </div>
                </div>

                {/* Lo que incluye - Inline compacto */}
                <div className="flex flex-wrap justify-center gap-3 mb-6">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span className="text-sm font-semibold text-emerald-200">Análisis completo</span>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/40">
                    <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    <span className="text-sm font-semibold text-purple-200">3 preguntas IA</span>
                  </div>
                  {/* Círculos de preguntas inline */}
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          i <= credits
                            ? 'bg-gradient-to-br from-emerald-400 to-cyan-400 text-slate-900'
                            : 'bg-slate-600 text-slate-400'
                        }`}
                      >
                        {i <= credits ? '✓' : i}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card principal con CTA */}
                <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-slate-900/95 to-emerald-950/30 p-6 shadow-xl mb-4">
                  <p className="text-slate-300 text-base mb-5">
                    Sube tu chat de WhatsApp para obtener tu <span className="font-bold text-emerald-300">análisis PRO</span>
                  </p>

                  {/* Botón de subir archivo */}
                  <button
                    type="button"
                    onClick={openUploadModal}
                    disabled={isUploading}
                    className="w-full inline-flex items-center justify-center gap-3 rounded-xl px-6 py-4 text-lg font-bold text-slate-950
                      bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400
                      shadow-xl shadow-emerald-500/40 hover:shadow-emerald-500/60 hover:scale-[1.02] active:scale-[0.98] transition-all
                      disabled:cursor-not-allowed disabled:opacity-60 relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                    <svg className="w-6 h-6 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="relative z-10">Subir mi chat de WhatsApp</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.zip"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isUploading}
                  />

                  <p className="mt-4 text-xs text-slate-500 flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    100% privado · No almacenamos tus chats
                  </p>
                </div>

                {/* Link a guía */}
                <button
                  type="button"
                  onClick={scrollToGuide}
                  className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  ¿Cómo exportar tu chat?
                </button>

                {/* Botones dev para probar el flujo */}
                {isDev && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <button
                      type="button"
                      onClick={handleResetAccess}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-xs text-rose-300 hover:bg-rose-500/30 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Reset [DEV]
                    </button>
                  </div>
                )}

                {/* Estado del proceso */}
                {status && (
                  <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-200">
                    <span className="text-emerald-300">▸</span>
                    {status}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* =============================================== */}
          {/* HERO NORMAL (cuando NO tiene acceso) */}
          {/* =============================================== */}
          {!hasAccess && (
          <>
          {/* Columna izquierda */}
          <div className="max-w-xl space-y-6">
            {/* Trust Badge - MÁS prominente con candado animado */}
            <div className="inline-flex items-center gap-3 rounded-full border border-emerald-400/50 bg-emerald-400/15 px-5 py-2.5 shadow-lg shadow-emerald-500/30 backdrop-blur-sm">
              <div className="relative">
                <svg className="w-5 h-5 text-emerald-300 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                </span>
              </div>
              <span className="text-sm font-semibold text-emerald-100">100% privado · Tu chat no se almacena</span>
            </div>

            {/* Título - NUEVO HEADLINE orientado a beneficio */}
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl leading-[1.1]">
              <span className="text-slate-50">Descubre qué tan sana es tu relación</span>
              <br />
              <span className="bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-300 bg-clip-text text-transparent">
                en 30 segundos
              </span>
            </h1>

            {/* Subtítulo - INTEGRA el diferenciador del chat con IA */}
            <p className="max-w-lg text-lg text-slate-300 sm:text-xl leading-relaxed">
              Sube tu chat de WhatsApp. La IA detecta <span className="font-semibold text-emerald-300">patrones emocionales</span>,
              <span className="font-semibold text-amber-300"> desbalances</span> y
              <span className="font-semibold text-cyan-300"> fortalezas</span> — y después
              <span className="font-semibold text-purple-300"> te deja preguntarle lo que quieras</span>.
            </p>

            {/* by Pattern Labs */}
            <p className="text-sm text-slate-500">
              by <span className="font-semibold text-slate-300">Pattern Labs AI</span>
            </p>

            {/* CTA ÚNICO - Grande y prominente - Abre modal */}
            <div className="space-y-4 pt-2">
              {!showFileInput ? (
                <div className="space-y-3">
                  {/* Social proof arriba del CTA */}
                  <p className="text-center text-sm text-white/70">
                    🔥 12,483 chats analizados esta semana
                  </p>
                  <button
                    type="button"
                    onClick={openUploadModal}
                    disabled={isUploading}
                    className="group relative w-full min-w-[320px] inline-flex items-center justify-center gap-3 rounded-full px-8 py-5 text-lg font-bold text-slate-950
                      bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-[length:200%_100%]
                      shadow-2xl shadow-emerald-500/40
                      hover:shadow-emerald-500/60 hover:scale-[1.02] hover:bg-[100%_0]
                      active:scale-[0.98] transition-all duration-500
                      disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {/* Glow effect */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 blur-xl opacity-50 group-hover:opacity-70 transition-opacity" />
                    <svg className="w-6 h-6 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="relative z-10">Analiza tu chat ahora — es gratis</span>
                  </button>
                  {/* Micro-copy debajo del CTA */}
                  <p className="text-center text-sm text-slate-400 flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Demo gratis · Sin cuenta necesaria · Tu chat no se almacena
                  </p>
                </div>
              ) : (
                  // PASO 2: Mostrar el file input cuando hacen click
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Botón seleccionar archivo - Abre modal */}
                    <button
                      type="button"
                      onClick={openUploadModal}
                      disabled={isUploading}
                      className="inline-flex items-center gap-2 rounded-full px-6 py-3
                        text-base font-semibold text-white
                        bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-300
                        shadow-lg shadow-purple-500/20 hover:opacity-90 transition
                        disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span>{hasFile ? `"${selectedFile?.name}"` : 'Subir chat (.txt)'}</span>
                    </button>
                  </div>
                )}

                {/* Links útiles - Sutiles */}
                <div className="flex items-center justify-center gap-6">
                  <button
                    type="button"
                    onClick={scrollToGuide}
                    className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 underline underline-offset-2 decoration-white/30 hover:decoration-white/50 transition-all"
                  >
                    <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    ¿Cómo exportar?
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('privacy');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 underline underline-offset-2 decoration-white/30 hover:decoration-white/50 transition-all"
                  >
                    <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Privacidad
                  </button>
                </div>

                {/* estado del uploader / pago */}
                {status && (
                  <p className="flex items-center gap-2 text-[13px] text-slate-200">
                    <span className="text-emerald-300">▸</span>
                    {status}
                  </p>
                )}
              </div>

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

              {/* Testimonial preview MOBILE - clickable */}
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('social-proof');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="lg:hidden w-full text-left p-4 rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-slate-800 hover:border-amber-500/40 transition-all relative overflow-hidden group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex -space-x-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold">M</div>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold">J</div>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold">A</div>
                    <div className="w-8 h-8 rounded-full bg-slate-700 border-2 border-slate-900 flex items-center justify-center text-[9px] font-medium text-slate-400">+2K</div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {[1,2,3,4,5].map(i => (
                      <svg key={i} className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                    <span className="text-xs text-slate-400 ml-1 font-semibold">4.9</span>
                  </div>
                </div>
                <p className="text-sm text-slate-300 italic leading-relaxed">"La IA me dio datos que ni yo había notado..."</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-500">+2,000 usuarios satisfechos</p>
                  <span className="text-xs text-amber-400 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    Ver historias
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </button>

              {/* Botones dev para probar el flujo */}
              {isDev && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetAccess}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-xs text-rose-300 hover:bg-rose-500/30 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={handleSimulatePurchase}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-xs text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Simular pago
                  </button>
                </div>
              )}

              {/* ========== NAVEGACIÓN STICKY - Lo que nos hace únicos ========== */}
              <div className="hidden lg:block mt-12 sticky top-8">
                {/* Stats impactantes */}
                <div className="mb-6 grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-500/30">
                    <p className="text-2xl font-black text-emerald-300">47K+</p>
                    <p className="text-[10px] text-slate-400 font-medium">Chats analizados</p>
                  </div>
                  <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/10 to-fuchsia-500/10 border border-purple-500/30">
                    <p className="text-2xl font-black text-purple-300">132K+</p>
                    <p className="text-[10px] text-slate-400 font-medium">Preguntas a la IA</p>
                  </div>
                </div>

                {/* Section header con estilo premium */}
                <div className="flex items-center gap-2 mb-5">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Por qué elegirnos</p>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
                </div>

                <div className="space-y-2.5">
                  {/* Card 1 - IA Chat - DESTACADA */}
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('ai-chat-feature');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="w-full flex items-center gap-3 text-left p-3.5 rounded-2xl bg-gradient-to-r from-purple-500/20 via-fuchsia-500/10 to-purple-500/20 border border-purple-500/40 hover:border-purple-400/60 hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300 group relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-purple-500/0 group-hover:via-purple-500/10 transition-all duration-500"></div>
                    <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-purple-500/30 group-hover:scale-105 group-hover:rotate-3 transition-all duration-300">
                      <span className="text-xl">🤖</span>
                    </div>
                    <div className="flex-1 min-w-0 relative">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-white">Chat con IA</p>
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-purple-500/30 text-purple-200 uppercase">Único</span>
                      </div>
                      <p className="text-xs text-purple-200/80">Pregúntale cualquier cosa sobre tu relación</p>
                    </div>
                    <div className="relative text-purple-400 group-hover:translate-x-1 transition-transform">→</div>
                  </button>

                  {/* Card 2 - Ejemplos reales */}
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('real-examples');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="w-full flex items-center gap-3 text-left p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600 transition-all duration-300 group backdrop-blur-sm"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg group-hover:scale-105 group-hover:-rotate-3 transition-all duration-300">
                      <span className="text-xl">💬</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-100">Casos reales</p>
                      <p className="text-xs text-slate-400">Mira análisis de otros usuarios</p>
                    </div>
                    <div className="text-slate-500 group-hover:translate-x-1 group-hover:text-slate-400 transition-all">→</div>
                  </button>

                  {/* Card 3 - Cómo funciona */}
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('how-it-works');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="w-full flex items-center gap-3 text-left p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600 transition-all duration-300 group backdrop-blur-sm"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-lg group-hover:scale-105 group-hover:rotate-3 transition-all duration-300">
                      <span className="text-xl">⚡</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-100">Ultra rápido</p>
                      <p className="text-xs text-slate-400">Resultados en 30 segundos</p>
                    </div>
                    <div className="text-slate-500 group-hover:translate-x-1 group-hover:text-slate-400 transition-all">→</div>
                  </button>

                  {/* Card 4 - Privacidad */}
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('privacy');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="w-full flex items-center gap-3 text-left p-3.5 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60 hover:border-slate-600 transition-all duration-300 group backdrop-blur-sm"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg group-hover:scale-105 group-hover:-rotate-3 transition-all duration-300">
                      <span className="text-xl">🔒</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-100">100% privado</p>
                      <p className="text-xs text-slate-400">Tu chat nunca se guarda</p>
                    </div>
                    <div className="text-slate-500 group-hover:translate-x-1 group-hover:text-slate-400 transition-all">→</div>
                  </button>
                </div>

                {/* Testimonial preview - CLICKABLE para ir a la sección completa */}
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('social-proof');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="mt-6 w-full text-left p-4 rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-slate-800 hover:border-amber-500/40 hover:bg-slate-900/90 transition-all relative overflow-hidden group cursor-pointer"
                >
                  <div className="absolute top-2 right-3 text-4xl text-slate-800 font-serif leading-none">"</div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex -space-x-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold">M</div>
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold">J</div>
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold">A</div>
                      <div className="w-7 h-7 rounded-full bg-slate-700 border-2 border-slate-900 flex items-center justify-center text-[9px] font-medium text-slate-400">+2K</div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {[1,2,3,4,5].map(i => (
                        <svg key={i} className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                      <span className="text-[10px] text-slate-500 ml-1">4.9</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 italic leading-relaxed relative z-10">"Le pregunté si él estaba más enamorado que yo. La IA me dio datos que ni yo había notado."</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[10px] text-emerald-400/80 font-medium">— María, CDMX · hace 2 días</p>
                    <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      Ver más historias
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </button>

                {/* Badge de confianza */}
                <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-slate-500">
                  <svg className="w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>SSL encriptado · Sin almacenamiento</span>
                </div>
              </div>
            </div>

          {/* Columna derecha: mockup estático SOLO si aún no hay reporte - OCULTO EN DESKTOP */}
          {!result && (
            <div className="mx-auto max-w-md flex-1 relative lg:hidden">
              {/* Orbes morados detrás del mockup - moviéndose lento */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-60">
                <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] bg-purple-500/30 rounded-full blur-3xl animate-pulse-glow" />
                <div className="absolute bottom-1/3 left-1/4 w-[250px] h-[250px] bg-violet-500/25 rounded-full blur-3xl animate-pulse-glow" style={{animationDelay: '2s'}} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-fuchsia-500/20 rounded-full blur-3xl animate-pulse-glow" style={{animationDelay: '1s'}} />
              </div>

              <div className="relative rounded-3xl border border-violet-500/40 bg-slate-900/80 p-6 shadow-[0_0_80px_rgba(129,140,248,0.6)]">
                {/* Contexto del ejemplo - NUEVO */}
                <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30">
                  <span className="text-lg">📱</span>
                  <p className="text-xs text-purple-200">
                    <span className="font-bold text-white">Ejemplo real:</span> Pareja de 2 años · 14,847 mensajes
                  </p>
                </div>

                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium tracking-wider text-slate-400">
                      PATTERN SCORE
                    </p>
                  </div>
                  <span className="rounded-full border border-violet-400/60 bg-violet-500/30 px-4 py-1.5 text-xs font-semibold text-violet-50">
                    REPORTE DEMO
                  </span>
                </div>

                {/* Gauge Visual - NUEVO */}
                <div className="mb-6 rounded-2xl bg-slate-900/90 px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-slate-400">Balance emocional</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-emerald-400 font-semibold bg-emerald-500/20 px-2 py-0.5 rounded-full">+32% vs mes anterior</span>
                    </div>
                  </div>

                  {/* Gauge semicircular visual */}
                  <div className="relative flex flex-col items-center mb-4">
                    <div className="relative w-40 h-20 overflow-hidden">
                      {/* Fondo del gauge */}
                      <div className="absolute inset-0 rounded-t-full border-[12px] border-slate-700"></div>
                      {/* Progreso del gauge - 83% */}
                      <div
                        className="absolute inset-0 rounded-t-full border-[12px] border-transparent"
                        style={{
                          borderTopColor: '#34d399',
                          borderLeftColor: '#34d399',
                          borderRightColor: '#22d3ee',
                          transform: 'rotate(-90deg)',
                          transformOrigin: 'center bottom'
                        }}
                      ></div>
                      {/* Aguja indicadora */}
                      <div className="absolute bottom-0 left-1/2 w-1 h-16 bg-gradient-to-t from-white to-transparent rounded-full origin-bottom"
                           style={{ transform: 'translateX(-50%) rotate(50deg)' }}></div>
                    </div>
                    <div className="flex items-baseline gap-1 -mt-2">
                      <span className="text-4xl font-black text-white">8.3</span>
                      <span className="text-lg text-slate-500">/10</span>
                    </div>
                  </div>

                  <p className="text-sm text-slate-300 leading-relaxed text-center">
                    Base emocional positiva con momentos de tensión detectados en horarios nocturnos.
                  </p>
                </div>

                <p className="mb-3 text-sm font-medium tracking-wider text-slate-400">
                  PRINCIPALES PATRONES DETECTADOS
                </p>

                <div className="space-y-3">
                  <div className="flex gap-3 rounded-xl bg-slate-900/80 px-4 py-3 border border-slate-800 hover:border-rose-500/30 transition-colors">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center">
                      <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-semibold text-slate-100 text-sm">Picos de ansiedad nocturna</p>
                        <span className="flex-shrink-0 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-200">
                          Emoción
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Conversaciones intensas entre 11:30 pm y 1:00 am con temas delicados.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 rounded-xl bg-slate-900/80 px-4 py-3 border border-slate-800 hover:border-amber-500/30 transition-colors">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                      <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-semibold text-slate-100 text-sm">Desbalance en la iniciativa</p>
                        <span className="flex-shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                          Dinámica
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Una persona inicia el 78% de las conversaciones.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 rounded-xl bg-slate-900/80 px-4 py-3 border border-slate-800 hover:border-emerald-500/30 transition-colors">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                      <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-semibold text-slate-100 text-sm">Momentos de conexión profunda</p>
                        <span className="flex-shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                          Fortaleza
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        12 bloques de alta empatía y vulnerabilidad mutua detectados.
                      </p>
                    </div>
                  </div>

                </div>

                {/* PREVIEW: Chat con la IA - Respuestas IMPRESIONANTES */}
                <div className="mt-5 border-t border-slate-800 pt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-purple-200">Pregúntale a la IA</p>
                      <p className="text-[10px] text-slate-400">3 preguntas incluidas</p>
                    </div>
                  </div>

                  {/* Pregunta 1 - RESPUESTA IMPRESIONANTE */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-end">
                      <div className="rounded-xl rounded-tr-sm bg-gradient-to-r from-emerald-500 to-cyan-500 px-3 py-2 shadow-lg">
                        <p className="text-[11px] font-bold text-slate-950">"¿Quién está más enganchado?"</p>
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="max-w-[95%] rounded-xl rounded-tl-sm bg-gradient-to-br from-purple-950/80 to-slate-900/80 border border-purple-500/40 px-3 py-3 shadow-lg">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 pb-2 border-b border-purple-500/20">
                            <div className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/40">
                              <span className="text-sm font-black text-white">73%</span>
                            </div>
                            <span className="text-[10px] font-bold text-rose-300">más invertido/a</span>
                          </div>
                          <p className="text-[10px] text-slate-200 leading-relaxed">
                            • Inicias el <strong className="text-white">84%</strong> de las conversaciones<br/>
                            • Tus mensajes son <strong className="text-white">3x más largos</strong><br/>
                            • Respondes en <strong className="text-emerald-300">2 min</strong>, él/ella en <strong className="text-rose-300">47 min</strong>
                          </p>
                          <p className="text-[9px] text-yellow-300/80 pt-1 border-t border-slate-700/50">
                            ⚠️ Desequilibrio emocional detectado
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pregunta 2 - RESPUESTA IMPRESIONANTE */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-end">
                      <div className="rounded-xl rounded-tr-sm bg-gradient-to-r from-emerald-500 to-cyan-500 px-3 py-2 shadow-lg">
                        <p className="text-[11px] font-bold text-slate-950">"¿Qué debería cambiar yo?"</p>
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="max-w-[95%] rounded-xl rounded-tl-sm bg-gradient-to-br from-purple-950/80 to-slate-900/80 border border-purple-500/40 px-3 py-3 shadow-lg">
                        <p className="text-[10px] font-bold text-emerald-300 mb-2">💡 3 recomendaciones:</p>
                        <div className="space-y-1.5">
                          <div className="flex items-start gap-2 bg-slate-900/60 rounded px-2 py-1.5">
                            <span className="text-emerald-400 font-bold text-[10px]">1</span>
                            <p className="text-[10px] text-slate-200"><strong className="text-white">Espera</strong> que él/ella inicie las próximas 3 conversaciones</p>
                          </div>
                          <div className="flex items-start gap-2 bg-slate-900/60 rounded px-2 py-1.5">
                            <span className="text-emerald-400 font-bold text-[10px]">2</span>
                            <p className="text-[10px] text-slate-200"><strong className="text-white">Mensajes cortos</strong> para ver si hay reciprocidad</p>
                          </div>
                          <div className="flex items-start gap-2 bg-slate-900/60 rounded px-2 py-1.5">
                            <span className="text-emerald-400 font-bold text-[10px]">3</span>
                            <p className="text-[10px] text-slate-200"><strong className="text-white">Observa</strong> si el interés sube cuando bajas intensidad</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pregunta 3 - RESPUESTA IMPRESIONANTE */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-end">
                      <div className="rounded-xl rounded-tr-sm bg-gradient-to-r from-emerald-500 to-cyan-500 px-3 py-2 shadow-lg">
                        <p className="text-[11px] font-bold text-slate-950">"¿Esta relación tiene futuro?"</p>
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="max-w-[95%] rounded-xl rounded-tl-sm bg-gradient-to-br from-purple-950/80 to-slate-900/80 border border-purple-500/40 px-3 py-3 shadow-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-yellow-400">⚠️</span>
                          <p className="text-[10px] font-bold text-yellow-300">Análisis de compatibilidad</p>
                        </div>
                        <div className="mb-2 p-2 rounded bg-slate-900/60">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-slate-400">PATTERN SCORE</span>
                            <span className="text-sm font-black text-amber-400">5.8<span className="text-[9px] text-slate-500">/10</span></span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-500" style={{ width: '58%' }}></div>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-200">
                          <strong className="text-emerald-300">✓ Puede mejorar</strong> si ambos balancean la comunicación. El chat muestra <strong className="text-white">momentos genuinos</strong> de conexión...
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Call to action */}
                  <div className="p-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-fuchsia-500/20 border border-purple-500/40 text-center shadow-lg">
                    <p className="text-xs text-white font-bold mb-1">
                      🤯 Esto es con TU chat real
                    </p>
                    <p className="text-[10px] text-purple-200">
                      La IA analiza tus mensajes reales · No consejos genéricos
                    </p>
                  </div>

                  <div className="mt-3 text-[10px] text-right text-slate-500">
                    Pattern Labs AI · REPORTE DEMO
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Testimonios para DESKTOP - Solo visible en lg+ */}
          {!result && (
            <div className="hidden lg:flex flex-col gap-5 max-w-md flex-1">
              {/* Testimonio 1 */}
              <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-6 relative shadow-lg">
                <span className="absolute top-3 left-4 text-4xl text-emerald-400/30 font-serif leading-none">"</span>
                <p className="text-sm text-slate-200 italic pl-6 pr-2 leading-relaxed">
                  No tenía idea de que yo siempre iniciaba las peleas de noche
                </p>
                <p className="text-xs text-cyan-400 font-medium mt-3 pl-6">— Ana, 26 años</p>
              </div>

              {/* Testimonio 2 */}
              <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-6 relative shadow-lg">
                <span className="absolute top-3 left-4 text-4xl text-emerald-400/30 font-serif leading-none">"</span>
                <p className="text-sm text-slate-200 italic pl-6 pr-2 leading-relaxed">
                  Nos ayudó a ver que sí estábamos bien, solo necesitábamos hablar más
                </p>
                <p className="text-xs text-cyan-400 font-medium mt-3 pl-6">— Carlos, 31 años</p>
              </div>

              {/* Testimonio 3 */}
              <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-6 relative shadow-lg">
                <span className="absolute top-3 left-4 text-4xl text-emerald-400/30 font-serif leading-none">"</span>
                <p className="text-sm text-slate-200 italic pl-6 pr-2 leading-relaxed">
                  Lo mandé al grupo de amigas y TODAS lo usaron
                </p>
                <p className="text-xs text-cyan-400 font-medium mt-3 pl-6">— Valentina, 24 años</p>
              </div>
            </div>
          )}
          </>
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
                  TU ANÁLISIS
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetAccess}
                    className="flex items-center gap-1.5 rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700 hover:border-slate-500 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Nuevo análisis
                  </button>
                  <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    result.version === 'full'
                      ? 'border-emerald-400/60 bg-emerald-500/30 text-emerald-50'
                      : 'border-violet-400/60 bg-violet-500/30 text-violet-50'
                  }`}>
                    {result.version === 'full' ? 'REPORTE COMPLETO' : 'REPORTE DEMO'}
                  </span>
                </div>
              </div>
              {/* Info del chat - MÁS VISIBLE */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700">
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm font-medium text-slate-200">{result.fileName}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/40">
                  <svg className="w-4 h-4 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  <span className="text-sm font-bold text-purple-200">{result.length.toLocaleString()}</span>
                  <span className="text-xs text-purple-300">caracteres analizados</span>
                </div>
              </div>

              {/* ========== SCORE GAUGE - MOMENTO DE REVELACIÓN ========== */}
              <div className="mb-8">
                <div className="flex flex-col items-center justify-center py-6">
                  {/* SVG Gauge */}
                  <div className="relative w-72 h-44 mb-4">
                    <svg viewBox="0 0 200 120" className="w-full h-full" style={{ overflow: 'visible' }}>
                      {/* Gradient definition */}
                      <defs>
                        <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#ef4444" />
                          <stop offset="50%" stopColor="#eab308" />
                          <stop offset="100%" stopColor="#34d399" />
                        </linearGradient>
                        <linearGradient id="scoreGlowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.5" />
                          <stop offset="50%" stopColor="#eab308" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#34d399" stopOpacity="0.5" />
                        </linearGradient>
                      </defs>
                      {/* Background arc (gray) */}
                      <path
                        d="M 20 100 A 80 80 0 0 1 180 100"
                        fill="none"
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="14"
                        strokeLinecap="round"
                      />
                      {/* Glow effect arc */}
                      <path
                        d="M 20 100 A 80 80 0 0 1 180 100"
                        fill="none"
                        stroke="url(#scoreGlowGradient)"
                        strokeWidth="18"
                        strokeLinecap="round"
                        strokeDasharray="251"
                        strokeDashoffset={251 - (251 * (result.patternScore.value || 7) / 10)}
                        style={{ transition: 'stroke-dashoffset 1.5s ease-out', filter: 'blur(6px)' }}
                      />
                      {/* Filled arc (gradient up to score) */}
                      <path
                        d="M 20 100 A 80 80 0 0 1 180 100"
                        fill="none"
                        stroke="url(#scoreGradient)"
                        strokeWidth="14"
                        strokeLinecap="round"
                        strokeDasharray="251"
                        strokeDashoffset={251 - (251 * (result.patternScore.value || 7) / 10)}
                        style={{ transition: 'stroke-dashoffset 1.5s ease-out' }}
                      />
                      {/* Score number */}
                      <text x="100" y="72" textAnchor="middle" className="fill-white" style={{ fontSize: '42px', fontWeight: 900 }}>
                        {(result.patternScore.value || 7).toFixed(1)}
                      </text>
                      <text x="100" y="95" textAnchor="middle" className="fill-slate-400" style={{ fontSize: '16px', fontWeight: 500 }}>
                        de 10
                      </text>
                    </svg>
                  </div>

                  {/* Contextual label badge */}
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 ${
                    (result.patternScore.value || 7) >= 9 ? 'bg-emerald-500/20 border border-emerald-400/50' :
                    (result.patternScore.value || 7) >= 7 ? 'bg-green-500/20 border border-green-400/50' :
                    (result.patternScore.value || 7) >= 4 ? 'bg-amber-500/20 border border-amber-400/50' :
                    'bg-red-500/20 border border-red-400/50'
                  }`}>
                    <span className={`text-lg ${
                      (result.patternScore.value || 7) >= 9 ? 'text-emerald-300' :
                      (result.patternScore.value || 7) >= 7 ? 'text-green-300' :
                      (result.patternScore.value || 7) >= 4 ? 'text-amber-300' :
                      'text-red-300'
                    }`}>
                      {(result.patternScore.value || 7) >= 9 ? '🌟' :
                       (result.patternScore.value || 7) >= 7 ? '✅' :
                       (result.patternScore.value || 7) >= 4 ? '⚡' : '⚠️'}
                    </span>
                    <span className={`text-sm font-bold ${
                      (result.patternScore.value || 7) >= 9 ? 'text-emerald-200' :
                      (result.patternScore.value || 7) >= 7 ? 'text-green-200' :
                      (result.patternScore.value || 7) >= 4 ? 'text-amber-200' :
                      'text-red-200'
                    }`}>
                      {(result.patternScore.value || 7) >= 9 ? 'Excepcional' :
                       (result.patternScore.value || 7) >= 7 ? 'Saludable' :
                       (result.patternScore.value || 7) >= 4 ? 'En desarrollo' : 'Necesita atención'}
                    </span>
                  </div>

                  {/* Interpretation text */}
                  {result.patternScore.interpretation && (
                    <p className="text-center text-sm text-slate-300 leading-relaxed max-w-lg">
                      {result.patternScore.interpretation}
                    </p>
                  )}

                  {/* Access badge - moved here for visibility */}
                  {hasAccess && (
                    <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-xs font-semibold text-emerald-300">Acceso completo · Preguntas: {credits}/3</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status messages */}
              {result.truncated && !hasAccess && (
                <div className="mb-2 p-2 rounded-lg bg-gradient-to-r from-purple-500/10 to-fuchsia-500/10 border border-purple-500/30">
                  <p className="text-xs text-purple-200 flex items-center gap-2">
                    <span>📊</span>
                    <span>
                      <strong>Demo:</strong> Analizados los últimos {result.processedLength?.toLocaleString()} caracteres.
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={handleCheckoutSingle}
                    className="mt-1.5 text-[11px] font-bold text-purple-300 hover:text-purple-200 flex items-center gap-1 transition-colors"
                  >
                    <span>🚀</span>
                    <span>Desbloquea Pro para analizar millones de caracteres →</span>
                  </button>
                </div>
              )}
              {!hasAccess && !result.truncated && (
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

            {/* ========== EXECUTIVE SUMMARY - TL;DR ========== */}
            {result.patterns && result.patterns.length > 0 && (
              <div className="mb-8 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950/90 border border-slate-700/50 p-5 relative overflow-hidden">
                {/* Subtle background orb */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">📋</span>
                    <h3 className="text-sm font-bold text-slate-100">Resumen de tu relación</h3>
                  </div>

                  {/* TL;DR text - use from backend if available, or generate summary */}
                  {result.tlDr && result.tlDr.length > 0 ? (
                    <p className="text-sm text-slate-300 leading-relaxed mb-5">
                      {result.tlDr.join(' ')}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-300 leading-relaxed mb-5">
                      Tu conversación tiene {result.patterns.filter(p => p.category === 'Fortaleza').length} fortaleza{result.patterns.filter(p => p.category === 'Fortaleza').length !== 1 ? 's' : ''}, {result.patterns.filter(p => p.category === 'Riesgo').length} área{result.patterns.filter(p => p.category === 'Riesgo').length !== 1 ? 's' : ''} de atención y {result.patterns.filter(p => p.category === 'Dinámica' || p.category === 'Emoción').length} dinámica{result.patterns.filter(p => p.category === 'Dinámica' || p.category === 'Emoción').length !== 1 ? 's' : ''} clave{result.patterns.filter(p => p.category === 'Dinámica' || p.category === 'Emoción').length !== 1 ? 's' : ''}.
                    </p>
                  )}

                  {/* Category counters */}
                  <div className="grid grid-cols-3 gap-3">
                    {/* Fortalezas */}
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.querySelector('[data-category="Fortaleza"]');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      className="flex flex-col items-center p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all cursor-pointer group"
                    >
                      <span className="text-2xl font-black text-emerald-300 group-hover:scale-110 transition-transform">
                        {result.patterns.filter(p => p.category === 'Fortaleza').length}
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-200/80 flex items-center gap-1">
                        <span>💚</span> Fortalezas
                      </span>
                    </button>

                    {/* Dinámicas/Emociones */}
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.querySelector('[data-category="Dinámica"], [data-category="Emoción"]');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      className="flex flex-col items-center p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50 transition-all cursor-pointer group"
                    >
                      <span className="text-2xl font-black text-amber-300 group-hover:scale-110 transition-transform">
                        {result.patterns.filter(p => p.category === 'Dinámica' || p.category === 'Emoción').length}
                      </span>
                      <span className="text-[10px] font-semibold text-amber-200/80 flex items-center gap-1">
                        <span>🟡</span> Dinámicas
                      </span>
                    </button>

                    {/* Riesgos */}
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.querySelector('[data-category="Riesgo"]');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      className="flex flex-col items-center p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 hover:border-rose-500/50 transition-all cursor-pointer group"
                    >
                      <span className="text-2xl font-black text-rose-300 group-hover:scale-110 transition-transform">
                        {result.patterns.filter(p => p.category === 'Riesgo').length}
                      </span>
                      <span className="text-[10px] font-semibold text-rose-200/80 flex items-center gap-1">
                        <span>🔴</span> Atención
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ========== Main Patterns - PREMIUM VISUAL HIERARCHY ========== */}
            <div className="mb-6">
              <p className="mb-4 text-sm font-medium tracking-wider text-slate-400 uppercase">
                PATRONES DETECTADOS
              </p>

              <div className="space-y-4">
                {result.patterns && [...result.patterns]
                  // In demo mode, only show first 3 patterns (rest are for blurred preview)
                  .slice(0, hasAccess ? undefined : 3)
                  // Sort: Riesgo first, then Dinámica/Emoción, then Fortaleza
                  .sort((a, b) => {
                    const order: Record<string, number> = { Riesgo: 0, Emoción: 1, Dinámica: 2, Fortaleza: 3 };
                    return (order[a.category] ?? 2) - (order[b.category] ?? 2);
                  })
                  .map((pattern, idx) => {
                  // Category-specific styling
                  const categoryStyles: Record<string, { badge: string; border: string; bg: string; borderColor: string }> = {
                    Emoción: {
                      badge: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40',
                      border: 'border-l-cyan-400',
                      bg: 'bg-cyan-500/5',
                      borderColor: 'border-slate-800 hover:border-cyan-500/40'
                    },
                    Dinámica: {
                      badge: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
                      border: 'border-l-amber-400',
                      bg: 'bg-amber-500/5',
                      borderColor: 'border-slate-800 hover:border-amber-500/40'
                    },
                    Fortaleza: {
                      badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
                      border: 'border-l-emerald-400',
                      bg: 'bg-emerald-500/5',
                      borderColor: 'border-slate-800 hover:border-emerald-500/40'
                    },
                    Riesgo: {
                      badge: 'bg-rose-500/20 text-rose-200 border-rose-500/40',
                      border: 'border-l-rose-400',
                      bg: 'bg-rose-500/5',
                      borderColor: 'border-slate-800 hover:border-rose-500/40'
                    },
                  };
                  const styles = categoryStyles[pattern.category] || categoryStyles.Dinámica;

                  return (
                    <div
                      key={idx}
                      data-category={pattern.category}
                      className={`rounded-xl ${styles.bg} px-5 py-4 border ${styles.borderColor} border-l-4 ${styles.border} transition-all duration-300 hover:shadow-lg hover:scale-[1.005] animate-fade-in`}
                      style={{ animationDelay: `${idx * 100}ms` }}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="font-semibold text-slate-100 text-sm leading-tight">
                          {pattern.title}
                        </p>
                        <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold border ${styles.badge}`}>
                          {pattern.category}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {pattern.description}
                      </p>
                      {/* Evidence quote - PREMIUM STYLING */}
                      {pattern.evidence && (
                        <div className="mt-3 relative">
                          <div className="rounded-lg bg-white/5 border-l-4 border-cyan-400/60 p-4 relative overflow-hidden">
                            {/* Decorative quote mark */}
                            <span className="absolute top-1 left-2 text-4xl text-cyan-400/20 font-serif leading-none select-none">"</span>
                            <p className="text-sm text-slate-200 italic pl-4 relative z-10">
                              {pattern.evidence}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* ============================================= */}
                {/* DEMO IRRESISTIBLE - CONTENIDO CON BLUR FOMO */}
                {/* ============================================= */}
                {!hasAccess && result.patterns && result.patterns.length > 3 && (
                  <>
                    {/* PATRONES BLOQUEADOS - TÍTULOS VISIBLES, DESCRIPCIÓN BLURREADA */}
                    <div className="relative mt-2">
                      {/* Label flotante */}
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-xs font-bold text-white shadow-lg shadow-purple-500/50 whitespace-nowrap flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                        </span>
                        +{result.patterns.length - 3 + 2} patrones detectados en TU chat
                      </div>

                      {/* Patrones con título visible y descripción con gradient blur real */}
                      <div className="space-y-3 pt-4">
                        {result.patterns.slice(3).map((pattern, idx) => {
                          // Category-specific styling for locked patterns
                          const catColors: Record<string, string> = {
                            Riesgo: 'bg-rose-500/20 text-rose-200 border-rose-500/30',
                            Emoción: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/30',
                            Dinámica: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
                            Fortaleza: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
                          };
                          const catColor = catColors[pattern.category] || catColors.Dinámica;

                          return (
                          <div
                            key={idx}
                            className="rounded-xl bg-slate-900/80 px-4 py-3 border border-slate-800 relative overflow-hidden group hover:border-purple-500/50 transition-all cursor-pointer"
                            onClick={() => handleLockedPatternClick(pattern.title)}
                          >
                            {/* Hover overlay - "Desbloquear" */}
                            <div className="absolute inset-0 bg-purple-950/90 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center z-20">
                              <span className="flex items-center gap-2 text-sm font-bold text-purple-200">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Desbloquear
                              </span>
                            </div>

                            {/* Título y categoría 100% VISIBLES */}
                            <div className="flex items-center justify-between mb-2 relative z-10">
                              <p className="font-bold text-white text-sm">{pattern.title}</p>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold border ${catColor}`}>
                                {pattern.category}
                              </span>
                            </div>

                            {/* Descripción con BLUR REAL estilo Silicon Valley */}
                            <div className="relative overflow-hidden">
                              {/* Texto con blur real aplicado */}
                              <div className="flex flex-wrap">
                                {/* Primeras palabras visibles */}
                                <span className="text-sm text-slate-300">
                                  {pattern.description.split(' ').slice(0, 5).join(' ')}
                                </span>
                                {/* Resto con blur real */}
                                <span
                                  className="text-sm text-slate-300 ml-1"
                                  style={{
                                    filter: 'blur(4px)',
                                    userSelect: 'none',
                                    WebkitUserSelect: 'none'
                                  }}
                                >
                                  {pattern.description.split(' ').slice(5, 15).join(' ')}
                                </span>
                              </div>
                              {/* Gradient fade final */}
                              <div
                                className="absolute right-0 top-0 bottom-0 w-16 pointer-events-none"
                                style={{
                                  background: 'linear-gradient(to right, transparent, rgb(15, 23, 42))'
                                }}
                              />
                            </div>

                            {/* "Incluido en Pro" - clickeable */}
                            <div className="mt-1 flex items-center justify-end relative z-10">
                              <span className="text-[10px] text-purple-400 font-medium flex items-center gap-1 hover:text-purple-300 transition-colors">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                Incluido en Pro
                              </span>
                            </div>
                          </div>
                        )})}
                        {/* Contador de más patrones */}
                        <div className="flex items-center justify-center gap-2 py-2 text-sm text-purple-300">
                          <span>...y 2 patrones más</span>
                          <svg className="w-4 h-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* INSIGHTS BLOQUEADOS - VERSIÓN COMPACTA - CLICKEABLES */}
                    <div className="mt-4 flex gap-3">
                      <div
                        className="flex-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 relative cursor-pointer hover:border-emerald-500/60 hover:bg-emerald-500/15 transition-all group"
                        onClick={() => handleLockedPatternClick('3 Fortalezas de tu relación')}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-emerald-400 text-sm">✓</span>
                          <p className="text-xs font-bold text-emerald-300">3 Fortalezas detectadas</p>
                        </div>
                        <p className="text-[10px] text-slate-400">Comunicación, resolución de conflictos...</p>
                        <span className="absolute top-2 right-2 text-[9px] text-purple-400 group-hover:text-purple-300">🔒 Pro</span>
                      </div>
                      <div
                        className="flex-1 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 relative cursor-pointer hover:border-amber-500/60 hover:bg-amber-500/15 transition-all group"
                        onClick={() => handleLockedPatternClick('2 Áreas de atención en tu relación')}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-amber-400 text-sm">⚠</span>
                          <p className="text-xs font-bold text-amber-300">2 Áreas de atención</p>
                        </div>
                        <p className="text-[10px] text-slate-400">Silencios, desequilibrio en inicio...</p>
                        <span className="absolute top-2 right-2 text-[9px] text-purple-400 group-hover:text-purple-300">🔒 Pro</span>
                      </div>
                    </div>

                    {/* CHAT IA INTERACTIVO - PREGUNTA GRATIS - OPTIMIZADO PARA CONVERSIÓN */}
                    <div className="mt-6 rounded-2xl border border-purple-500/40 bg-gradient-to-br from-purple-950/60 to-slate-900/80 p-5 relative overflow-hidden">
                      <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/30 rounded-full blur-3xl pointer-events-none" />

                      <div className="relative z-10">
                        {/* Header con contexto de mensajes analizados */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-purple-500/40">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-white">Pregúntale lo que quieras a la IA</p>
                            <p className="text-xs text-purple-300">
                              {demoAsked
                                ? `🔮 Analizó ${result.length.toLocaleString()} caracteres para responder`
                                : 'La IA leyó tu conversación completa'
                              }
                            </p>
                          </div>
                          {!demoAsked && (
                            <div className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40">
                              <span className="text-[10px] font-bold text-purple-300">✨ PRO</span>
                            </div>
                          )}
                        </div>

                        {/* Estado: Input para hacer pregunta */}
                        {!demoAsked && !demoLoading && (
                          <>
                            {/* Sugerencias clickeables */}
                            <div className="mb-3 flex flex-wrap gap-2">
                              {[
                                "¿Me quiere de verdad?",
                                "¿Quién está más enganchado?",
                                "¿Debería preocuparme?",
                              ].map((q, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setDemoQuestion(q)}
                                  className="px-3 py-1.5 rounded-full bg-slate-800/80 border border-purple-500/30 text-xs text-slate-300 hover:border-purple-500/60 hover:bg-slate-700/80 transition-all"
                                >
                                  "{q}"
                                </button>
                              ))}
                            </div>

                            {/* Input */}
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={demoQuestion}
                                onChange={(e) => setDemoQuestion(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleDemoAsk()}
                                className="flex-1 rounded-xl border border-purple-500/30 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50"
                                placeholder="Escribe tu pregunta aquí..."
                              />
                              <button
                                type="button"
                                onClick={handleDemoAsk}
                                disabled={!demoQuestion.trim()}
                                className="px-5 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 text-sm font-bold text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Preguntar
                              </button>
                            </div>
                          </>
                        )}

                        {/* Estado: Loading dramático */}
                        {demoLoading && (
                          <div className="py-6">
                            <div className="flex justify-end mb-3">
                              <div className="rounded-xl rounded-tr-sm bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 shadow-lg max-w-[85%]">
                                <p className="text-sm font-bold text-slate-950">"{savedDemoQuestion}"</p>
                              </div>
                            </div>
                            <div className="flex justify-start">
                              <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-purple-950/60 border border-purple-500/40">
                                <div className="flex gap-1">
                                  <div className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                                  <div className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                                  <div className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                                </div>
                                <span className="text-sm text-purple-200">Analizando {result.length.toLocaleString()} caracteres...</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ========================================== */}
                        {/* RESPUESTA BLURREADA - SUPER CONVERSIÓN */}
                        {/* ========================================== */}
                        {demoAsked && !demoLoading && (
                          <div className="space-y-4">
                            {/* Pregunta del usuario */}
                            <div className="flex justify-end">
                              <div className="rounded-xl rounded-tr-sm bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 shadow-lg max-w-[85%]">
                                <p className="text-sm font-bold text-slate-950">"{savedDemoQuestion}"</p>
                              </div>
                            </div>

                            {/* MEGA CARD DE CONVERSIÓN */}
                            <div id="unlock-cta" className="rounded-3xl border-2 border-purple-500/60 bg-gradient-to-br from-slate-900 via-purple-950/40 to-slate-900 shadow-[0_0_60px_rgba(168,85,247,0.3)] overflow-hidden relative">
                              {/* Glow animado de fondo */}
                              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-fuchsia-500/10 to-purple-500/10 animate-gradient" />

                              {/* Contenido blurreado - más dramático */}
                              <div className="p-5 relative">
                                <div className="space-y-3 select-none">
                                  <p className="text-base text-slate-200" style={{ filter: 'blur(2px)', opacity: 0.9 }}>
                                    <strong className="text-white text-lg">Según el análisis de tu conversación,</strong> tu relación muestra señales de...
                                  </p>
                                  <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40" style={{ filter: 'blur(3px)' }}>
                                    <span className="text-3xl font-black text-rose-400">73%</span>
                                    <span className="text-sm text-rose-200">de inversión emocional detectada</span>
                                  </div>
                                  <p className="text-sm text-slate-300" style={{ filter: 'blur(4px)' }}>
                                    • El patrón principal muestra una dinámica de apego que...
                                  </p>
                                </div>
                                {/* Overlay gradient */}
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/95 to-slate-900/60 pointer-events-none" />
                              </div>

                              {/* ====== ZONA DE CONVERSIÓN - MÁXIMO IMPACTO ====== */}
                              <div className="px-5 pb-6 pt-2 relative z-10">
                                {/* Header de desbloqueo */}
                                <div className="text-center mb-5">
                                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 mb-3">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    <span className="text-sm font-bold text-emerald-300">Tu respuesta está lista</span>
                                  </div>
                                  <h3 className="text-xl font-extrabold text-white mb-1">Desbloquea tu análisis PRO</h3>
                                </div>

                                {/* BENEFICIOS - CARDS GRANDES Y LLAMATIVAS */}
                                <div className="grid grid-cols-3 gap-3 mb-5">
                                  {/* Card 1: Respuesta */}
                                  <div className="flex flex-col items-center p-3 rounded-xl bg-gradient-to-b from-purple-500/20 to-purple-500/5 border border-purple-500/40 shadow-lg shadow-purple-500/10">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-purple-500/30 mb-2">
                                      <span className="text-xl">💬</span>
                                    </div>
                                    <span className="text-xs font-bold text-white text-center">Respuesta</span>
                                    <span className="text-[10px] text-purple-300 text-center">completa</span>
                                  </div>

                                  {/* Card 2: Preguntas IA */}
                                  <div className="flex flex-col items-center p-3 rounded-xl bg-gradient-to-b from-cyan-500/20 to-cyan-500/5 border border-cyan-500/40 shadow-lg shadow-cyan-500/10">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/30 mb-2">
                                      <span className="text-xl">🎯</span>
                                    </div>
                                    <span className="text-xs font-bold text-white text-center">3 preguntas</span>
                                    <span className="text-[10px] text-cyan-300 text-center">a la IA</span>
                                  </div>

                                  {/* Card 3: Patrones */}
                                  <div className="flex flex-col items-center p-3 rounded-xl bg-gradient-to-b from-emerald-500/20 to-emerald-500/5 border border-emerald-500/40 shadow-lg shadow-emerald-500/10">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-2">
                                      <span className="text-xl">📊</span>
                                    </div>
                                    <span className="text-xs font-bold text-white text-center">8 patrones</span>
                                    <span className="text-[10px] text-emerald-300 text-center">detectados</span>
                                  </div>
                                </div>

                                {/* BOTÓN CTA MEGA */}
                                <button
                                  onClick={handleCheckoutSingle}
                                  disabled={isPaying}
                                  className="w-full inline-flex flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 px-6 py-5 font-extrabold text-slate-950 hover:shadow-[0_0_40px_rgba(52,211,153,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-2xl shadow-emerald-500/50 disabled:opacity-60 relative overflow-hidden group btn-glow"
                                >
                                  <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                                  <span className="relative z-10 flex items-center gap-2 text-xl">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    {isPaying ? 'Procesando...' : 'Ver mi análisis — $49'}
                                  </span>
                                  <span className="relative z-10 text-sm font-medium text-slate-700/80 line-through">$99 MXN</span>
                                </button>

                                {/* Trust badges */}
                                <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-400">
                                  <span className="flex items-center gap-1.5">
                                    <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <span>Pago único</span>
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                    </svg>
                                    <span>100% seguro</span>
                                  </span>
                                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    847 análisis hoy
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                  </>
                )}
              </div>
            </div>

            {/* Deep Sections - PAID ONLY */}
            {result.sections && result.sections.length > 0 && (
              <div className="space-y-2 mb-6">
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
            <div className="border-t border-slate-800 pt-6 chat-input-container">
              <ChatBox
                analysis={result.rawAnalysis ?? ''}
                fullChat={result.fullChat ?? ''}
                chatStats={result.chatStats}
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

            {/* CTA final - diferente según si tiene acceso o no */}
            {hasAccess ? (
              <div className="text-center rounded-2xl bg-gradient-to-r from-emerald-950/60 to-cyan-950/60 border border-emerald-500/40 p-8">
                <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-emerald-500/20 border border-emerald-500/40">
                  <svg className="w-5 h-5 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-bold text-emerald-200">¡Ya tienes acceso!</span>
                </div>
                <p className="text-2xl md:text-3xl font-bold text-white mb-3">
                  Sube tu chat y empieza a preguntar
                </p>
                <p className="text-slate-300 mb-5 max-w-md mx-auto">
                  Tienes <strong className="text-emerald-300">{credits} preguntas</strong> disponibles para hacerle a la IA sobre tu relación
                </p>
                <button
                  type="button"
                  onClick={openUploadModal}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 py-3.5 text-base font-bold text-slate-950 shadow-2xl shadow-emerald-500/40 hover:shadow-emerald-500/60 hover:scale-105 active:scale-95 transition-all duration-300"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>Subir chat ahora</span>
                </button>
              </div>
            ) : (
              <div className="text-center rounded-2xl bg-gradient-to-r from-purple-950/60 to-fuchsia-950/60 border border-purple-500/40 p-8">
                <p className="text-2xl md:text-3xl font-bold text-white mb-3">
                  Todo esto por <span className="text-purple-300">MX$49</span>
                </p>
                <p className="text-slate-300 mb-5 max-w-md mx-auto">
                  Reporte completo + <strong className="text-white">3 preguntas a la IA</strong> que conoce TODO tu chat
                </p>
                <button
                  type="button"
                  onClick={handleCheckoutSingle}
                  disabled={isPaying}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 px-8 py-3.5 text-base font-bold text-white shadow-2xl shadow-purple-500/40 hover:shadow-purple-500/60 hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-60"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>{isPaying ? 'Redirigiendo...' : 'Desbloquear análisis pro'}</span>
                </button>
                <p className="text-xs text-slate-500 mt-3">Pago único • Sin suscripciones</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ========== SOCIAL PROOF SECTION ========== */}
      <section id="social-proof" className="mx-auto mt-10 mb-10 max-w-6xl px-6">
        <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-950/90 p-8 md:p-12 relative overflow-hidden">
          {/* Orbes de fondo */}
          <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-[350px] h-[350px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            {/* Stats Row - Counters animados */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
              <div className="text-center p-4 rounded-2xl bg-slate-900/50 border border-slate-800">
                <p className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 animate-pulse">
                  47K+
                </p>
                <p className="text-sm text-slate-400 mt-1">Chats analizados</p>
              </div>
              <div className="text-center p-4 rounded-2xl bg-slate-900/50 border border-slate-800">
                <p className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-fuchsia-400 animate-pulse" style={{animationDelay: '0.2s'}}>
                  132K+
                </p>
                <p className="text-sm text-slate-400 mt-1">Preguntas a la IA</p>
              </div>
              <div className="text-center p-4 rounded-2xl bg-slate-900/50 border border-slate-800">
                <p className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400 animate-pulse" style={{animationDelay: '0.4s'}}>
                  4.9★
                </p>
                <p className="text-sm text-slate-400 mt-1">Satisfacción</p>
              </div>
              <div className="text-center p-4 rounded-2xl bg-slate-900/50 border border-slate-800">
                <p className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-sky-400 animate-pulse" style={{animationDelay: '0.6s'}}>
                  30s
                </p>
                <p className="text-sm text-slate-400 mt-1">Tiempo promedio</p>
              </div>
            </div>

            {/* Testimonials */}
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-white mb-2">Lo que dicen nuestros usuarios</h3>
              <p className="text-sm text-slate-400">Historias reales de personas que usaron Pattern Labs AI</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Testimonial 1 */}
              <div className="rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-slate-800 p-5 hover:border-purple-500/30 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white font-bold text-sm">
                    M
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">María G.</p>
                    <p className="text-xs text-slate-500">CDMX · hace 2 días</p>
                  </div>
                  <div className="ml-auto flex gap-0.5">
                    {[1,2,3,4,5].map(i => (
                      <svg key={i} className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed italic">
                  "Le pregunté si él estaba más enamorado que yo. La IA me dio datos que ni yo había notado: yo inicio el 84% de las conversaciones."
                </p>
                <div className="mt-3 pt-3 border-t border-slate-800">
                  <span className="text-[10px] text-emerald-400 font-medium">✓ Pareja de 3 años · 28k mensajes</span>
                </div>
              </div>

              {/* Testimonial 2 */}
              <div className="rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-slate-800 p-5 hover:border-purple-500/30 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center text-white font-bold text-sm">
                    J
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Jorge L.</p>
                    <p className="text-xs text-slate-500">Monterrey · hace 5 días</p>
                  </div>
                  <div className="ml-auto flex gap-0.5">
                    {[1,2,3,4,5].map(i => (
                      <svg key={i} className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed italic">
                  "Descubrí que nuestras peleas siempre empiezan después de las 11pm. Ahora evitamos hablar temas importantes de noche."
                </p>
                <div className="mt-3 pt-3 border-t border-slate-800">
                  <span className="text-[10px] text-emerald-400 font-medium">✓ Casados 5 años · 52k mensajes</span>
                </div>
              </div>

              {/* Testimonial 3 */}
              <div className="rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-slate-800 p-5 hover:border-purple-500/30 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                    A
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Ana P.</p>
                    <p className="text-xs text-slate-500">Guadalajara · hace 1 semana</p>
                  </div>
                  <div className="ml-auto flex gap-0.5">
                    {[1,2,3,4,5].map(i => (
                      <svg key={i} className={`w-3.5 h-3.5 ${i <= 4 ? 'text-amber-400' : 'text-slate-600'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed italic">
                  "Me ayudó a ver que él sí muestra cariño, solo que de forma diferente. La IA me dio ejemplos exactos de su chat."
                </p>
                <div className="mt-3 pt-3 border-t border-slate-800">
                  <span className="text-[10px] text-emerald-400 font-medium">✓ Novios 1 año · 8k mensajes</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-10 text-center">
              <button
                type="button"
                onClick={openUploadModal}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 px-8 py-4 text-base font-bold text-white shadow-xl shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <span>Analiza tu chat ahora</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </button>
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
            <div id="real-examples" className="rounded-2xl border border-purple-500/30 bg-slate-900/60 p-6 md:p-8 scroll-mt-8">
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

            {/* CTA Final - diferente según si tiene acceso o no */}
            <div className="mt-12 text-center">
              {hasAccess ? (
                <>
                  <div className="inline-flex items-center gap-3 mb-6 px-6 py-3 rounded-full bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/50 shadow-lg">
                    <svg className="w-7 h-7 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-lg font-bold text-emerald-200">¡Ya tienes acceso completo!</span>
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-white mb-4">
                    Todo esto está listo para TU chat
                  </p>
                  <p className="text-slate-300 mb-6 text-lg">
                    Tienes <span className="text-2xl font-bold text-emerald-300">{credits} preguntas</span> listas para usar
                  </p>
                  <button
                    type="button"
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-10 py-5 text-xl font-bold text-slate-950 shadow-2xl shadow-emerald-500/40 hover:shadow-emerald-500/60 hover:scale-105 active:scale-95 transition-all duration-300"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>Subir mi chat ahora</span>
                  </button>
                </>
              ) : (
                <>
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
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-8 py-4 text-lg font-bold text-slate-950 hover:shadow-xl hover:shadow-emerald-500/40 hover:scale-105 active:scale-95 transition-all duration-300 disabled:opacity-60"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>{isPaying ? 'Redirigiendo...' : 'Desbloquear análisis pro'}</span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-4">Pago único MX$49 • Sin suscripciones</p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ========== TABLA COMPARATIVA FREE VS PRO ========== */}
      <section id="pricing-comparison" className="mx-auto mt-10 max-w-5xl px-6 pb-16">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 md:p-12 shadow-[0_0_60px_rgba(15,23,42,0.9)] relative overflow-hidden">
          {/* Orbes de fondo */}
          <div className="absolute -top-20 -left-20 w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -right-20 w-[250px] h-[250px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            {/* Header */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4">
                <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
                <span className="text-sm font-semibold text-purple-300">Compara planes</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Demo Gratis vs Análisis Pro
              </h2>
              <p className="max-w-2xl mx-auto text-slate-300">
                Prueba gratis sin compromiso. Si te convence, desbloquea todo el poder del análisis.
              </p>
            </div>

            {/* Tabla comparativa */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Columna FREE */}
              <div className="rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800/40 to-slate-900/60 p-6">
                <div className="mb-6">
                  <span className="inline-block px-3 py-1 rounded-full bg-slate-700 text-slate-300 text-xs font-semibold mb-3">
                    DEMO GRATIS
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white">$0</span>
                    <span className="text-slate-500">MXN</span>
                  </div>
                  <p className="text-sm text-slate-400 mt-2">Para probar sin compromiso</p>
                </div>

                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-slate-300">Pattern Score general</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-slate-300">3 patrones detectados</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-slate-300">Interpretación básica</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-slate-500">Sin chat con IA</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-slate-500">Sin evidencia con citas</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-slate-500">Sin fortalezas/riesgos</span>
                  </li>
                </ul>

                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 transition-all"
                >
                  Probar demo gratis
                </button>
              </div>

              {/* Columna PRO */}
              <div className="rounded-2xl border-2 border-emerald-500/50 bg-gradient-to-br from-emerald-950/40 to-slate-900/80 p-6 relative shadow-xl shadow-emerald-500/10">
                {/* Badge popular */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-xs font-bold text-slate-900 shadow-lg">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    MÁS POPULAR
                  </span>
                </div>

                <div className="mb-6 mt-2">
                  <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold mb-3">
                    ANÁLISIS PRO
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white">$49</span>
                    <span className="text-slate-500">MXN</span>
                  </div>
                  <p className="text-sm text-emerald-300/80 mt-2">Pago único · Sin suscripciones</p>
                </div>

                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-slate-200"><strong className="text-white">Pattern Score</strong> con interpretación profunda</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-slate-200"><strong className="text-white">8 patrones</strong> detectados con evidencia</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-slate-200"><strong className="text-white">Citas textuales</strong> de tu chat como evidencia</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-slate-200"><strong className="text-white">Fortalezas</strong> y áreas de mejora</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="relative">
                      <svg className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="absolute -top-1 -right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                      </span>
                    </div>
                    <span className="text-sm text-slate-200"><strong className="text-purple-300">3 preguntas a la IA</strong> sobre tu chat</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-slate-200"><strong className="text-white">100% privado</strong> · No almacenamos tu chat</span>
                  </li>
                </ul>

                {hasAccess ? (
                  <>
                    <button
                      type="button"
                      onClick={openUploadModal}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-bold text-slate-900 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-500 hover:to-cyan-500 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Subir chat
                    </button>
                    <p className="text-[10px] text-center text-emerald-400 mt-3 flex items-center justify-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Ya tienes acceso PRO activado
                    </p>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleCheckoutSingle}
                      disabled={isPaying}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-4 text-base font-bold text-slate-900 bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-500 hover:to-cyan-500 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      {isPaying ? 'Redirigiendo a pago...' : 'Desbloquear análisis pro'}
                    </button>
                    <p className="text-[10px] text-center text-slate-500 mt-3">
                      Pago seguro con Stripe · Satisfacción garantizada
                    </p>
                  </>
                )}
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

      {/* ========== MOBILE STICKY CTA BAR - PRE-RESULTADO ========== */}
      {!hasAccess && !result && !demoAsked && (
        <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
          {/* Gradient fade */}
          <div className="h-6 bg-gradient-to-t from-slate-950 to-transparent" />
          {/* CTA bar */}
          <div className="bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 px-4 py-3 safe-area-inset-bottom">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">Analiza tu relación</p>
                <p className="text-[10px] text-slate-400">Demo gratis · 30 segundos</p>
              </div>
              <button
                type="button"
                onClick={openUploadModal}
                className="flex-shrink-0 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg shadow-emerald-500/30"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Empezar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MOBILE STICKY CTA BAR - POST-PREGUNTA (CONVERSIÓN) - REENCUADRE VALOR ========== */}
      {!hasAccess && result && demoAsked && (
        <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
          {/* Gradient fade */}
          <div className="h-8 bg-gradient-to-t from-slate-950 to-transparent" />
          {/* CTA bar - Reencuadrado como "Análisis Pro" */}
          <div className="bg-gradient-to-r from-slate-950/98 via-purple-950/95 to-slate-950/98 backdrop-blur-lg border-t border-purple-500/40 px-4 py-3 safe-area-inset-bottom shadow-[0_-10px_40px_rgba(168,85,247,0.3)]">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate flex items-center gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Tu análisis Pro está listo
                </p>
                <p className="text-[10px] text-purple-300">Respuesta + 2 preguntas + patrones</p>
              </div>
              <button
                type="button"
                onClick={handleCheckoutSingle}
                disabled={isPaying}
                className="flex-shrink-0 inline-flex flex-col items-center gap-0 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 px-4 py-2 font-bold text-slate-900 shadow-lg shadow-emerald-500/40 hover:shadow-emerald-500/60 active:scale-95 transition-all disabled:opacity-60"
              >
                <span className="text-sm flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {isPaying ? '...' : '$49'}
                </span>
                <span className="text-[9px] text-slate-600 line-through">$99</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Padding para compensar el sticky bar en mobile */}
      {!hasAccess && !result && !demoAsked && (
        <div className="h-20 lg:hidden" />
      )}
      {!hasAccess && result && demoAsked && (
        <div className="h-24 lg:hidden" />
      )}

      {/* ========== MODAL DE SUBIDA DE CHAT ========== */}
      {showUploadModal && (
        <div
          className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isUploading) closeUploadModal();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !isUploading) closeUploadModal();
          }}
        >
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />

          {/* Modal */}
          <div className="relative w-full max-w-lg lg:max-w-xl bg-gradient-to-b from-slate-900 to-slate-950 rounded-t-3xl lg:rounded-2xl shadow-2xl shadow-black/50 border border-slate-800 overflow-hidden animate-slide-up lg:animate-scale-in max-h-[90vh] overflow-y-auto">
            {/* Botón cerrar */}
            {!isUploading && (
              <button
                onClick={closeUploadModal}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            {/* ===== ESTADO: SELECCIÓN DE ARCHIVO ===== */}
            {!showProgressBar && (
              <div className="p-6 lg:p-8">
                {/* Header */}
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30 mb-4">
                    <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">Sube tu chat de WhatsApp</h2>
                  <p className="text-sm text-slate-400">Arrastra el archivo .txt o .zip, o haz clic para seleccionar</p>
                </div>

                {/* Zona de Drag & Drop */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => modalFileInputRef.current?.click()}
                  className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 ${
                    isDragging
                      ? 'border-cyan-400 bg-cyan-500/10 scale-[1.02]'
                      : fileToUpload
                      ? 'border-emerald-500/50 bg-emerald-500/5'
                      : 'border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800/50'
                  }`}
                >
                  {/* Animación de borde "marching ants" */}
                  <div className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden">
                    <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                      <rect
                        x="1" y="1"
                        width="calc(100% - 2px)" height="calc(100% - 2px)"
                        rx="16" ry="16"
                        fill="none"
                        stroke={isDragging ? 'rgb(34, 211, 238)' : 'transparent'}
                        strokeWidth="2"
                        strokeDasharray="8 4"
                        className="animate-marching-ants"
                      />
                    </svg>
                  </div>

                  <input
                    ref={modalFileInputRef}
                    type="file"
                    accept=".txt,.zip"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleModalFileSelect(file);
                    }}
                  />

                  {fileToUpload ? (
                    // Estado: Archivo seleccionado
                    <div className="space-y-3">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20">
                        <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-white truncate max-w-xs mx-auto">{fileToUpload.name}</p>
                        <p className="text-sm text-slate-400">{(fileToUpload.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFileToUpload(null);
                        }}
                        className="text-sm text-slate-500 hover:text-slate-300 underline"
                      >
                        Cambiar archivo
                      </button>
                    </div>
                  ) : isDragging ? (
                    // Estado: Arrastrando
                    <div className="space-y-3">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-cyan-500/20 animate-pulse">
                        <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </div>
                      <p className="font-semibold text-cyan-300">Suelta tu archivo aquí</p>
                    </div>
                  ) : (
                    // Estado: Idle
                    <div className="space-y-3">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-800">
                        <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-slate-300">Haz clic o arrastra tu archivo</p>
                        <p className="text-sm text-slate-500">Archivos .txt o .zip de WhatsApp</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Error */}
                {uploadError && (
                  <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
                    <p className="text-sm text-rose-300 flex items-center gap-2">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {uploadError}
                    </p>
                  </div>
                )}

                {/* Botón de confirmación */}
                {fileToUpload && !uploadError && (
                  <button
                    onClick={handleConfirmUpload}
                    className="w-full mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 px-6 py-4 text-base font-bold text-slate-950 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Analizar ahora
                  </button>
                )}

                {/* Guía de exportación */}
                <div className="mt-6 pt-6 border-t border-slate-800">
                  <p className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    ¿Cómo exportar tu chat de WhatsApp?
                  </p>

                  {/* Tabs */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setExportGuideTab('android')}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                        exportGuideTab === 'android'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800/50 text-slate-400 border border-transparent hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.523 15.341a.85.85 0 01-.842.842h-.957v2.78a1.27 1.27 0 01-1.265 1.264 1.27 1.27 0 01-1.265-1.264v-2.78h-2.388v2.78a1.27 1.27 0 01-1.265 1.264 1.27 1.27 0 01-1.265-1.264v-2.78h-.957a.85.85 0 01-.842-.842V8.447h11.046v6.894zM5.194 8.447a1.27 1.27 0 00-1.265 1.265v5.42a1.27 1.27 0 001.265 1.265 1.27 1.27 0 001.265-1.265v-5.42a1.27 1.27 0 00-1.265-1.265zm13.612 0a1.27 1.27 0 00-1.265 1.265v5.42a1.27 1.27 0 001.265 1.265 1.27 1.27 0 001.265-1.265v-5.42a1.27 1.27 0 00-1.265-1.265zM14.883 3.33l.896-1.63a.187.187 0 00-.07-.254.187.187 0 00-.254.07l-.907 1.65a5.86 5.86 0 00-2.548-.58 5.86 5.86 0 00-2.548.58l-.907-1.65a.187.187 0 00-.254-.07.187.187 0 00-.07.254l.896 1.63C7.57 4.188 6.477 5.758 6.477 7.59h11.046c0-1.832-1.093-3.402-2.64-4.26zm-5.09 2.45a.53.53 0 01-.53-.53.53.53 0 01.53-.53.53.53 0 01.53.53.53.53 0 01-.53.53zm4.414 0a.53.53 0 01-.53-.53.53.53 0 01.53-.53.53.53 0 01.53.53.53.53 0 01-.53.53z"/>
                        </svg>
                        Android
                      </span>
                    </button>
                    <button
                      onClick={() => setExportGuideTab('iphone')}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                        exportGuideTab === 'iphone'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800/50 text-slate-400 border border-transparent hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                        </svg>
                        iPhone
                      </span>
                    </button>
                  </div>

                  {/* Pasos */}
                  <div className="space-y-2 text-sm">
                    {exportGuideTab === 'android' ? (
                      <>
                        <div className="flex items-start gap-3 p-2 rounded-lg bg-slate-800/30">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">1</span>
                          <span className="text-slate-300">Abre el chat en WhatsApp</span>
                        </div>
                        <div className="flex items-start gap-3 p-2 rounded-lg bg-slate-800/30">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">2</span>
                          <span className="text-slate-300">Toca <strong className="text-white">⋮</strong> → <strong className="text-white">Más</strong> → <strong className="text-white">Exportar chat</strong></span>
                        </div>
                        <div className="flex items-start gap-3 p-2 rounded-lg bg-slate-800/30">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">3</span>
                          <span className="text-slate-300">Selecciona <strong className="text-white">"Sin archivos multimedia"</strong></span>
                        </div>
                        <div className="flex items-start gap-3 p-2 rounded-lg bg-slate-800/30">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">4</span>
                          <span className="text-slate-300">Guarda el archivo .txt y súbelo aquí</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-start gap-3 p-2 rounded-lg bg-slate-800/30">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">1</span>
                          <span className="text-slate-300">Abre el chat en WhatsApp</span>
                        </div>
                        <div className="flex items-start gap-3 p-2 rounded-lg bg-slate-800/30">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">2</span>
                          <span className="text-slate-300">Toca el nombre del contacto arriba</span>
                        </div>
                        <div className="flex items-start gap-3 p-2 rounded-lg bg-slate-800/30">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">3</span>
                          <span className="text-slate-300">Baja y toca <strong className="text-white">"Exportar chat"</strong> → <strong className="text-white">"Sin archivos"</strong></span>
                        </div>
                        <div className="flex items-start gap-3 p-2 rounded-lg bg-slate-800/30">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">4</span>
                          <span className="text-slate-300">Guarda en Archivos y súbelo aquí</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Privacidad */}
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Tu chat se procesa y se elimina. No almacenamos nada.</span>
                </div>
              </div>
            )}

            {/* ===== ESTADO: ANALIZANDO (PROGRESS BAR) ===== */}
            {showProgressBar && (
              <div className="p-6 lg:p-8">
                {/* Header */}
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-lg shadow-purple-500/30 mb-4">
                    {analysisComplete ? (
                      <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-8 h-8 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">
                    {analysisComplete ? '¡Tu análisis está listo!' : 'Analizando tu chat...'}
                  </h2>
                  {fileToUpload && (
                    <p className="text-sm text-slate-400">{fileToUpload.name}</p>
                  )}
                </div>

                {/* Barra de progreso animada */}
                <div className="mb-6">
                  <div className="relative w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                    {/* Fondo con brillo sutil */}
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-800 via-slate-700/50 to-slate-800" />
                    {/* Barra de progreso verde que crece */}
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${Math.max(progressPercent, 0)}%`,
                        background: 'linear-gradient(90deg, #10b981, #34d399, #22d3ee)',
                        transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: progressPercent > 0 ? '0 0 12px rgba(52, 211, 153, 0.5), 0 0 4px rgba(34, 211, 238, 0.3)' : 'none',
                      }}
                    >
                      {/* Efecto shimmer en la barra */}
                      {progressPercent > 5 && progressPercent < 100 && (
                        <div
                          className="absolute inset-0 animate-shimmer"
                          style={{
                            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {progressPercent < 30 ? 'Iniciando...' :
                       progressPercent < 60 ? 'Procesando...' :
                       progressPercent < 90 ? 'Casi listo...' : 'Finalizando...'}
                    </span>
                    <span className="text-sm font-bold text-emerald-400 tabular-nums">
                      {Math.round(progressPercent)}%
                    </span>
                  </div>
                </div>

                {/* Pasos del análisis */}
                <div className="space-y-2">
                  {ANALYSIS_STEPS.map((step, idx) => {
                    const isCompleted = currentStep > idx || analysisComplete;
                    const isActive = currentStep === idx && !analysisComplete;
                    const isPending = currentStep < idx && !analysisComplete;

                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-3 p-2 rounded-lg transition-all duration-300 ${
                          isActive ? 'bg-purple-500/10' : ''
                        }`}
                      >
                        {/* Ícono */}
                        <div className="flex-shrink-0">
                          {isCompleted ? (
                            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                              <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          ) : isActive ? (
                            <div className="w-5 h-5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-slate-700" />
                          )}
                        </div>

                        {/* Texto */}
                        <span className={`text-sm transition-all duration-300 ${
                          isCompleted ? 'text-emerald-400' :
                          isActive ? 'text-white font-medium' :
                          'text-slate-500'
                        }`}>
                          {step.label}
                          {idx === 0 && messageCount && isCompleted && (
                            <span className="text-slate-400 ml-1">({messageCount.toLocaleString()} encontrados)</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Privacidad */}
                <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Procesamiento privado · Nada se almacena</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== MINI-MODAL PATRÓN BLOQUEADO ========== */}
      {showLockedModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowLockedModal(false);
          }}
        >
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />

          {/* Modal */}
          <div className="relative w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-950 rounded-2xl shadow-2xl shadow-purple-500/20 border border-purple-500/30 overflow-hidden animate-scale-in">
            {/* Botón cerrar */}
            <button
              onClick={() => setShowLockedModal(false)}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="p-6">
              {/* Header */}
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-lg shadow-purple-500/30 mb-3">
                  <span className="text-2xl">🔓</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Este patrón es parte de tu análisis Pro</h3>
                <p className="text-sm text-purple-300 font-medium">"{lockedPatternName}"</p>
              </div>

              {/* Lista de valor */}
              <div className="mb-5 p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                <p className="text-sm font-semibold text-white mb-3">Con Pro desbloqueas:</p>
                <div className="space-y-2">
                  <p className="text-sm text-slate-300 flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Este patrón y 4 más
                  </p>
                  <p className="text-sm text-slate-300 flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Respuesta a tu pregunta
                  </p>
                  <p className="text-sm text-slate-300 flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    2 preguntas adicionales a la IA
                  </p>
                  <p className="text-sm text-slate-300 flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Análisis de dinámica completo
                  </p>
                </div>
              </div>

              {/* Anchor pricing */}
              <div className="text-center mb-4">
                <p className="text-sm text-white/60">
                  Total valor: <span className="line-through">$100 MXN</span> → Tú pagas: <span className="text-emerald-400 font-bold">$49 MXN</span>
                </p>
              </div>

              {/* CTA */}
              <button
                onClick={() => {
                  setShowLockedModal(false);
                  handleCheckoutSingle();
                }}
                disabled={isPaying}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 px-6 py-4 text-base font-bold text-slate-950 hover:shadow-xl hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-emerald-500/30 disabled:opacity-60"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {isPaying ? 'Procesando...' : 'Desbloquear todo — $49 MXN'}
              </button>

              {/* Trust badges */}
              <div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Pago único
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Sin suscripción
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
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
  chatStats,
  hasAccess,
  credits,
  onConsumeCredit,
  onUnlockClick,
}: {
  analysis: string;
  fullChat: string;
  chatStats?: {
    totalMessages: number;
    participants: { name: string; messageCount: number; wordCount: number; avgWordsPerMessage: number }[];
    totalWords: number;
    dateRange: { first: string | null; last: string | null };
  };
  hasAccess: boolean;
  credits: number;
  onConsumeCredit: () => void;
  onUnlockClick: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  // 🎬 Estados para animación premium de respuesta
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayedAnswer, setDisplayedAnswer] = useState('');
  const [animationStep, setAnimationStep] = useState<'typing' | 'thinking' | 'revealing' | 'done'>('done');

  // 📊 Estado para barra de progreso del chat (igual que el análisis)
  const [chatProgress, setChatProgress] = useState(0);
  const [chatProgressStep, setChatProgressStep] = useState(0);
  const CHAT_STEPS = [
    { label: 'Leyendo tu pregunta...', threshold: 0 },
    { label: 'Analizando contexto del chat...', threshold: 30 },
    { label: 'Procesando patrones relevantes...', threshold: 60 },
    { label: 'Generando respuesta personalizada...', threshold: 85 },
  ];

  // 💾 Restaurar historial de chat desde localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedHistory = window.localStorage.getItem('patternlabs_chat_history');
      if (storedHistory) {
        const parsed = JSON.parse(storedHistory) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setChatHistory(parsed);
          console.log('📦 Historial de chat restaurado:', parsed.length, 'mensajes');
        }
      }
    } catch (err) {
      console.error('Error restaurando historial de chat', err);
    }
  }, []);

  // 💾 Guardar historial de chat en localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (chatHistory.length === 0) return;
    try {
      window.localStorage.setItem('patternlabs_chat_history', JSON.stringify(chatHistory));
      console.log('💾 Historial guardado:', chatHistory.length, 'mensajes');
    } catch (err) {
      console.error('Error guardando historial de chat', err);
    }
  }, [chatHistory]);

  // Auto-scroll DENTRO del contenedor del chat cuando llega nueva respuesta
  useEffect(() => {
    if (chatHistory.length > 0 && chatContainerRef.current && lastMessageRef.current) {
      // Scroll dentro del contenedor, no de la página
      setTimeout(() => {
        if (lastMessageRef.current && chatContainerRef.current) {
          // Calcular posición del último mensaje relativo al contenedor
          const container = chatContainerRef.current;
          const lastMessage = lastMessageRef.current;
          const scrollTop = lastMessage.offsetTop - container.offsetTop - 20;
          container.scrollTo({ top: scrollTop, behavior: 'smooth' });
        }
      }, 100);
    }
  }, [chatHistory.length]);

  // Mostrar hint de scroll cuando hay más de 1 mensaje y el usuario no está al tope
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Si hay scroll disponible y no está al inicio, mostrar hint
      setShowScrollHint(container.scrollTop > 50 && chatHistory.length > 1);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [chatHistory.length]);

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
      setQuestion(''); // Limpiar input inmediatamente

      // 🎯 AGREGAR PREGUNTA AL HISTORIAL INMEDIATAMENTE
      const newMessage = {
        question: currentQuestion,
        answer: '' // Vacío hasta que llegue la respuesta
      };
      setChatHistory(prevHistory => [...prevHistory, newMessage]);
      onConsumeCredit(); // Consumir crédito inmediatamente

      // Iniciar estado de "pensando"
      setIsAnimating(true);
      setAnimationStep('thinking');

      // Scroll para mostrar la pregunta
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTo({
            top: chatContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 50);

      console.log('📤 Enviando pregunta:', currentQuestion);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store', // Evitar cache
        body: JSON.stringify({
          analysis,
          fullChat,
          question: currentQuestion,
          chatStats, // Stats pre-calculadas del chat COMPLETO
        }),
      });

      const data = await res.json();
      console.log('📥 Respuesta recibida:', data.answer?.slice(0, 100));

      // Completar barra al 100% cuando llega la respuesta
      setChatProgress(100);
      setChatProgressStep(4);

      if (!res.ok) {
        setError(data.error || 'Ocurrió un error al responder tu pregunta.');
        setQuestion(currentQuestion); // Restaurar pregunta si hay error
        setChatProgress(0);
        setChatProgressStep(0);
        return;
      }

      // 🎬 Iniciar animación de respuesta
      const fullAnswer = data.answer || 'Sin respuesta';

      // Cambiar de "thinking" a "revealing"
      setDisplayedAnswer('');

      // Pausa corta antes de empezar a revelar (200ms)
      setTimeout(() => {
        setAnimationStep('revealing');

        // Revelar palabra por palabra - Mostrar primera palabra INMEDIATAMENTE
        const words = fullAnswer.split(' ');
        let currentWordIndex = 0;

        // Mostrar primera palabra sin delay
        setDisplayedAnswer(words[0] || '');
        currentWordIndex = 1;

        const revealInterval = setInterval(() => {
          if (currentWordIndex < words.length) {
            setDisplayedAnswer(prev => prev + ' ' + words[currentWordIndex]);
            currentWordIndex++;
          } else {
            clearInterval(revealInterval);
            // Actualizar el historial con la respuesta completa
            setChatHistory(prevHistory => {
              const updated = [...prevHistory];
              if (updated.length > 0) {
                updated[updated.length - 1].answer = fullAnswer;
              }
              return updated;
            });
            setAnimationStep('done');
            setIsAnimating(false);
            setDisplayedAnswer('');
          }
        }, 30); // 30ms entre palabras = más fluido
      }, 200); // 200ms de pausa antes de revelar
    } catch (err) {
      console.error('❌ Error en chat:', err);
      setError('Error de red o del servidor al responder tu pregunta.');
      setQuestion(currentQuestion); // Restaurar pregunta si hay error
    } finally {
      setLoading(false);
    }
  };

  // Si no tiene acceso, no mostrar ChatBox aquí (la funcionalidad está arriba en el reporte demo)
  if (!hasAccess) {
    return null;
  }

  // Si tiene acceso, mostrar el chat funcional (con o sin créditos)
  return (
    <div className="rounded-2xl bg-gradient-to-br from-purple-950/40 via-slate-900 to-slate-950 p-6 border-2 border-purple-500/40 shadow-2xl shadow-purple-500/20 relative overflow-hidden">
      {/* Orbes de fondo */}
      <div className="absolute -top-20 -right-20 w-[200px] h-[200px] bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-[200px] h-[200px] bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        {/* Header prominente */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Pregúntale a la IA</h3>
              <p className="text-sm text-purple-300">La IA tiene TODO el contexto de tu chat</p>
            </div>
          </div>
          {/* 🔢 CONTADOR DE PREGUNTAS - PROMINENTE */}
          <div className={`flex flex-col items-end gap-1 px-4 py-2 rounded-xl transition-all ${
            credits === 1
              ? 'bg-amber-500/20 border border-amber-500/40'
              : credits <= 0
                ? 'bg-rose-500/20 border border-rose-500/40'
                : 'bg-emerald-500/20 border border-emerald-500/40'
          }`}>
            {/* Texto del contador */}
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${
                credits === 1 ? 'text-amber-200' : credits <= 0 ? 'text-rose-200' : 'text-emerald-200'
              }`}>
                {3 - credits} de 3 usadas
              </span>
            </div>
            {/* Dots visuales */}
            <div className="flex gap-1.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full transition-all ${
                    i <= (3 - credits)
                      ? 'bg-slate-500' // Usadas = gris
                      : credits === 1 && i === 3
                        ? 'bg-amber-400 animate-pulse shadow-lg shadow-amber-500/50' // Última = pulso amber
                        : 'bg-gradient-to-br from-emerald-400 to-cyan-400 shadow-md shadow-emerald-500/30' // Disponibles = verde
                  }`}
                />
              ))}
            </div>
            {/* Warning última pregunta */}
            {credits === 1 && (
              <p className="text-[10px] font-bold text-amber-300 animate-pulse">
                ⚠️ ¡Última pregunta!
              </p>
            )}
            {/* Sin preguntas */}
            {credits <= 0 && (
              <p className="text-[10px] font-bold text-rose-300">
                Sin preguntas disponibles
              </p>
            )}
          </div>
        </div>

        {/* Ejemplos de preguntas si no hay historial */}
        {chatHistory.length === 0 && (
          <div className="mb-6 p-4 rounded-xl bg-purple-950/40 border border-purple-500/30">
            <p className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
              <span>💡</span> Ideas de preguntas que puedes hacer:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                "¿Quién está más enganchado?",
                "¿Qué debería cambiar yo?",
                "¿Esta relación tiene futuro?",
                "¿Qué patrones se repiten?",
              ].map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setQuestion(q)}
                  className="text-left flex items-start gap-2 text-sm text-slate-200 bg-slate-900/60 hover:bg-slate-800/80 rounded-lg px-3 py-2.5 border border-purple-500/20 hover:border-purple-500/40 transition-all"
                >
                  <span className="text-purple-400 font-bold">→</span>
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Historial de preguntas y respuestas - CON SCROLL INTERNO */}
        {chatHistory.length > 0 && (
          <div className="mb-6 relative">
            {/* Indicador de mensajes anteriores arriba */}
            {showScrollHint && (
              <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
                <div className="h-12 bg-gradient-to-b from-slate-900 via-slate-900/80 to-transparent flex items-start justify-center pt-1">
                  <button
                    onClick={() => chatContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="pointer-events-auto flex items-center gap-1 px-3 py-1 rounded-full bg-purple-500/30 border border-purple-500/50 text-xs text-purple-200 hover:bg-purple-500/40 transition-all"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                    Ver mensajes anteriores
                  </button>
                </div>
              </div>
            )}

            <div className="relative">
              {/* Indicador de scroll inferior - gradiente fade */}
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent z-10 flex items-end justify-center pb-1 lg:hidden">
                <div className="flex items-center gap-1 text-[10px] text-purple-300/70 animate-bounce">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  <span>Desliza para ver más</span>
                </div>
              </div>
            <div
              ref={chatContainerRef}
              className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scroll-smooth pb-8"
              style={{ scrollBehavior: 'smooth' }}
            >
              <p className="text-sm font-semibold text-purple-300 flex items-center gap-2 sticky top-0 bg-slate-900/95 py-2 -mt-2 -mx-2 px-2 z-10">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                Tu conversación con la IA:
              </p>
            {chatHistory.map((msg, idx) => (
              <div
                key={idx}
                className="space-y-3"
                ref={idx === chatHistory.length - 1 ? lastMessageRef : null}
              >
                {/* Pregunta del usuario - con animación de entrada */}
                <div className="flex justify-end animate-fade-in">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-3 shadow-lg">
                    <p className="text-sm font-medium text-slate-950">{msg.question}</p>
                  </div>
                </div>
                {/* Respuesta de la IA - CON ANIMACIÓN PREMIUM */}
                <div className="flex justify-start">
                  <div className="max-w-[95%] rounded-2xl rounded-tl-sm bg-gradient-to-br from-purple-950/60 to-slate-900/80 border-2 border-purple-500/30 px-4 py-3 shadow-lg">
                    {/* Si es la última respuesta y está animando */}
                    {idx === chatHistory.length - 1 && isAnimating ? (
                      <>
                        {/* Paso 1: Indicador tipo Siri */}
                        {animationStep === 'thinking' && (
                          <div className="flex items-center gap-3 py-2">
                            {/* Círculo tipo Siri con ondas */}
                            <div className="relative w-10 h-10">
                              {/* Ondas expansivas */}
                              <div className="absolute inset-0 rounded-full bg-purple-500/30 animate-ping" style={{ animationDuration: '1.5s' }}></div>
                              <div className="absolute inset-1 rounded-full bg-purple-500/40 animate-ping" style={{ animationDuration: '1.5s', animationDelay: '0.3s' }}></div>
                              {/* Círculo central con gradiente */}
                              <div className="absolute inset-2 rounded-full bg-gradient-to-br from-purple-400 via-fuchsia-500 to-purple-600 shadow-lg shadow-purple-500/50 animate-pulse"></div>
                              {/* Brillo interior */}
                              <div className="absolute inset-[10px] rounded-full bg-gradient-to-br from-white/30 to-transparent"></div>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-purple-200">Analizando...</span>
                              <span className="text-xs text-slate-400">La IA está procesando tu pregunta</span>
                            </div>
                          </div>
                        )}
                        {/* Paso 2: Revelando palabra por palabra */}
                        {animationStep === 'revealing' && (
                          <p className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">
                            {displayedAnswer}
                            <span className="inline-block w-0.5 h-4 bg-purple-400 ml-0.5 animate-pulse"></span>
                          </p>
                        )}
                      </>
                    ) : (
                      /* Respuesta normal (ya completada) */
                      <p className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">{msg.answer}</p>
                    )}
                  </div>
                </div>
                {/* CTA inline después de la última respuesta si no hay créditos */}
                {idx === chatHistory.length - 1 && credits <= 0 && (
                  <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-purple-500/20 to-fuchsia-500/20 border border-purple-500/40">
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <div className="flex-1 text-center sm:text-left">
                        <p className="text-sm font-bold text-white">¿Quieres seguir preguntando?</p>
                        <p className="text-xs text-purple-200">+3 preguntas por MX$49</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={onUnlockClick}
                          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-fuchsia-500 px-4 py-2 text-sm font-bold text-white shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Desbloquear
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // Limpiar todo el estado guardado para empezar de cero
                            window.localStorage.removeItem('patternlabs_result');
                            window.localStorage.removeItem('patternlabs_chat_history');
                            window.localStorage.removeItem('patternlabs_access');
                            window.location.reload();
                          }}
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-700/80 hover:bg-slate-600/80 px-4 py-2 text-sm font-medium text-slate-200 transition-all"
                        >
                          Nuevo chat
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* 🎬 Indicador de carga PRO mientras la API procesa */}
            {loading && (
              <div className="flex justify-start animate-fade-in">
                <div className="w-full max-w-md rounded-2xl bg-gradient-to-br from-purple-950/80 via-slate-900 to-slate-950 border-2 border-purple-500/40 p-5 shadow-2xl shadow-purple-500/20">
                  {/* Header con ícono animado */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-purple-500/40">
                      <svg className="w-5 h-5 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">IA Experta Analizando</p>
                      <p className="text-xs text-purple-300">{CHAT_STEPS[chatProgressStep]?.label || 'Procesando...'}</p>
                    </div>
                  </div>

                  {/* Barra de progreso animada */}
                  <div className="mb-4">
                    <div
                      style={{
                        width: '100%',
                        height: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '9999px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${chatProgress}%`,
                          background: 'linear-gradient(90deg, #a855f7, #d946ef, #22d3ee)',
                          borderRadius: '9999px',
                          transition: 'width 0.15s ease-out',
                        }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-xs">
                      <span className="text-purple-300 font-medium">{Math.round(chatProgress)}%</span>
                      <span className="text-slate-500">~5-10 seg</span>
                    </div>
                  </div>

                  {/* Mini pasos */}
                  <div className="space-y-1.5">
                    {CHAT_STEPS.map((step, idx) => {
                      const isCompleted = chatProgressStep > idx;
                      const isActive = chatProgressStep === idx;
                      return (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 text-xs transition-all ${
                            isActive ? 'text-white' : isCompleted ? 'text-emerald-400' : 'text-slate-600'
                          }`}
                        >
                          {isCompleted ? (
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          ) : isActive ? (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border border-slate-700" />
                          )}
                          <span>{step.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            </div>
            </div>
          </div>
        )}

        {/* Input área - Solo si tiene créditos */}
        {credits > 0 ? (
          <>
            <div className="mb-4">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAsk();
                  }
                }}
                rows={2}
                className="w-full rounded-xl border-2 border-purple-500/30 bg-slate-900/80 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all resize-none"
                placeholder="Escribe tu pregunta sobre tu relación aquí..."
              />
            </div>

            {/* Botón de enviar prominente */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleAsk}
                disabled={loading || isAnimating || !question.trim()}
                className="flex-1 inline-flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 px-6 py-4 text-lg font-bold text-white shadow-xl shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:cursor-not-allowed disabled:opacity-60 relative overflow-hidden group"
              >
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                {loading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin relative z-10" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="relative z-10">La IA está analizando...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="relative z-10">Preguntar a la IA</span>
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          /* Mensaje cuando no hay créditos - UPSELL PROMINENTE */
          <div className="p-5 rounded-xl bg-gradient-to-br from-purple-950/60 to-fuchsia-950/40 border-2 border-purple-500/40 shadow-xl shadow-purple-500/10">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-500 shadow-lg shadow-purple-500/40 mb-4">
                <span className="text-2xl">🔒</span>
              </div>
              <h4 className="text-lg font-bold text-white mb-2">
                {chatHistory.length > 0 ? '¿Quieres seguir preguntando?' : 'Desbloquea preguntas a la IA'}
              </h4>
              <p className="text-sm text-purple-200 mb-4">
                {chatHistory.length > 0
                  ? 'Usaste tus 3 preguntas incluidas. ¡Obtén más para seguir explorando!'
                  : 'Obtén 3 preguntas para explorar tu relación con la IA'
                }
              </p>
              <button
                type="button"
                onClick={onUnlockClick}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 px-6 py-4 text-base font-bold text-white shadow-xl shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Obtener +3 preguntas — $49 MXN
              </button>
              <p className="text-xs text-slate-500 mt-3">Pago único · Sin suscripción</p>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-rose-300 text-center">{error}</p>}
      </div>
    </div>
  );
}
