import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig, Img, interpolate } from 'remotion';

interface VideoCompositionProps {
  audioUrl: string;
  text: string;
  backgroundImage?: string;
}

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  audioUrl,
  text,
  backgroundImage = '/default-bg.jpg',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Animación de fade in para el texto
  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Animación de escala suave
  const scale = interpolate(frame, [0, 30], [0.8, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Audio */}
      <Audio src={audioUrl} />

      {/* Background Image (opcional) */}
      {backgroundImage && (
        <Img
          src={backgroundImage}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.3,
          }}
        />
      )}

      {/* Text Overlay */}
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: 60,
        }}
      >
        <div
          style={{
            fontSize: 48,
            fontWeight: 'bold',
            color: 'white',
            textAlign: 'center',
            textShadow: '2px 2px 10px rgba(0,0,0,0.8)',
            opacity,
            transform: `scale(${scale})`,
            maxWidth: '80%',
            lineHeight: 1.4,
          }}
        >
          {text}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
