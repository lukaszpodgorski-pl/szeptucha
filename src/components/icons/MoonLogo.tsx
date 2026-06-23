// App mark for Szeptucha — a crescent moon with soft "whisper" waves.
// The moon evokes the folk wise-woman (szeptucha) who heals by whispering;
// the waves carry the whisper (speech → text). Themed via fill-text/stroke-text.
const MoonLogo = ({
  width,
  height,
}: {
  width?: number | string;
  height?: number | string;
}) => (
  <svg
    width={width || 24}
    height={height || 24}
    viewBox="0 0 64 64"
    className="fill-text stroke-text"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M38 12a20 20 0 1 0 0 40 24 24 0 0 1 0-40z" strokeWidth="0" />
    <g fill="none" strokeWidth="3" strokeLinecap="round">
      <path d="M47 25c6 1 8.5 4 8.5 7s-2.5 6-8.5 7" />
      <path d="M48 32.5c2.8 0.5 4 1.8 4 2.5" opacity="0.7" />
    </g>
  </svg>
);

export default MoonLogo;
