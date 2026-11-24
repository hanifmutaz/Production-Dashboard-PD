// Ikon diekstrak verbatim dari mockup (objek IC + fungsi ic()). Jangan menggambar ulang.
export const ICONS: Readonly<Record<string, string>> = {
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16" />\n  <path d="m19 9-5 5-4-4-3 3" />',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1" />\n  <rect width="7" height="7" x="14" y="3" rx="1" />\n  <rect width="7" height="7" x="14" y="14" rx="1" />\n  <rect width="7" height="7" x="3" y="14" rx="1" />',
  gauge: '<path d="m12 14 4-4" />\n  <path d="M3.34 19a10 10 0 1 1 17.32 0" />',
  table: '<path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />',
  bld: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />\n  <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />\n  <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />\n  <path d="M10 6h4" />\n  <path d="M10 10h4" />\n  <path d="M10 14h4" />\n  <path d="M10 18h4" />',
  building:
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />\n  <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />\n  <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />\n  <path d="M10 6h4" />\n  <path d="M10 10h4" />\n  <path d="M10 14h4" />\n  <path d="M10 18h4" />',
  lines:
    '<path d="M3 12h.01" />\n  <path d="M3 18h.01" />\n  <path d="M3 6h.01" />\n  <path d="M8 12h13" />\n  <path d="M8 18h13" />\n  <path d="M8 6h13" />',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />\n  <path d="M14 2v4a2 2 0 0 0 2 2h4" />\n  <path d="M10 9H8" />\n  <path d="M16 13H8" />\n  <path d="M16 17H8" />',
  chev: '<path d="m6 9 6 6 6-6" />',
  sun: '<circle cx="12" cy="12" r="4" />\n  <path d="M12 2v2" />\n  <path d="M12 20v2" />\n  <path d="m4.93 4.93 1.41 1.41" />\n  <path d="m17.66 17.66 1.41 1.41" />\n  <path d="M2 12h2" />\n  <path d="M20 12h2" />\n  <path d="m6.34 17.66-1.41 1.41" />\n  <path d="m19.07 4.93-1.41 1.41" />',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />',
  panel: '<rect width="18" height="18" x="3" y="3" rx="2" />\n  <path d="M9 3v18" />\n  <path d="m16 15-3-3 3-3" />',
  panelOpen: '<rect width="18" height="18" x="3" y="3" rx="2" />\n  <path d="M9 3v18" />\n  <path d="m14 9 3 3-3 3" />',
  menu: '<line x1="4" x2="20" y1="12" y2="12" />\n  <line x1="4" x2="20" y1="6" y2="6" />\n  <line x1="4" x2="20" y1="18" y2="18" />',
  srch: '<circle cx="11" cy="11" r="8" />\n  <path d="m21 21-4.3-4.3" />',
  cal: '<path d="M8 2v4" />\n  <path d="M16 2v4" />\n  <rect width="18" height="18" x="3" y="4" rx="2" />\n  <path d="M3 10h18" />\n  <path d="M8 14h.01" />\n  <path d="M12 14h.01" />\n  <path d="M16 14h.01" />\n  <path d="M8 18h.01" />\n  <path d="M12 18h.01" />\n  <path d="M16 18h.01" />',
  calendar:
    '<path d="M8 2v4" />\n  <path d="M16 2v4" />\n  <rect width="18" height="18" x="3" y="4" rx="2" />\n  <path d="M3 10h18" />\n  <path d="M8 14h.01" />\n  <path d="M12 14h.01" />\n  <path d="M16 14h.01" />\n  <path d="M8 18h.01" />\n  <path d="M12 18h.01" />\n  <path d="M16 18h.01" />',
  user: '<circle cx="12" cy="8" r="5" />\n  <path d="M20 21a8 8 0 0 0-16 0" />',
  clock: '<circle cx="12" cy="12" r="10" />\n  <polyline points="12 6 12 12 16 14" />',
  edit: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />\n  <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />',
  dl: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />\n  <polyline points="7 10 12 15 17 10" />\n  <line x1="12" x2="12" y1="15" y2="3" />',
  full: '<path d="M8 3H5a2 2 0 0 0-2 2v3" />\n  <path d="M21 8V5a2 2 0 0 0-2-2h-3" />\n  <path d="M3 16v3a2 2 0 0 0 2 2h3" />\n  <path d="M16 21h3a2 2 0 0 0 2-2v-3" />',
  restore:
    '<path d="M8 3v3a2 2 0 0 1-2 2H3" />\n  <path d="M21 8h-3a2 2 0 0 1-2-2V3" />\n  <path d="M3 16h3a2 2 0 0 1 2 2v3" />\n  <path d="M16 21v-3a2 2 0 0 1 2-2h3" />',
  logout:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />\n  <polyline points="16 17 21 12 16 7" />\n  <line x1="21" x2="9" y1="12" y2="12" />',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />\n  <path d="m9 12 2 2 4-4" />',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />\n  <circle cx="12" cy="12" r="3" />',
  close: '<path d="M18 6 6 18" />\n  <path d="m6 6 12 12" />',
  trend:
    '<path d="M12 16v5" />\n  <path d="M16 14v7" />\n  <path d="M20 10v11" />\n  <path d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15" />\n  <path d="M4 18v3" />\n  <path d="M8 14v7" />',
  layers:
    '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />\n  <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />\n  <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />',
  screen:
    '<rect width="20" height="14" x="2" y="3" rx="2" />\n  <line x1="8" x2="16" y1="21" y2="21" />\n  <line x1="12" x2="12" y1="17" y2="21" />',
  next: '<path d="m9 18 6-6-6-6" />',
  back: '<path d="m15 18-6-6 6-6" />',
  target: '<circle cx="12" cy="12" r="10" />\n  <circle cx="12" cy="12" r="6" />\n  <circle cx="12" cy="12" r="2" />',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />\n  <path d="m3.3 7 8.7 5 8.7-5" />\n  <path d="M12 22V12" />',
  gap: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />\n  <polyline points="16 17 22 17 22 11" />',
  trophy:
    '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />\n  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />\n  <path d="M4 22h16" />\n  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />\n  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />\n  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />',
  up: '<path d="m5 12 7-7 7 7" />\n  <path d="M12 19V5" />',
  down: '<path d="M12 5v14" />\n  <path d="m19 12-7 7-7-7" />',
  sort: '<path d="m21 16-4 4-4-4" />\n  <path d="M17 20V4" />\n  <path d="m3 8 4-4 4 4" />\n  <path d="M7 4v16" />',
};

// Tambahan dari Object.assign(IC, {...}) di mockup.
export const EXTRA_ICONS: Readonly<Record<string, string>> = {
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M12 17v4m-4 0h8"/>',
  plus: '<path d="M5 12h14m-7-7v14"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
};
