import { EXTRA_ICONS, ICONS } from '../iconData';

const ALL: Readonly<Record<string, string>> = { ...ICONS, ...EXTRA_ICONS };

/** Port 1:1 fungsi ic(n, s) mockup. Isi path = konstanta dari mockup (bukan input pengguna). */
export function Icon({ name, size = 18 }: { readonly name: string; readonly size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: ALL[name] ?? '' }}
    />
  );
}
