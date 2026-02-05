import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';

interface Props {
  score: number;
  title: string;
}

export const PatternScoreReveal: React.FC<Props> = ({ score, title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fase 1: Título aparece y desaparece (0-60 frames = 0-2 seg)
  const titleOpacity = interpolate(frame, [0, 30, 40, 60], [0, 1, 1, 0], {
    extrapolateRight: 'clamp',
  });

  const titleScale = spring({
    frame: frame - 0,
    fps,
    config: {
      damping: 20,
    },
  });

  // Fase 2: "Analizando..." (60-150 frames = 2-5 seg)
  const analyzingOpacity = interpolate(frame, [60, 90, 120, 150], [0, 1, 1, 0], {
    extrapolateRight: 'clamp',
  });

  // Fase 3: Pattern Score aparece y desaparece (150-360 frames = 5-12 seg)
  const scoreAppear = interpolate(frame, [150, 180, 330, 360], [0, 1, 1, 0], {
    extrapolateRight: 'clamp',
  });

  const scoreScale = spring({
    frame: frame - 150,
    fps,
    config: {
      damping: 15,
      mass: 0.5,
    },
  });

  // Fase 4: Número del score cuenta desde 0 hasta el score final (210-270 frames = 7-9 seg)
  const currentScore = Math.round(
    interpolate(frame, [210, 270], [0, score], {
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.ease),
    })
  );

  // Fase 5: Detalles aparecen y desaparecen (270-360 frames = 9-12 seg)
  const detailsOpacity = interpolate(frame, [270, 300, 330, 360], [0, 1, 1, 0], {
    extrapolateRight: 'clamp',
  });

  // Fase 6: CTA final (360-450 frames = 12-15 seg)
  const ctaOpacity = interpolate(frame, [360, 390], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Color del score: rojo si es bajo (<40), amarillo medio (40-70), verde si alto
  const scoreColor = score < 40 ? '#ef4444' : score < 70 ? '#f59e0b' : '#10b981';

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0a0a0a',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {/* Gradiente de fondo */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(circle at top, #4c1d95 0%, #020617 55%)',
          opacity: 0.8,
        }}
      />

      {/* Orbes animados de fondo */}
      <AbsoluteFill style={{ overflow: 'hidden', opacity: 0.3 }}>
        <div
          style={{
            position: 'absolute',
            top: '20%',
            right: '10%',
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: '#a855f7',
            filter: 'blur(80px)',
            transform: `scale(${1 + Math.sin(frame * 0.02) * 0.2})`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '30%',
            left: '15%',
            width: 250,
            height: 250,
            borderRadius: '50%',
            background: '#06b6d4',
            filter: 'blur(80px)',
            transform: `scale(${1 + Math.cos(frame * 0.025) * 0.2})`,
          }}
        />
      </AbsoluteFill>

      {/* FASE 1: Título inicial */}
      {frame < 70 && (
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            padding: 60,
            opacity: titleOpacity,
            transform: `scale(${titleScale})`,
          }}
        >
          <h1
            style={{
              fontSize: 72,
              fontWeight: 'bold',
              color: '#fff',
              textAlign: 'center',
              lineHeight: 1.2,
              textShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            {title}
          </h1>
        </AbsoluteFill>
      )}

      {/* FASE 2: "Analizando..." con puntos animados */}
      {frame >= 60 && frame < 150 && (
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            opacity: analyzingOpacity,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <p
              style={{
                fontSize: 48,
                color: '#10b981',
                fontWeight: '600',
              }}
            >
              Analizando{'.'.repeat(Math.floor((frame % 30) / 10) + 1)}
            </p>
            <div
              style={{
                marginTop: 40,
                width: 200,
                height: 4,
                background: '#1e293b',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${interpolate(frame, [60, 150], [0, 100])}%`,
                  height: '100%',
                  background: 'linear-gradient(to right, #10b981, #06b6d4)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* FASE 3-4: Pattern Score Reveal */}
      {frame >= 150 && frame < 370 && (
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            opacity: scoreAppear,
            transform: `scale(${scoreScale})`,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <p
              style={{
                fontSize: 36,
                color: '#94a3b8',
                fontWeight: '600',
                marginBottom: 20,
                letterSpacing: 4,
              }}
            >
              PATTERN SCORE
            </p>
            <div
              style={{
                fontSize: 180,
                fontWeight: 'bold',
                color: scoreColor,
                textShadow: `0 0 60px ${scoreColor}80`,
                marginBottom: 10,
              }}
            >
              {currentScore}
              <span style={{ fontSize: 100, color: '#64748b' }}>/100</span>
            </div>

            {/* Barra visual del score */}
            <div
              style={{
                width: 400,
                height: 20,
                background: '#1e293b',
                borderRadius: 20,
                overflow: 'hidden',
                margin: '40px auto',
              }}
            >
              <div
                style={{
                  width: `${currentScore}%`,
                  height: '100%',
                  background: `linear-gradient(to right, ${scoreColor}, ${scoreColor}dd)`,
                  borderRadius: 20,
                  boxShadow: `0 0 20px ${scoreColor}`,
                }}
              />
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* FASE 5: Detalles del análisis */}
      {frame >= 270 && frame < 360 && (
        <AbsoluteFill
          style={{
            justifyContent: 'flex-end',
            alignItems: 'center',
            padding: 80,
            paddingBottom: 200,
            opacity: detailsOpacity,
          }}
        >
          <div style={{ width: '100%', maxWidth: 600 }}>
            <DetailItem icon="❌" text="Reciprocidad: Desbalanceada" delay={0} frame={frame - 270} />
            <DetailItem icon="⚠️" text="Tú estás 73% más invertido" delay={15} frame={frame - 270} />
            <DetailItem icon="🚩" text="Balance emocional: Crítico" delay={30} frame={frame - 270} />
          </div>
        </AbsoluteFill>
      )}

      {/* FASE 6: CTA Final */}
      {frame >= 360 && (
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            opacity: ctaOpacity,
          }}
        >
          <div style={{ textAlign: 'center', padding: 60 }}>
            <p
              style={{
                fontSize: 56,
                fontWeight: 'bold',
                color: '#fff',
                marginBottom: 30,
                lineHeight: 1.3,
              }}
            >
              Ahora todo tiene sentido 💀
            </p>
            <p
              style={{
                fontSize: 40,
                color: '#10b981',
                fontWeight: '600',
              }}
            >
              patternlabsai.com
            </p>
            <p
              style={{
                fontSize: 28,
                color: '#64748b',
                marginTop: 20,
              }}
            >
              Analiza tu chat gratis
            </p>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// Componente auxiliar para los items de detalles
const DetailItem: React.FC<{ icon: string; text: string; delay: number; frame: number }> = ({
  icon,
  text,
  delay,
  frame,
}) => {
  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const translateY = interpolate(frame, [delay, delay + 20], [20, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: 25,
        background: '#1e293b',
        borderRadius: 20,
        marginBottom: 20,
        opacity,
        transform: `translateY(${translateY}px)`,
        border: '2px solid #334155',
      }}
    >
      <span style={{ fontSize: 40 }}>{icon}</span>
      <p style={{ fontSize: 32, color: '#e2e8f0', fontWeight: '500' }}>{text}</p>
    </div>
  );
};
