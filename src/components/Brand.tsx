// The product's name and mark, in one place — the sidebar, the sign-in page and anything
// else that shows the brand read these, so a logo change is a change to this file only.
export const BRAND_NAME = "Brelo";

// The Brelo mark: a rounded Pine square with the white "B". Drawn inline from the logo's
// own SVG (public/favicon.svg is the same artwork), so it is crisp at any size and needs
// no network request. The green is the brand's fixed colour, not a theme token — a logo
// does not change with dark mode.
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width={size} height={size}
      role="img" aria-label={BRAND_NAME} style={{ display: "block", flexShrink: 0 }}>
      <rect width="512" height="512" rx="143" fill="#178A4C" />
      <g fill="none" stroke="#fff" strokeWidth="46" strokeLinecap="round" strokeLinejoin="round">
        <path d="M166 384V128H282a62 62 0 0 1 0 124M282 252H294a66 66 0 0 1 0 132H166" />
      </g>
      <circle cx="222" cy="254" r="20" fill="#fff" />
    </svg>
  );
}
