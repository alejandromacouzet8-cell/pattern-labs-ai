import { Composition } from 'remotion';
import { VideoComposition } from './VideoComposition';
import { PatternLabsVideoComposition } from './PatternLabsVideoComposition';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PatternLabsVoiceVideo"
        component={PatternLabsVideoComposition}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          audioPath: '/audio/voice_default.mp3',
          text: 'Texto de ejemplo',
        }}
      />
      <Composition
        id="VoiceVideo"
        component={VideoComposition}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          audioUrl: '/audio/voice_default.mp3',
          text: 'Texto de ejemplo',
          backgroundImage: '',
        }}
      />
    </>
  );
};
