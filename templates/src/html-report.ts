import { V12, scoreColor, stageColor } from './theme.js';

interface Factor { label: string; value: string; raw: number; highlight: 'good' | 'warn' | 'bad' | 'neutral'; }
interface BenchmarkEntry { label: string; value: number; color?: string; is_you?: boolean; }
interface MeasuredItem { label: string; description: string; source: string; }
interface DimensionNarrative {
  dimension: string; index: number; stage: string; hours: number;
  narrative: string; formula: { expression: string; result: string };
  factors: Factor[]; measured: MeasuredItem[];
  benchmarks: BenchmarkEntry[];
  insight: { text: string; source: string } | null;
  action: { title: string; detail: string; lift: number; dim_code: string } | null;
}
interface AXPillarMapping {
  pillar: string;
  aiei_dimensions: string[];
  signals_contributing: string[];
  coverage: 'full' | 'partial' | 'none';
  assessment: string;
}
interface EpistemicSummary {
  dimensions_scored: number;
  dimensions_calibrating: number;
  signals_live: number;
  signals_fallback: number;
  signals_missing: number;
  assessment_mode: string;
  ax_pillars_covered: number;
  honesty_statement: string;
  what_this_score_does_not_know: string[];
}
interface PresentationData {
  overall: { index: number; stage: string; narrative: string; hours_total: number; hours_available: number };
  dimensions: Record<string, DimensionNarrative>;
  recommendations: Array<{ dimension: string; priority?: string; title: string; body: string; impact: string }>;
  axMapping?: AXPillarMapping[];
  epistemicSummary?: EpistemicSummary;
}
interface ReportInput {
  orgName: string;
  timestamp: string;
  schemaVersion: string;
  weightProfile: string;
  assessmentMode: string;
  scoringMode: string;
  scoredCoreCount: number;
  epistemicNote?: string;
  presentation: PresentationData;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function highlightColor(h: string): string {
  switch (h) {
    case 'good': return V12.scoreGood;
    case 'warn': return V12.scoreWarn;
    case 'bad': return V12.scoreBad;
    default: return V12.textSecondary;
  }
}

export function renderReport(input: ReportInput): string {
  const { orgName, timestamp, schemaVersion, weightProfile, assessmentMode, scoringMode, scoredCoreCount, epistemicNote, presentation } = input;
  const { overall, dimensions, recommendations } = presentation;

  const dimOrder = ['Q', 'R', 'L', 'C', 'S'] as const;
  const dimNames: Record<string, string> = { Q: 'Quality', R: 'Reliability', L: 'Lead Time', C: 'Cost Efficiency', S: 'Security' };

  const dimSections = dimOrder.map(d => {
    const n = dimensions[d];
    if (!n || n.index === 0) return '';

    const factorsHtml = n.factors.map(f =>
      `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid ${V12.border}">
        <span>${esc(f.label)}</span>
        <span style="color:${highlightColor(f.highlight)};font-weight:600">${esc(f.value)}</span>
      </div>`
    ).join('');

    const measuredHtml = n.measured.map(m =>
      `<tr><td style="padding:6px 12px;color:${V12.textPrimary}">${esc(m.label)}</td>
           <td style="padding:6px 12px;color:${V12.textSecondary}">${esc(m.description)}</td>
           <td style="padding:6px 12px;color:${V12.textMuted};font-size:0.85em">${esc(m.source)}</td></tr>`
    ).join('');

    const benchmarkHtml = n.benchmarks.map(b => {
      const color = b.is_you ? V12.orange : (b.color || V12.textMuted);
      const width = Math.max(b.value, 2);
      return `<div style="display:flex;align-items:center;gap:12px;margin:4px 0">
        <span style="width:100px;font-size:0.85em;color:${V12.textSecondary}">${esc(b.label)}</span>
        <div style="flex:1;background:${V12.border};border-radius:4px;height:20px;position:relative">
          <div style="width:${width}%;height:100%;background:${color};border-radius:4px"></div>
        </div>
        <span style="width:40px;text-align:right;font-weight:${b.is_you ? '700' : '400'};color:${color}">${b.value}</span>
      </div>`;
    }).join('');

    const insightHtml = n.insight
      ? `<div style="margin:16px 0;padding:12px 16px;background:${V12.bgCard};border-left:3px solid ${V12.purple};border-radius:0 6px 6px 0">
          <p style="margin:0;font-size:0.9em;color:${V12.textSecondary}">${esc(n.insight.text)}</p>
          <p style="margin:4px 0 0;font-size:0.8em;color:${V12.textMuted}">${esc(n.insight.source)}</p>
        </div>`
      : '';

    const actionHtml = n.action
      ? `<div style="margin:16px 0;padding:16px;background:linear-gradient(135deg, ${V12.purple}15, ${V12.orange}10);border:1px solid ${V12.purple}40;border-radius:8px">
          <div style="font-weight:600;color:${V12.orange};margin-bottom:4px">${esc(n.action.title)}</div>
          <div style="font-size:0.9em;color:${V12.textSecondary}">${esc(n.action.detail)}</div>
          <div style="margin-top:8px;font-size:0.85em;color:${V12.purple}">Estimated lift: +${n.action.lift} index points</div>
        </div>`
      : '';

    return `
    <section style="margin:40px 0;padding:32px;background:${V12.bgCard};border-radius:12px;border:1px solid ${V12.border}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
        <h2 style="margin:0;color:${V12.textPrimary}"><span style="color:${V12.purple}">${d}</span> ${esc(dimNames[d])}</h2>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:2.5em;font-weight:700;color:${scoreColor(n.index / 100)}">${n.index}</span>
          <span style="padding:4px 12px;border-radius:20px;font-size:0.85em;font-weight:600;background:${stageColor(n.stage)}20;color:${stageColor(n.stage)}">${esc(n.stage)}</span>
        </div>
      </div>

      <p style="color:${V12.textSecondary};line-height:1.6;margin:0 0 20px">${esc(n.narrative)}</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:20px">
        <div>
          <h3 style="font-size:0.9em;color:${V12.textMuted};margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em">Factors</h3>
          ${factorsHtml}
        </div>
        <div>
          <h3 style="font-size:0.9em;color:${V12.textMuted};margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em">Benchmarks</h3>
          ${benchmarkHtml}
        </div>
      </div>

      <details style="margin:16px 0">
        <summary style="cursor:pointer;color:${V12.purple};font-size:0.9em;font-weight:600">Formula</summary>
        <pre style="margin:8px 0;padding:12px;background:${V12.bg};border-radius:6px;font-family:${V12.fontMono};font-size:0.85em;color:${V12.textSecondary};overflow-x:auto;white-space:pre-wrap">${esc(n.formula.expression)}\n\n${esc(n.formula.result)}</pre>
      </details>

      ${measuredHtml ? `
      <details style="margin:16px 0">
        <summary style="cursor:pointer;color:${V12.purple};font-size:0.9em;font-weight:600">What We Measured</summary>
        <table style="width:100%;border-collapse:collapse;margin:8px 0">
          <tr style="border-bottom:1px solid ${V12.border}"><th style="text-align:left;padding:6px 12px;color:${V12.textMuted};font-size:0.85em">Metric</th><th style="text-align:left;padding:6px 12px;color:${V12.textMuted};font-size:0.85em">Value</th><th style="text-align:left;padding:6px 12px;color:${V12.textMuted};font-size:0.85em">Source</th></tr>
          ${measuredHtml}
        </table>
      </details>` : ''}

      ${insightHtml}
      ${actionHtml}

      ${n.hours > 0 ? `<div style="margin-top:16px;padding:8px 16px;background:${V12.bg};border-radius:6px;font-size:0.9em;color:${V12.textSecondary}">Estimated hours recovered: <strong style="color:${V12.orange}">${n.hours}/month</strong></div>` : ''}
    </section>`;
  }).join('');

  const recsHtml = recommendations.length > 0
    ? recommendations.map((r, i) =>
      `<div style="display:flex;gap:16px;padding:16px;background:${V12.bgCard};border-radius:8px;border:1px solid ${i === 0 ? V12.orange + '60' : V12.border};margin-bottom:12px">
        <div style="min-width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${i === 0 ? V12.orange : V12.purple};color:${V12.white};font-weight:700">${i + 1}</div>
        <div>
          <div style="font-weight:600;color:${V12.textPrimary}">${esc(r.title)}</div>
          <div style="font-size:0.9em;color:${V12.textSecondary};margin-top:4px">${esc(r.body)}</div>
          <div style="font-size:0.85em;color:${V12.purple};margin-top:4px">${esc(r.impact)} - ${esc(r.dimension)}</div>
        </div>
      </div>`
    ).join('')
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AIEI Report - ${esc(orgName)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: ${V12.font};
      background: ${V12.bg};
      color: ${V12.textPrimary};
      margin: 0;
      padding: 40px 20px;
      line-height: 1.5;
    }
    .container { max-width: 960px; margin: 0 auto; }
    a { color: ${V12.purple}; }
    details summary:hover { opacity: 0.8; }
    @media (max-width: 768px) {
      body { padding: 20px 12px; }
      .dim-grid { grid-template-columns: 1fr !important; }
    }
  </style>
</head>
<body>
<div class="container">

  <header style="text-align:center;margin-bottom:48px">
    <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:16px">
      <div style="width:32px;height:32px;background:${V12.orange};border-radius:6px"></div>
      <span style="font-size:0.9em;font-weight:600;color:${V12.textSecondary}">POSTMAN</span>
    </div>
    <h1 style="font-size:2.5em;margin:0;background:linear-gradient(135deg, ${V12.purple}, ${V12.pink});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">AIEI Report</h1>
    <p style="color:${V12.textSecondary};margin:8px 0 0">${esc(orgName)} - ${esc(timestamp.split('T')[0])}</p>
    <p style="color:${V12.textMuted};font-size:0.85em;margin:4px 0 0">Schema v${esc(schemaVersion)} | ${esc(weightProfile)} | ${esc(assessmentMode)} | ${esc(scoringMode)} | ${scoredCoreCount}/4 core scored</p>
  </header>

  <section style="text-align:center;margin-bottom:48px">
    <div style="font-size:6em;font-weight:800;background:linear-gradient(135deg, ${scoreColor(overall.index / 100)}, ${V12.purple});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${overall.index}</div>
    <div style="display:inline-block;padding:6px 20px;border-radius:24px;font-weight:600;background:${stageColor(overall.stage)}20;color:${stageColor(overall.stage)};font-size:1.1em;margin:8px 0">${esc(overall.stage)}</div>
    <p style="color:${V12.textSecondary};max-width:600px;margin:16px auto 0;line-height:1.6">${esc(overall.narrative)}</p>
    <div style="display:flex;justify-content:center;gap:32px;margin-top:24px">
      <div><span style="font-size:1.5em;font-weight:700;color:${V12.orange}">${overall.hours_total}</span><br><span style="font-size:0.85em;color:${V12.textMuted}">hrs/month recovered</span></div>
      <div><span style="font-size:1.5em;font-weight:700;color:${V12.purple}">${overall.hours_available}</span><br><span style="font-size:0.85em;color:${V12.textMuted}">hrs available next stage</span></div>
    </div>
  </section>

  ${epistemicNote ? `
  <div style="padding:16px;background:${V12.bgCard};border-radius:8px;border:1px solid ${V12.border};margin-bottom:32px">
    <div style="font-size:0.85em;font-weight:600;color:${V12.textMuted};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Limitations</div>
    <p style="margin:0;font-size:0.9em;color:${V12.textSecondary}">${esc(epistemicNote)}</p>
  </div>` : ''}

  ${dimSections}

  ${presentation.axMapping && presentation.axMapping.length > 0 ? `
  <section style="margin:40px 0;padding:32px;background:${V12.bgCard};border-radius:12px;border:1px solid ${V12.border}">
    <h2 style="margin:0 0 8px;color:${V12.textPrimary}"><span style="color:${V12.purple}">AX</span> Agent Experience Pillar Coverage</h2>
    <p style="margin:0 0 24px;font-size:0.9em;color:${V12.textSecondary}">How your APIs score across the four pillars that define agent experience.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="dim-grid">
      ${presentation.axMapping.map(p => {
        const coverageColor = p.coverage === 'full' ? V12.scoreGood : p.coverage === 'partial' ? V12.scoreWarn : V12.scoreBad;
        const coverageLabel = p.coverage === 'full' ? 'Covered' : p.coverage === 'partial' ? 'Partial' : 'Not Measured';
        return `<div style="padding:16px;border-radius:8px;border:1px solid ${V12.border};background:${V12.bg}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="font-weight:600;color:${V12.textPrimary}">${esc(p.pillar)}</span>
            <span style="padding:2px 10px;border-radius:12px;font-size:0.8em;font-weight:600;background:${coverageColor}20;color:${coverageColor}">${coverageLabel}</span>
          </div>
          <p style="margin:0;font-size:0.85em;color:${V12.textSecondary}">${esc(p.assessment)}</p>
          ${p.signals_contributing.length > 0 ? `<div style="margin-top:8px;font-size:0.8em;color:${V12.textMuted}">${p.signals_contributing.length} signal${p.signals_contributing.length !== 1 ? 's' : ''}: ${p.signals_contributing.slice(0, 4).map(s => esc(s)).join(', ')}${p.signals_contributing.length > 4 ? ', ...' : ''}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
  </section>` : ''}

  ${presentation.epistemicSummary ? `
  <section style="margin:40px 0;padding:32px;background:linear-gradient(135deg, ${V12.bgCard}, ${V12.bg});border-radius:12px;border:1px solid ${V12.orange}40">
    <h2 style="margin:0 0 16px;color:${V12.orange}">What This Score Doesn't Know</h2>
    <p style="margin:0 0 20px;color:${V12.textSecondary};line-height:1.6">${esc(presentation.epistemicSummary.honesty_statement)}</p>
    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:20px">
      <div style="text-align:center;padding:12px 20px;background:${V12.bg};border-radius:8px;border:1px solid ${V12.border}">
        <div style="font-size:1.8em;font-weight:700;color:${V12.purple}">${presentation.epistemicSummary.signals_live}</div>
        <div style="font-size:0.8em;color:${V12.textMuted}">Live Signals</div>
      </div>
      <div style="text-align:center;padding:12px 20px;background:${V12.bg};border-radius:8px;border:1px solid ${V12.border}">
        <div style="font-size:1.8em;font-weight:700;color:${V12.scoreWarn}">${presentation.epistemicSummary.signals_fallback}</div>
        <div style="font-size:0.8em;color:${V12.textMuted}">Fallback</div>
      </div>
      <div style="text-align:center;padding:12px 20px;background:${V12.bg};border-radius:8px;border:1px solid ${V12.border}">
        <div style="font-size:1.8em;font-weight:700;color:${V12.scoreBad}">${presentation.epistemicSummary.signals_missing}</div>
        <div style="font-size:0.8em;color:${V12.textMuted}">Not Measured</div>
      </div>
      <div style="text-align:center;padding:12px 20px;background:${V12.bg};border-radius:8px;border:1px solid ${V12.border}">
        <div style="font-size:1.8em;font-weight:700;color:${presentation.epistemicSummary.ax_pillars_covered === 4 ? V12.scoreGood : V12.scoreWarn}">${presentation.epistemicSummary.ax_pillars_covered}/4</div>
        <div style="font-size:0.8em;color:${V12.textMuted}">AX Pillars</div>
      </div>
    </div>
    ${presentation.epistemicSummary.what_this_score_does_not_know.length > 0 ? `
    <div style="margin-top:16px">
      <h3 style="font-size:0.9em;color:${V12.textMuted};text-transform:uppercase;letter-spacing:0.05em;margin:0 0 12px">Blind Spots</h3>
      ${presentation.epistemicSummary.what_this_score_does_not_know.map(b =>
        `<div style="padding:8px 12px;margin-bottom:6px;background:${V12.bg};border-radius:6px;border-left:3px solid ${V12.orange};font-size:0.85em;color:${V12.textSecondary}">${esc(b)}</div>`
      ).join('')}
    </div>` : ''}
  </section>` : ''}

  ${recsHtml ? `
  <section style="margin:40px 0">
    <h2 style="color:${V12.textPrimary};margin-bottom:20px">Recommended Actions</h2>
    ${recsHtml}
  </section>` : ''}

  <footer style="margin-top:60px;padding-top:24px;border-top:1px solid ${V12.border};text-align:center">
    <p style="color:${V12.textMuted};font-size:0.85em">Powered by <span style="color:${V12.orange}">@postmanlabs/aiei-engine</span> v${esc(schemaVersion)}</p>
    <p style="color:${V12.textMuted};font-size:0.8em">Formulas are versioned, auditable, and open source. Run <code style="color:${V12.purple}">aiei formula</code> to inspect.</p>
  </footer>

</div>
</body>
</html>`;
}
