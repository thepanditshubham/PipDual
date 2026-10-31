/**
 * avatar.ts
 * The picture shown wherever a player has not uploaded one. An inline SVG
 * keeps the fallback original, tiny, and free of any external asset.
 */
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#2b2b46"/>
  <circle cx="32" cy="25" r="11" fill="#8f88ab"/>
  <path d="M12 58c2-12 11-18 20-18s18 6 20 18" fill="#8f88ab"/>
</svg>`;

export const DEFAULT_AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(FALLBACK_SVG)}`;
