import type { ReactNode, SVGProps } from "react";

/**
 * Minimal line-icon set (24×24, 1.75 stroke, round joins) used across the app
 * shell and dashboards. Icons inherit `currentColor` and size from `.icon`.
 */
const PATHS = {
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.5V19a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2.5" />
      <path d="M4 10h16M8.5 3v4M15.5 3v4" />
    </>
  ),
  flow: (
    <>
      <path d="M4 8h13M14 5l3 3-3 3" />
      <path d="M20 16H7M10 13l-3 3 3 3" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17v3" />
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <path d="M16 13.5h.01" />
    </>
  ),
  bars: <path d="M5 20V11M10 20V5M15 20v-7M20 20V9" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 12h.01" />
    </>
  ),
  trend: (
    <>
      <path d="M4 17l5-5 3.5 3.5L20 8" />
      <path d="M15 8h5v5" />
    </>
  ),
  growth: (
    <>
      <path d="M4 20h16" />
      <path d="M6 16c3 0 4-9 12-10" />
      <path d="M14.5 5.5 18 6l-.8 3.4" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="1.5" />
      <path d="M9 8h1.5M13.5 8H15M9 12h1.5M13.5 12H15M10.5 20v-4h3v4" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12V20l-2.5-1.5L13 20l-2-1.5L8.5 20 6 18.5Z" />
      <path d="M9 8.5h6M9 12h6" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 3.5 20 6.5l-3 3" />
      <path d="M4 11.5v-1a4 4 0 0 1 4-4h12" />
      <path d="M7 20.5l-3-3 3-3" />
      <path d="M20 12.5v1a4 4 0 0 1-4 4H4" />
    </>
  ),
  list: <path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  plane: (
    <path d="M10 13.5 3.5 11l1-2 6.5 1 4.5-5.2a1.9 1.9 0 0 1 3 2.2L14.5 12l1 6.5-2 1-2.5-6Zm0 0-3 3" />
  ),
  star: <path d="m12 4 2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8Z" />,
  spade: (
    <>
      <path d="M12 3.5C9 7 5 9.5 5 13a3.5 3.5 0 0 0 7 .6 3.5 3.5 0 0 0 7-.6c0-3.5-4-6-7-9.5Z" />
      <path d="M12 13.5V20M9.5 20h5" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="9" width="16" height="4" rx="1" />
      <path d="M5.5 13v6a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-6M12 9v11" />
      <path d="M12 9c-1.5-4-6-4.5-6-2s3 2 6 2Zm0 0c1.5-4 6-4.5 6-2s-3 2-6 2Z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  bank: (
    <>
      <path d="M4 9.5 12 4.5l8 5" />
      <path d="M5 20h14M6.5 10v7M10.5 10v7M13.5 10v7M17.5 10v7M4.5 17h15" />
    </>
  ),
  card: (
    <>
      <rect x="3.5" y="6" width="17" height="12.5" rx="2.5" />
      <path d="M3.5 10.5h17M7 14.5h3" />
    </>
  ),
  pie: (
    <>
      <path d="M12 4a8 8 0 1 0 8 8h-8Z" />
      <path d="M15 3.8A8 8 0 0 1 20.2 9H15Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 5 6v5.5c0 4.3 3 7.3 7 9 4-1.7 7-4.7 7-9V6Z" />
      <path d="m9.5 12 2 2 3.5-4" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="10" cy="8" rx="5.5" ry="3" />
      <path d="M4.5 8v4c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3V8" />
      <path d="M8.5 15v2c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-4c0-1.3-1.5-2.4-3.6-2.8" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c.8-3.2 3.6-5 7-5s6.2 1.8 7 5" />
    </>
  ),
  menu: <path d="M4.5 7.5h15M4.5 12h15M4.5 16.5h15" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  more: (
    <>
      <rect x="4.5" y="4.5" width="6" height="6" rx="1.5" />
      <rect x="13.5" y="4.5" width="6" height="6" rx="1.5" />
      <rect x="4.5" y="13.5" width="6" height="6" rx="1.5" />
      <rect x="13.5" y="13.5" width="6" height="6" rx="1.5" />
    </>
  ),
  "chevron-right": <path d="m9.5 6 6 6-6 6" />,
  "chevron-left": <path d="m14.5 6-6 6 6 6" />,
  "chevron-down": <path d="m6 9.5 6 6 6-6" />,
  "arrow-up": <path d="M12 19V5M6 11l6-6 6 6" />,
  "arrow-down": <path d="M12 5v14M6 13l6 6 6-6" />,
  "arrow-up-right": <path d="M7 17 17 7M9 7h8v8" />,
  "arrow-down-left": <path d="M17 7 7 17M15 17H7V9" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: (
    <>
      <path d="M12 4 3.5 19h17Z" />
      <path d="M12 10v4.5M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.5h.01" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13.5 6.5 6h11L20 13.5V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
      <path d="M4 13.5h4.5l1 2.5h5l1-2.5H20" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

type Props = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  /** Pixel size; defaults to the `.icon` CSS size (18px). */
  size?: number;
};

export function Icon({ name, size, className, ...rest }: Props) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={size ? { width: size, height: size } : undefined}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
