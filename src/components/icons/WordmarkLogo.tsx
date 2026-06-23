import React from "react";

// Brand name rendered by the wordmark. Kept as a constant (not a JSX literal)
// so it is excluded from i18n translation.
const BRAND_NAME = "Szeptucha";

// Text-based brand wordmark for Szeptucha.
// NOTE: This is a placeholder rendered from system fonts. Replace with custom
// SVG artwork when ready.
const WordmarkLogo = ({
  width,
  height,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) => {
  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox="0 0 1000 328"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="164"
        textLength="1000"
        lengthAdjust="spacingAndGlyphs"
        dominantBaseline="central"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontSize="240"
        fontWeight="800"
        letterSpacing="-6"
        fill="var(--color-logo-primary)"
      >
        {BRAND_NAME}
      </text>
    </svg>
  );
};

export default WordmarkLogo;
