import { loadFont } from "@remotion/google-fonts/Inter";
import { Video } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700", "800"],
  subsets: ["latin"],
});

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;
export const DEMO_FRAMES = 30 * FPS;

// public/session.mp4 is one real take of the mod (demo/capture/session.tape),
// shown at RATE x. Every caption is placed by the second of the take it talks
// about (`raw`), so a new take only needs these numbers moved.
const RATE = 1.15;
const INTRO = 75;
const OUTRO = 770;
const OUTRO_FADE = 12;

const BASE = "#1e1e2e";
const ACCENT = "#f47a58";
const INK = "#f5f5fa";

const rawToFrame = (seconds: number): number =>
  INTRO + Math.round((seconds / RATE) * FPS);

type Highlight = { left: number; top: number; width: number; height: number };

// Where things sit in the 1280x720 take.
const PANE: Highlight = { left: 760, top: 6, width: 514, height: 634 };
const SPINNER: Highlight = { left: 8, top: 592, width: 700, height: 32 };

type Step = {
  from: number;
  to: number;
  text: string;
  highlight?: Highlight;
};

const STEPS: Step[] = [
  { from: 0.3, to: 6.5, text: "Ask Claude for something long…" },
  {
    from: 8.8,
    to: 12.6,
    text: "…and two seconds in, a lesson opens beside it.",
    highlight: PANE,
  },
  { from: 12.8, to: 15.2, text: "Answer the tutor while Claude keeps working." },
  {
    from: 15.4,
    to: 19,
    text: "It points at the mistake. It doesn't fix it for you.",
    highlight: PANE,
  },
  { from: 19.2, to: 22.6, text: "Try again. Now it's right." },
  {
    from: 22.8,
    to: 26.6,
    text: "Mistakes come back as flashcards, right in the spinner line.",
    highlight: SPINNER,
  },
];

const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 14 });
  const leave = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 34,
        top: 300,
        width: 660,
        padding: "18px 26px",
        borderRadius: 16,
        borderLeft: `7px solid ${ACCENT}`,
        background: "rgba(14, 14, 24, 0.94)",
        boxShadow: "0 18px 50px rgba(0, 0, 0, 0.55)",
        color: INK,
        fontFamily,
        fontWeight: 700,
        fontSize: 34,
        lineHeight: 1.25,
        letterSpacing: -0.4,
        opacity: enter * leave,
        transform: `translateY(${(1 - enter) * 22}px)`,
      }}
    >
      {text}
    </div>
  );
};

const Outline: React.FC<{ box: Highlight }> = ({ box }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const visible = interpolate(frame, [0, 8, durationInFrames - 8, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glow = 0.55 + 0.45 * Math.sin(frame / 5);

  return (
    <div
      style={{
        position: "absolute",
        ...box,
        borderRadius: 10,
        border: `3px solid ${ACCENT}`,
        boxShadow: `0 0 ${14 + glow * 16}px ${ACCENT}`,
        opacity: visible * (0.6 + glow * 0.4),
      }}
    />
  );
};

const Title: React.FC<{ subtitle: string }> = ({ subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logo = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  const sub = spring({ frame: frame - 10, fps, config: { damping: 200 }, durationInFrames: 24 });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
        color: INK,
      }}
    >
      <div
        style={{
          fontSize: 118,
          fontWeight: 800,
          letterSpacing: -4,
          opacity: logo,
          transform: `translateY(${(1 - logo) * 30}px)`,
        }}
      >
        lingo<span style={{ color: ACCENT }}>-</span>pane
      </div>
      <div
        style={{
          marginTop: 14,
          fontSize: 38,
          fontWeight: 500,
          opacity: sub * 0.85,
          transform: `translateY(${(1 - sub) * 18}px)`,
        }}
      >
        {subtitle}
      </div>
    </AbsoluteFill>
  );
};

export const Demo: React.FC = () => {
  const frame = useCurrentFrame();

  const introOut = interpolate(frame, [INTRO - 10, INTRO + 8], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const outroIn = interpolate(frame, [OUTRO, OUTRO + OUTRO_FADE], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill style={{ background: BASE }}>
      <Sequence from={INTRO} durationInFrames={OUTRO - INTRO + OUTRO_FADE}>
        <Video
          src={staticFile("session.mp4")}
          playbackRate={RATE}
          muted
          style={{ width: WIDTH, height: HEIGHT }}
        />
      </Sequence>

      {STEPS.map((step) => (
        <Sequence
          key={step.text}
          from={rawToFrame(step.from)}
          durationInFrames={rawToFrame(step.to) - rawToFrame(step.from)}
          layout="none"
        >
          {step.highlight ? <Outline box={step.highlight} /> : null}
          <Caption text={step.text} />
        </Sequence>
      ))}

      <AbsoluteFill style={{ opacity: introOut, background: BASE }}>
        <Title subtitle="Learn a language while Claude works." />
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: outroIn, background: BASE }}>
        <Sequence from={OUTRO}>
          <Title subtitle="A Claude Code mod. Type /lingo." />
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
