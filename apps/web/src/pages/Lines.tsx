// Port V.lines mockup → GET /api/v3/lines.
import { PageLead, Soon } from '../components/common';
import { Icon } from '../lib/icons';
import { useConfig } from '../lib/kpi';
import { siteName } from '../lib/sites';
import { useApi } from '../lib/useApi';

interface LineRow {
  readonly line_code: string;
  readonly description: string;
  readonly shift_scheme: number;
  readonly location: string;
  readonly series: string;
}

export function Lines() {
  const { raw } = useConfig();
  const lines = useApi<LineRow[]>('/api/v3/lines');
  const kioskLine = String((raw.get('config.display')?.value as { kioskLine?: string } | undefined)?.kioskLine ?? '');
  const featured = lines.data?.find((l) => l.line_code === kioskLine);
  return (
    <div className="page">
      <PageLead note="Tampilan line">
        {featured ? (
          <a className="btn" href={`#line-${featured.line_code.toLowerCase()}`}>
            <Icon name="monitor" size={16} /> Buka kiosk {featured.line_code}
          </a>
        ) : null}
      </PageLead>
      {lines.error ? <Soon>{lines.error}</Soon> : null}
      {lines.data && lines.data.length === 0 ? (
        <Soon>Belum ada line terdaftar. Admin dapat menambah line di Settings → Master Produksi → Line.</Soon>
      ) : null}
      <div className="lg">
        {(lines.data ?? []).map((l) => (
          <a key={l.line_code} className="lc" href={`#line-${l.line_code.toLowerCase()}`}>
            <b>{l.line_code}</b>
            <span>{l.description || l.series || siteName(l.location)}</span>
            <i className="sh" style={{ fontStyle: 'normal' }}>
              {l.shift_scheme} SHIFT
            </i>
          </a>
        ))}
      </div>
    </div>
  );
}
