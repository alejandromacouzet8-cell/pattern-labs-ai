import { Composition } from 'remotion';
import { PatternScoreReveal } from './PatternScoreReveal';
import { RedFlagsVideo } from './RedFlagsVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Video 1: POV Pattern Score Reveal (15 seg - Instagram Reel) */}
      <Composition
        id="PatternScoreReveal"
        component={PatternScoreReveal}
        durationInFrames={450} // 15 segundos a 30fps
        fps={30}
        width={1080}
        height={1920} // Vertical para Instagram/TikTok
        defaultProps={{
          score: 23,
          title: 'POV: La IA analizó mi chat...',
        }}
      />

      {/* Video 2: 3 Red Flags que todos ignoran (25 seg) */}
      <Composition
        id="RedFlagsVideo"
        component={RedFlagsVideo}
        durationInFrames={750} // 25 segundos a 30fps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          flags: [
            'Asimetría en mensajes',
            'Respuestas monosílabas',
            'Tiempo de respuesta desigual',
          ],
        }}
      />
    </>
  );
};
