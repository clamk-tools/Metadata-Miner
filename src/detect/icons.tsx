import type { ReactNode } from "react";

// The icons: lines on a 24-unit grid, in the colour of the text around them. `bold` keeps the smallest ones readable.
export function Icon({ size = 16, bold, children }: { size?: number; bold?: boolean; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={bold ? 3 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

// A small cross: the same glyph on a labeled part of the name, on the selection and on a field card.
export function Cross({ size = 10 }: { size?: number }) {
  return (
    <Icon size={size} bold={size < 12}>
      <path d="M5 5l14 14M19 5L5 19" />
    </Icon>
  );
}
