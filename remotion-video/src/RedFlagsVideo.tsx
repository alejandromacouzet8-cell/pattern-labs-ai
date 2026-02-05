import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';

interface Props {
  flags: string[];
}

export const RedFlagsVideo: React.FC<Props> = ({ flags }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Hook inicial (0-90 frames = 0-3 seg)
  const hookOpacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const hookExit = interpolate(frame, [60, 90], [1, 0], {
    extrapolateRight: 'clamp',
  });

  // Red Flag #1 (90-240 frames = 3-8 seg)
  const flag1Start = 90;
  const flag1Opacity = interpolate(frame, [flag1Start, flag1Start + 30], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const flag1Exit = interpolate(frame, [220, 240], [1, 0], {
    extrapolateRight: 'clamp',
  });

  // Red Flag #2 (240-420 frames = 8-14 seg)
  const flag2Start = 240;
  const flag2Opacity = interpolate(frame, [flag2Start, flag2Start + 30], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const flag2Exit = interpolate(frame, [400, 420], [1, 0], {
    extrapolateRight: 'clamp',
  });

  // Red Flag #3 (420-600 frames = 14-20 seg)
  const flag3Start = 420;
  const flag3Opacity = interpolate(frame, [flag3Start, flag3Start + 30], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const flag3Exit = interpolate(frame, [580, 600], [1, 0], {
    extrapolateRight: 'clamp',
  });

  // CTA Final (600-750 frames = 20-25 seg)
  const ctaOpacity = interpolate(frame, [600, 630], [0, 1], {
    extrapolateRight: 'clamp',
  });

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
          background: 'radial-gradient(circle at center, #1e1b4b 0%, #020617 60%)',
          opacity: 0.9,
        }}
      />

      {/* HOOK INICIAL */}
      {frame < 90 && (
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            padding: 60,
            opacity: hookOpacity * hookExit,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <h1
              style={{
                fontSize: 56,
                fontWeight: 'bold',
                color: '#fff',
                lineHeight: 1.3,
                marginBottom: 30,
              }}
            >
              Analicé 1,000 chats que terminaron mal.
            </h1>
            <p
              style={{
                fontSize: 44,
                color: '#10b981',
                fontWeight: '600',
              }}
            >
              Estas 3 señales SIEMPRE estaban:
            </p>
          </div>
        </AbsoluteFill>
      )}

      {/* RED FLAG #1 */}
      {frame >= 90 && frame < 240 && (
        <RedFlagCard
          number={1}
          title={flags[0]}
          description="Una persona escribe 3x más que la otra. La IA lo detecta en segundos."
          icon="📊"
          opacity={flag1Opacity * flag1Exit}
          frame={frame - flag1Start}
          fps={fps}
        />
      )}

      {/* RED FLAG #2 */}
      {frame >= 240 && frame < 420 && (
        <RedFlagCard
          number={2}
          title={flags[1]}
          description="Cuando dejan de explicarse, es porque ya no les importa."
          icon="💬"
          opacity={flag2Opacity * flag2Exit}
          frame={frame - flag2Start}
          fps={fps}
        />
      )}

      {/* RED FLAG #3 */}
      {frame >= 420 && frame < 600 && (
        <RedFlagCard
          number={3}
          title={flags[2]}
          description="Tú respondes en 2 min. Ellos en 4 horas. Red flag nivel: MÁXIMO 🚩"
          icon="⏰"
          opacity={flag3Opacity * flag3Exit}
          frame={frame - flag3Start}
          fps={fps}
        />
      )}

      {/* CTA FINAL */}
      {frame >= 600 && (
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            padding: 60,
            opacity: ctaOpacity,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <p
              style={{
                fontSize: 52,
                fontWeight: 'bold',
                color: '#fff',
                marginBottom: 40,
                lineHeight: 1.3,
              }}
            >
              ¿Tu chat tiene estas señales?
            </p>
            <p
              style={{
                fontSize: 44,
                color: '#10b981',
                fontWeight: '600',
                marginBottom: 30,
              }}
            >
              patternlabsai.com
            </p>
            <p
              style={{
                fontSize: 32,
                color: '#64748b',
              }}
            >
              Descúbrelo en 30 segundos
            </p>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// Componente para cada Red Flag Card
const RedFlagCard: React.FC<{
  number: number;
  title: string;
  description: string;
  icon: string;
  opacity: number;
  frame: number;
  fps: number;
}> = ({ number, title, description, icon, opacity, frame, fps }) => {
  const scale = spring({
    frame,
    fps,
    config: {
      damping: 20,
    },
  });

  const descriptionOpacity = interpolate(frame, [30, 60], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        padding: 80,
        opacity,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 800,
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: 40,
          padding: 60,
          border: '3px solid #ef4444',
          boxShadow: '0 0 80px rgba(239, 68, 68, 0.3)',
          transform: `scale(${scale})`,
        }}
      >
        {/* Número de la red flag */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 100,
            height: 100,
            borderRadius: 25,
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            marginBottom: 40,
            fontSize: 56,
            fontWeight: 'bold',
            color: '#fff',
          }}
        >
          {number}
        </div>

        {/* Icono */}
        <div
          style={{
            fontSize: 80,
            marginBottom: 30,
            textAlign: 'center',
          }}
        >
          {icon}
        </div>

        {/* Título */}
        <h2
          style={{
            fontSize: 52,
            fontWeight: 'bold',
            color: '#fff',
            marginBottom: 30,
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>

        {/* Descripción */}
        <p
          style={{
            fontSize: 36,
            color: '#94a3b8',
            textAlign: 'center',
            lineHeight: 1.5,
            opacity: descriptionOpacity,
          }}
        >
          {description}
        </p>
      </div>
    </AbsoluteFill>
  );
};
