import React from "react";

/**
 * Approved Sahayog symbol (hands holding food, clothing and a blood drop).
 * Always square, never stretched or cropped: width/height are equal and CSS uses object-fit: contain.
 * Pass alt="" when the visible "Sahayog" wordmark sits next to it (decorative), or alt="Sahayog" when alone.
 */
export const LOGO_SRC = "/images/sahayog-logo.png";

export function BrandLogo({ size = 40, alt = "", className = "" }) {
  return (
    <img
      src={LOGO_SRC}
      width={size}
      height={size}
      alt={alt}
      className={`brand-logo ${className}`.trim()}
      decoding="async"
      draggable="false"
    />
  );
}
