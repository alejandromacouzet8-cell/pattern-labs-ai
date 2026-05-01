import React from 'react';
import {
  AbsoluteFill,
  Audio,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';

interface PatternLabsVideoCompositionProps {
  audioPath: string;
  text: string;
}

// ============================================================================
// UTILIDADES
// ============================================================================

// Sistema de plantillas por video específico
interface SceneTimestamp {
  text: string;
  startPercent: number; // 0-1
  endPercent: number; // 0-1
}

// Detectar qué video es según el contenido
const getVideoTemplate = (text: string): SceneTimestamp[] | null => {
  // VIRAL 3: Gaslighting
  if (text.includes('gaslighting') && text.includes('34 por ciento')) {
    return [
      { text: 'Si tu pareja te dice estás loca cada vez que le reclamas algo', startPercent: 0, endPercent: 0.17 },
      { text: 'no estás loca', startPercent: 0.17, endPercent: 0.24 },
      { text: 'Te está haciendo gaslighting', startPercent: 0.24, endPercent: 0.34 },
      { text: 'La IA detectó esta palabra el 34 por ciento de los chats que analizamos', startPercent: 0.34, endPercent: 0.54 },
      { text: 'Eso significa que 1 de cada 3 personas está siendo manipulada en este momento', startPercent: 0.54, endPercent: 0.74 },
      { text: 'La mayoría no lo sabe', startPercent: 0.74, endPercent: 0.88 },
    ];
  }

  // VIRAL 1: Experimento 100 mujeres
  if (text.includes('100 mujeres') && text.includes('experimento')) {
    return [
      { text: 'Hice un experimento', startPercent: 0, endPercent: 0.10 },
      { text: 'Le pedí a 100 mujeres que subieran el chat con su novio a una inteligencia artificial', startPercent: 0.10, endPercent: 0.30 },
      { text: '73 de ellas descubrieron que su pareja las manipula', startPercent: 0.30, endPercent: 0.44 },
      { text: 'Lo peor no fue eso', startPercent: 0.44, endPercent: 0.50 },
      { text: 'Lo peor fue que 68 de esas 73 ya lo sabían', startPercent: 0.50, endPercent: 0.64 },
      { text: 'Pero preferían no verlo', startPercent: 0.64, endPercent: 0.72 },
      { text: 'Tu chat tiene la verdad que no quieres escuchar', startPercent: 0.72, endPercent: 0.84 },
      { text: 'La pregunta es si tienes el valor de verla', startPercent: 0.84, endPercent: 0.90 },
    ];
  }

  // VIRAL 2: Ella vs él mensajes
  if (text.includes('buenos días mi amor') && text.includes('2 mil 300')) {
    return [
      { text: 'Ella le escribe buenos días mi amor todos los días', startPercent: 0, endPercent: 0.18 },
      { text: 'El le responde ok', startPercent: 0.18, endPercent: 0.25 },
      { text: 'Ella le manda párrafos de cómo se siente', startPercent: 0.25, endPercent: 0.38 },
      { text: 'El le responde con un emoji', startPercent: 0.38, endPercent: 0.46 },
      { text: 'La IA analizó su chat', startPercent: 0.46, endPercent: 0.54 },
      { text: '2 mil 300 mensajes de ella', startPercent: 0.54, endPercent: 0.62 },
      { text: '847 de él', startPercent: 0.62, endPercent: 0.67 },
      { text: 'Y de esos 847 el 94 por ciento son respuestas de una sola palabra', startPercent: 0.67, endPercent: 0.82 },
      { text: 'Eso no es amor', startPercent: 0.82, endPercent: 0.87 },
      { text: 'Es indiferencia disfrazada de relación', startPercent: 0.87, endPercent: 0.92 },
    ];
  }

  return null;
};

// Parsear texto - usa plantilla si existe, sino modo automático
const parseSentences = (text: string, totalDuration: number): string[] => {
  // Intentar usar plantilla específica
  const template = getVideoTemplate(text);
  if (template) {
    return template.map(t => t.text);
  }

  // Fallback: modo automático (como antes)
  let baseSentences = text
    .split(/\.(?!\d)/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  baseSentences = baseSentences.filter((sentence, i) => {
    if (i === 0) return true;
    const words = sentence.split(/\s+/);
    if (words.length <= 3 && detectNumbers(sentence)) {
      const prevSentence = baseSentences[i - 1];
      const currentNumber = extractNumber(sentence);
      const prevNumber = extractNumber(prevSentence);
      if (currentNumber === prevNumber) {
        return false;
      }
    }
    return true;
  });

  const finalSentences: string[] = [];

  baseSentences.forEach(sentence => {
    const words = sentence.split(/\s+/);

    if (words.length > 15) {
      const midPoint = Math.floor(words.length / 2);
      let splitIndex = midPoint;

      for (let i = midPoint - 3; i <= midPoint + 3 && i < words.length; i++) {
        if (i > 0 && (words[i - 1].endsWith(',') || ['y', 'pero', 'que'].includes(words[i].toLowerCase()))) {
          splitIndex = i;
          break;
        }
      }

      const part1 = words.slice(0, splitIndex).join(' ').replace(/,$/, '');
      const part2 = words.slice(splitIndex).join(' ');

      if (part1.length > 0) finalSentences.push(part1);
      if (part2.length > 0) finalSentences.push(part2);
    } else {
      finalSentences.push(sentence);
    }
  });

  return finalSentences;
};

// Contar palabras en una frase
const countWords = (sentence: string): number => {
  return sentence.split(/\s+/).filter(w => w.length > 0).length;
};

// Calcular duraciones de escenas - con soporte para plantillas
const calculateSceneDurations = (
  text: string,
  sentences: string[],
  totalFrames: number,
  ctaPercentage: number = 0.15
): { startFrame: number; endFrame: number; sentence: string }[] => {
  const template = getVideoTemplate(text);

  // Si hay plantilla, usar los timestamps exactos
  if (template) {
    // CTA empieza donde termina la última escena del template
    const lastScene = template[template.length - 1];
    const ctaStartPercent = lastScene.endPercent;

    const scenes = template.map(scene => ({
      startFrame: Math.floor(totalFrames * scene.startPercent),
      endFrame: Math.floor(totalFrames * scene.endPercent),
      sentence: scene.text,
    }));

    // Agregar CTA
    scenes.push({
      startFrame: Math.floor(totalFrames * ctaStartPercent),
      endFrame: totalFrames,
      sentence: 'CTA',
    });

    return scenes;
  }

  // Fallback: modo automático proporcional
  const ctaFrames = Math.floor(totalFrames * ctaPercentage);
  const contentFrames = totalFrames - ctaFrames;

  const wordCounts = sentences.map(countWords);
  const totalWords = wordCounts.reduce((a, b) => a + b, 0);

  const scenes: { startFrame: number; endFrame: number; sentence: string }[] = [];
  let currentFrame = 0;

  sentences.forEach((sentence, i) => {
    const proportion = wordCounts[i] / totalWords;
    const duration = Math.floor(contentFrames * proportion);

    scenes.push({
      startFrame: currentFrame,
      endFrame: currentFrame + duration,
      sentence,
    });

    currentFrame += duration;
  });

  // Escena CTA al final
  scenes.push({
    startFrame: currentFrame,
    endFrame: totalFrames,
    sentence: 'CTA',
  });

  return scenes;
};

// Detectar números y porcentajes
const detectNumbers = (text: string): RegExpMatchArray | null => {
  return text.match(/\d+[\.,]?\d*\s*(%|por ciento)?/);
};

// Extraer número de texto
const extractNumber = (text: string): number => {
  const match = text.match(/\d+[\.,]?\d*/);
  if (!match) return 0;
  return parseInt(match[0].replace(/[\.,]/g, ''), 10);
};

// Detectar palabras negativas
const hasNegativeWords = (text: string): boolean => {
  const negatives = /manipula|ignora|control|gaslighting|tóxic|pelea|perderte|loca|indiferencia/i;
  return negatives.test(text);
};

// Detectar palabras emocionales
const hasEmotionalWords = (text: string): boolean => {
  const emotional = /amor|te amo|corazón|siente|llorar/i;
  return emotional.test(text);
};

// Detectar comparaciones
const hasComparison = (text: string): boolean => {
  return /ella|él|tú\/él/i.test(text);
};

// Contador animado
const AnimatedCounter: React.FC<{
  value: number;
  startFrame: number;
  currentFrame: number;
  duration?: number;
}> = ({ value, startFrame, currentFrame, duration = 20 }) => {
  const relativeFrame = Math.max(0, currentFrame - startFrame);

  const current = interpolate(
    relativeFrame,
    [0, duration],
    [0, value],
    {
      extrapolateRight: 'clamp',
    }
  );

  return <>{Math.floor(current).toLocaleString('es-ES')}</>;
};

// ============================================================================
// PARTÍCULAS FLOTANTES MEJORADAS
// ============================================================================

const FloatingParticles: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <>
      {Array.from({ length: 30 }).map((_, i) => {
        const x = (i * 108) % 1080;
        const baseY = (i * 192) % 1920;
        const offset = Math.sin((frame + i * 30) / 60) * 80;
        const drift = Math.cos((frame + i * 45) / 90) * 40;
        const size = (i % 3) + 2;
        const opacity = 0.1 + (Math.sin((frame + i * 20) / 40) * 0.15);
        const hue = i % 2 === 0 ? '0, 255, 136' : '0, 240, 255';

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x + drift,
              top: baseY + offset,
              width: size,
              height: size,
              borderRadius: '50%',
              backgroundColor: `rgba(${hue}, ${opacity})`,
              boxShadow: `0 0 ${size * 3}px rgba(${hue}, ${opacity})`,
              filter: 'blur(0.5px)',
            }}
          />
        );
      })}
    </>
  );
};

// ============================================================================
// BARRA DE PROGRESO
// ============================================================================

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2,
        background: 'rgba(255, 255, 255, 0.1)',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress * 100}%`,
          background: 'linear-gradient(90deg, #00ff88 0%, #00f0ff 100%)',
        }}
      />
    </div>
  );
};

// ============================================================================
// ESCENA HOOK (primera escena)
// ============================================================================

const HookScene: React.FC<{
  sentence: string;
  sceneFrame: number;
  sceneDuration: number;
}> = ({ sentence, sceneFrame, sceneDuration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Pulso del fondo rojo más intenso
  const bgPulse = interpolate(
    Math.sin((sceneFrame / 15) * Math.PI * 2),
    [-1, 1],
    [0.15, 0.4]
  );

  // Parpadeo del borde más dramático
  const borderBlink = interpolate(
    Math.sin((sceneFrame / 8) * Math.PI * 2),
    [-1, 1],
    [0.5, 1]
  );

  // Escala del emoji con bounce
  const emojiScale = spring({
    frame: sceneFrame,
    fps,
    config: {
      damping: 10,
      stiffness: 100,
      mass: 1,
    },
  }) * (1 + Math.sin((sceneFrame / 10) * Math.PI) * 0.15);

  // Línea se expande
  const lineWidth = interpolate(
    sceneFrame,
    [0, sceneDuration * 0.4],
    [0, 80],
    { extrapolateRight: 'clamp' }
  );

  // Glitch effect
  const glitchActive = sceneFrame % 60 < 3;
  const glitchOffsetX = glitchActive ? (Math.random() - 0.5) * 10 : 0;
  const glitchOffsetY = glitchActive ? (Math.random() - 0.5) * 10 : 0;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 50%, rgba(139, 0, 0, ${bgPulse}), rgba(0, 0, 0, 1))`,
      }}
    >
      {/* Rayos de alerta desde el centro */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '200%',
          height: '200%',
          transform: `translate(-50%, -50%) rotate(${sceneFrame * 2}deg)`,
          background: 'conic-gradient(from 0deg, transparent 0%, rgba(255,68,68,0.1) 5%, transparent 10%, transparent 20%, rgba(255,68,68,0.1) 25%, transparent 30%)',
          opacity: 0.4,
        }}
      />

      {/* Borde rojo parpadeante más grueso */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: `6px solid rgba(255, 68, 68, ${borderBlink})`,
          pointerEvents: 'none',
          boxShadow: `inset 0 0 40px rgba(255, 68, 68, ${borderBlink * 0.5})`,
        }}
      />

      {/* Efecto de escaneo */}
      <div
        style={{
          position: 'absolute',
          top: `${(sceneFrame % 60) * 32}px`,
          left: 0,
          right: 0,
          height: 3,
          background: 'linear-gradient(90deg, transparent, rgba(255,68,68,0.3), transparent)',
          filter: 'blur(2px)',
        }}
      />

      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '100px 60px',
        }}
      >
        {/* Emoji alerta con animación */}
        <div
          style={{
            fontSize: 80,
            transform: `scale(${emojiScale})`,
            marginBottom: 50,
            filter: 'drop-shadow(0 0 30px rgba(255,165,0,0.8))',
          }}
        >
          ⚠️
        </div>

        {/* Texto principal con glitch */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 'bold',
            color: '#ffffff',
            textAlign: 'center',
            maxWidth: 960,
            lineHeight: 1.4,
            transform: `translate(${glitchOffsetX}px, ${glitchOffsetY}px)`,
          }}
        >
          {sentence.split(' ').map((word, i) => {
            const isNegative = /manipula|ignora|control|gaslighting|tóxic|pelea|perderte|loca/i.test(word);
            const isPositive = /experimento|verdad|valor/i.test(word);
            const wordDelay = i * 2;
            const wordScale = spring({
              frame: sceneFrame - wordDelay,
              fps,
              config: {
                damping: 20,
                stiffness: 100,
              },
            });

            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  color: isNegative ? '#ff4444' : isPositive ? '#00ff88' : '#ffffff',
                  textShadow: isNegative
                    ? '0 0 40px rgba(255, 68, 68, 1), 0 0 80px rgba(255, 68, 68, 0.6)'
                    : isPositive
                    ? '0 0 40px rgba(0, 255, 136, 1), 0 0 80px rgba(0, 255, 136, 0.6)'
                    : '0 2px 10px rgba(0,0,0,0.8)',
                  transform: `scale(${wordScale})`,
                  marginRight: 12,
                  filter: isNegative || isPositive ? `drop-shadow(0 0 15px ${isNegative ? '#ff4444' : '#00ff88'})` : 'none',
                }}
              >
                {word}
              </span>
            );
          })}
        </div>

        {/* Línea horizontal con efecto de energía */}
        <div
          style={{
            width: `${lineWidth}%`,
            height: 6,
            background: 'linear-gradient(90deg, transparent, #ff4444, #ff6666, #ff4444, transparent)',
            marginTop: 50,
            boxShadow: '0 0 40px rgba(255, 68, 68, 0.9), 0 0 80px rgba(255, 68, 68, 0.5)',
            filter: 'blur(1px)',
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ============================================================================
// ESCENA DATO/NÚMERO
// ============================================================================

const DataScene: React.FC<{
  sentence: string;
  sceneFrame: number;
  sceneDuration: number;
  absoluteStartFrame: number;
}> = ({ sentence, sceneFrame, sceneDuration, absoluteStartFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const number = extractNumber(sentence);
  const isNegative = hasNegativeWords(sentence);
  const color = isNegative ? '#ff4444' : '#00ff88';

  // Animación de entrada del card
  const cardScale = spring({
    frame: sceneFrame,
    fps,
    config: {
      damping: 20,
      stiffness: 100,
      mass: 0.8,
    },
  });

  // Pulso sutil del borde
  const borderPulse = interpolate(
    Math.sin((sceneFrame / 30) * Math.PI * 2),
    [-1, 1],
    [0.6, 1]
  );

  // Rotación sutil del gradiente de fondo
  const bgRotation = (sceneFrame * 0.5) % 360;

  // Glitch effect ocasional
  const glitchOffset = Math.random() < 0.02 ? Math.random() * 4 - 2 : 0;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${bgRotation}deg, #0a0a1a 0%, #1a1a3e 50%, #0a0a1a 100%)`,
      }}
    >
      {/* Círculos decorativos de fondo */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '10%',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
          filter: 'blur(60px)',
          animation: `pulse ${sceneDuration / 30}s ease-in-out infinite`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '20%',
          right: '10%',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color}10 0%, transparent 70%)`,
          filter: 'blur(60px)',
        }}
      />

      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '100px 60px',
        }}
      >
        {/* Card semi-transparente */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: `3px solid ${color}`,
            borderRadius: 20,
            padding: '60px 80px',
            maxWidth: 960,
            textAlign: 'center',
            transform: `scale(${cardScale}) translateX(${glitchOffset}px)`,
            boxShadow: `0 0 40px ${color}40, inset 0 0 40px ${color}10`,
            opacity: borderPulse,
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* Número grande con counter */}
          <div
            style={{
              fontSize: 150,
              fontWeight: 'bold',
              color,
              textShadow: `0 0 60px ${color}, 0 0 100px ${color}80, 0 4px 8px rgba(0,0,0,0.5)`,
              marginBottom: 30,
              transform: `scale(${1 + Math.sin(sceneFrame / 15) * 0.05})`,
              filter: `drop-shadow(0 0 20px ${color})`,
            }}
          >
            <AnimatedCounter
              value={number}
              startFrame={absoluteStartFrame}
              currentFrame={frame}
              duration={20}
            />
            {/* Solo mostrar % si el número está seguido de % o "por ciento" */}
            {sentence.match(/\d+[\.,]?\d*\s*(%|por\s+ciento)/) ? '%' : ''}
          </div>

          {/* Línea decorativa debajo del número */}
          <div
            style={{
              width: '80%',
              height: 2,
              background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
              margin: '20px auto',
              boxShadow: `0 0 20px ${color}`,
            }}
          />

          {/* Resto del texto */}
          <div
            style={{
              fontSize: 42,
              fontWeight: 'bold',
              color: '#ffffff',
              lineHeight: 1.5,
              textShadow: '0 2px 10px rgba(0,0,0,0.8)',
            }}
          >
            {sentence.replace(/\d+[\.,]?\d*\s*(%|por ciento)?/, '').trim()}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ============================================================================
// ESCENA TEXTO IMPACTANTE
// ============================================================================

const ImpactTextScene: React.FC<{
  sentence: string;
  sceneFrame: number;
  sceneDuration: number;
}> = ({ sentence, sceneFrame, sceneDuration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = sentence.split(' ');
  const animationDuration = sceneDuration * 0.6;

  // Gradiente animado de fondo
  const bgShift = (sceneFrame * 0.8) % 360;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${bgShift}deg, #0a0a1a 0%, #1a1a2e 50%, #0a0a1a 100%)`,
      }}
    >
      {/* Efecto de viñeta */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at center, transparent 20%, rgba(0,0,0,0.6) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Rayos de luz de fondo */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '150%',
          height: '150%',
          transform: `translate(-50%, -50%) rotate(${sceneFrame * 0.5}deg)`,
          background: 'conic-gradient(from 0deg, transparent 0%, rgba(0,255,136,0.03) 10%, transparent 20%, transparent 30%, rgba(0,240,255,0.03) 40%, transparent 50%)',
          opacity: 0.3,
        }}
      />

      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '100px 60px',
        }}
      >
        <div
          style={{
            fontSize: 56,
            fontWeight: 'bold',
            color: '#ffffff',
            textAlign: 'center',
            maxWidth: 960,
            lineHeight: 1.5,
            position: 'relative',
          }}
        >
          {words.map((word, i) => {
            const wordStartFrame = (i / words.length) * animationDuration;
            const wordProgress = spring({
              frame: sceneFrame - wordStartFrame,
              fps,
              config: {
                damping: 200,
                stiffness: 100,
                mass: 0.5,
              },
            });

            const isNegative = /manipula|ignora|control|gaslighting|tóxic|pelea|perderte|loca|indiferencia/i.test(word);
            const isEmotional = /amor|amo|corazón|siente|llorar/i.test(word);
            const isHighlight = /IA|chat|mensajes/i.test(word);

            const fontSize = isNegative ? 68 : isHighlight ? 60 : 56;
            const color = isNegative
              ? '#ff4444'
              : isEmotional
              ? '#ff69b4'
              : isHighlight
              ? '#00ff88'
              : '#ffffff';
            const glow = isNegative
              ? '0 0 40px rgba(255, 68, 68, 0.9), 0 0 80px rgba(255, 68, 68, 0.5)'
              : isEmotional
              ? '0 0 40px rgba(255, 105, 180, 0.9), 0 0 80px rgba(255, 105, 180, 0.5)'
              : isHighlight
              ? '0 0 40px rgba(0, 255, 136, 0.9), 0 0 80px rgba(0, 255, 136, 0.5)'
              : '0 2px 10px rgba(0,0,0,0.8)';

            // Efecto de rebote para palabras importantes
            const bounce = isNegative || isHighlight
              ? Math.sin((sceneFrame + i * 10) / 10) * 2
              : 0;

            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  opacity: wordProgress,
                  transform: `translateY(${(1 - wordProgress) * 30 + bounce}px) scale(${wordProgress})`,
                  fontSize,
                  color,
                  textShadow: glow,
                  marginRight: 14,
                  filter: isNegative || isHighlight ? `drop-shadow(0 0 15px ${color})` : 'none',
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ============================================================================
// ESCENA CTA
// ============================================================================

const CTAScene: React.FC<{
  sceneFrame: number;
  sceneDuration: number;
}> = ({ sceneFrame, sceneDuration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade-in del texto principal con spring
  const mainTextScale = spring({
    frame: sceneFrame,
    fps,
    config: {
      damping: 15,
      stiffness: 80,
      mass: 1,
    },
  });

  // Pulse del CTA más intenso
  const pulse = interpolate(
    Math.sin((sceneFrame / 15) * Math.PI * 2),
    [-1, 1],
    [1.0, 1.12]
  );

  // Rotación del gradiente
  const gradientRotation = (sceneFrame * 2) % 360;

  // Texto final aparece después de frame 20
  const finalTextOpacity = interpolate(
    sceneFrame,
    [20, 35],
    [0, 1],
    { extrapolateRight: 'clamp' }
  );

  // Partículas brillantes que explotan
  const particleExplosion = Math.min(sceneFrame / 20, 1);

  return (
    <AbsoluteFill style={{ background: '#000000' }}>
      {/* Gradiente animado de fondo */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `conic-gradient(from ${gradientRotation}deg at 50% 50%, #00ff8810 0deg, transparent 90deg, #00f0ff10 180deg, transparent 270deg)`,
          opacity: 0.3,
        }}
      />

      {/* Círculo pulsante de fondo */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 800 * pulse,
          height: 800 * pulse,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,255,136,0.1) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      {/* Partículas de explosión */}
      {Array.from({ length: 20 }).map((_, i) => {
        const angle = (i / 20) * Math.PI * 2;
        const distance = particleExplosion * 400;
        const x = 540 + Math.cos(angle) * distance;
        const y = 960 + Math.sin(angle) * distance;
        const opacity = Math.max(0, 1 - particleExplosion);

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: i % 2 === 0 ? '#00ff88' : '#00f0ff',
              opacity: opacity * 0.8,
              boxShadow: `0 0 20px ${i % 2 === 0 ? '#00ff88' : '#00f0ff'}`,
            }}
          />
        );
      })}

      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '100px 60px',
          gap: 50,
        }}
      >
        {/* Link en mi perfil */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 'bold',
            color: '#00ff88',
            textShadow: '0 0 40px rgba(0, 255, 136, 1), 0 0 80px rgba(0, 255, 136, 0.6), 0 4px 8px rgba(0,0,0,0.8)',
            transform: `scale(${mainTextScale * pulse})`,
            filter: 'drop-shadow(0 0 30px #00ff88)',
          }}
        >
          Link en mi perfil 👆
        </div>

        {/* Línea decorativa */}
        <div
          style={{
            width: '60%',
            height: 3,
            background: 'linear-gradient(90deg, transparent, #00ff88, #00f0ff, transparent)',
            boxShadow: '0 0 20px #00ff88',
            opacity: mainTextScale,
          }}
        />

        {/* Logo con efecto */}
        <div
          style={{
            fontSize: 40,
            fontWeight: 'bold',
            background: 'linear-gradient(90deg, #00ff88, #00f0ff)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            opacity: mainTextScale,
            textShadow: '0 4px 8px rgba(0,0,0,0.8)',
            filter: 'drop-shadow(0 0 20px rgba(0,255,136,0.5))',
          }}
        >
          Pattern Labs AI
        </div>

        {/* Texto final con animación */}
        <div
          style={{
            fontSize: 32,
            fontWeight: 'bold',
            color: '#ffffff',
            opacity: finalTextOpacity,
            marginTop: 30,
            textShadow: '0 0 20px rgba(255, 255, 255, 0.5), 0 2px 8px rgba(0,0,0,0.8)',
            transform: `translateY(${(1 - finalTextOpacity) * 20}px)`,
          }}
        >
          Comenta QUIERO para el link
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export const PatternLabsVideoComposition: React.FC<
  PatternLabsVideoCompositionProps
> = ({ audioPath, text }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();

  // Parsear frases
  const totalDuration = durationInFrames / fps;
  const sentences = parseSentences(text, totalDuration);

  // Calcular duraciones (pasando text para detectar plantilla)
  const scenes = calculateSceneDurations(text, sentences, durationInFrames);

  // Función para calcular opacity con fade
  const getSceneOpacity = (startFrame: number, endFrame: number): number => {
    const fadeFrames = 6;
    const transitionGap = 2;

    const actualEnd = endFrame - transitionGap;

    if (frame < startFrame || frame >= endFrame) return 0;

    // Fade-in
    if (frame < startFrame + fadeFrames) {
      return (frame - startFrame) / fadeFrames;
    }

    // Fade-out
    if (frame >= actualEnd - fadeFrames) {
      return Math.max(0, (actualEnd - frame) / fadeFrames);
    }

    return 1;
  };

  // Progreso del video
  const progress = frame / durationInFrames;

  return (
    <AbsoluteFill>
      {/* Fondo base */}
      <AbsoluteFill style={{ background: '#000000' }} />

      {/* Audio */}
      <Audio src={audioPath} />

      {/* Partículas flotantes */}
      <FloatingParticles />

      {/* Renderizar escenas */}
      {scenes.map((scene, i) => {
        const opacity = getSceneOpacity(scene.startFrame, scene.endFrame);
        const sceneFrame = frame - scene.startFrame;
        const sceneDuration = scene.endFrame - scene.startFrame;

        if (opacity === 0) return null;

        // Última escena = CTA
        if (i === scenes.length - 1) {
          return (
            <div key={i} style={{ opacity, position: 'absolute', inset: 0 }}>
              <CTAScene sceneFrame={sceneFrame} sceneDuration={sceneDuration} />
            </div>
          );
        }

        // Primera escena = Hook
        if (i === 0) {
          return (
            <div key={i} style={{ opacity, position: 'absolute', inset: 0 }}>
              <HookScene
                sentence={scene.sentence}
                sceneFrame={sceneFrame}
                sceneDuration={sceneDuration}
              />
            </div>
          );
        }

        // Detectar tipo de escena
        const hasNumber = detectNumbers(scene.sentence);

        if (hasNumber) {
          return (
            <div key={i} style={{ opacity, position: 'absolute', inset: 0 }}>
              <DataScene
                sentence={scene.sentence}
                sceneFrame={sceneFrame}
                sceneDuration={sceneDuration}
                absoluteStartFrame={scene.startFrame}
              />
            </div>
          );
        } else {
          return (
            <div key={i} style={{ opacity, position: 'absolute', inset: 0 }}>
              <ImpactTextScene
                sentence={scene.sentence}
                sceneFrame={sceneFrame}
                sceneDuration={sceneDuration}
              />
            </div>
          );
        }
      })}

      {/* Barra de progreso */}
      <ProgressBar progress={progress} />
    </AbsoluteFill>
  );
};
