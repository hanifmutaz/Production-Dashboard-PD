// Identitas lokasi dari mockup (LOC): nama & warna. Status On Hold dari API.
export const SITES = ['internal', 'sgp', 'systech'] as const;
export type Site = (typeof SITES)[number];

export const SITE_INFO: Readonly<Record<Site, { readonly name: string; readonly color: string }>> = {
  internal: { name: 'Hirose Internal', color: 'var(--acc)' },
  sgp: { name: 'Subcont SGP', color: 'var(--ok)' },
  systech: { name: 'Subcont Systech', color: '#8B7CF6' },
};

export const siteName = (k: string): string => SITE_INFO[k as Site]?.name ?? k;
