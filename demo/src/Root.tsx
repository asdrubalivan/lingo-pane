import { Composition } from "remotion";
import { Demo, DEMO_FRAMES, FPS, HEIGHT, WIDTH } from "./Demo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LingoPaneDemo"
      component={Demo}
      durationInFrames={DEMO_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
