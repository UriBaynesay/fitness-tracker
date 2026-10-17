import type { ReactNode } from "react";

// 2px-stroke line icons, as the design asks (inline SVG, never emoji).
function Icon({ children, size = 24, flipInRtl = false }: { children: ReactNode; size?: number; flipInRtl?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={flipInRtl ? "rtl-flip" : undefined}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = () => (
  <Icon>
    <path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </Icon>
);
export const ListIcon = () => (
  <Icon>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Icon>
);
export const ChartIcon = () => (
  <Icon>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Icon>
);
export const TargetIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 12h.01" />
  </Icon>
);
export const UserIcon = () => (
  <Icon>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  </Icon>
);
export const ChevronUpIcon = () => (
  <Icon size={20}>
    <path d="M6 15l6-6 6 6" />
  </Icon>
);
export const ChevronDownIcon = () => (
  <Icon size={20}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);
// Pointing toward the start of the line: left in English, right in Hebrew.
export const ChevronStartIcon = () => (
  <Icon size={20} flipInRtl>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
);
export const ChevronEndIcon = () => (
  <Icon size={20} flipInRtl>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);
export const CheckIcon = () => (
  <Icon>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
export const SearchIcon = () => (
  <Icon size={20}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Icon>
);
