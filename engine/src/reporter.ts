import {
  CompositeResult,
  Dimension,
  NarrativeProfile,
  ReportFormat,
  CORE_DIMENSIONS,
  WEIGHT_PROFILES,
  RunGuidance,
} from './types.js';
import { DIMENSIONS } from './dimensions.js';

const DEFAULT_PROFILE: NarrativeProfile = {
  name: 'default',
  quotes: {},
};

export function renderReport(
  result: CompositeResult,
  format: ReportFormat,
  profile?: NarrativeProfile,
): string {
  const np = profile || DEFAULT_PROFILE;
  switch (format) {
    case 'json':
      return renderJson(result);
    case 'summary':
      return renderSummary(result, np);
    case 'html':
      return renderHtml(result, np);
  }
}

function renderJson(result: CompositeResult): string {
  return JSON.stringify(result, null, 2);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripBoldMarkers(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '$1');
}

function fmt(score: number): string {
  return score.toFixed(3);
}

function statusLabel(status: string): string {
  if (status === 'calibrating') return ' [CALIBRATING]';
  if (status === 'unavailable') return ' [UNAVAILABLE]';
  return '';
}

function bar(score: number, width = 20): string {
  const filled = Math.round(score * width);
  return '[' + '#'.repeat(filled) + '-'.repeat(width - filled) + ']';
}

// ---------------------------------------------------------------------------
// Summary (text) format
// ---------------------------------------------------------------------------

function renderSummary(result: CompositeResult, profile: NarrativeProfile): string {
  const {
    composite,
    dimensions,
    weightProfile,
    calibrating,
    orgName,
    timestamp,
    schemaVersion,
    assessmentMode,
    scoringMode,
    partialComposite,
    scoredCoreCount,
    epistemicNote,
  } = result;
  const wp = WEIGHT_PROFILES[weightProfile];

  const lines: string[] = [
    `AIEI Report: ${orgName}`,
    `Generated: ${timestamp}`,
    `Schema: v${schemaVersion}`,
    `Weight Profile: ${weightProfile}${wp ? '' : ' (unknown)'}`,
    '',
  ];

  if (wp) {
    lines.push(`Profile Rationale: ${wp.rationale}`);
    lines.push('');
  }

  lines.push(
    `Mode: ${assessmentMode} | Scoring: ${scoringMode} | Core dimensions scored: ${scoredCoreCount}/4`,
  );
  if (partialComposite) {
    lines.push(
      'Note: Partial composite — not all QLRC dimensions scored. Interpret as readiness signal, not full index.',
    );
  }
  lines.push('');
  if (epistemicNote) {
    lines.push('--- Limitations ---');
    lines.push(`  ${epistemicNote}`);
    lines.push('');
  }

  if (result.runGuidance) {
    lines.push(...renderRunGuidanceSummaryLines(result.runGuidance));
  } else if (result.productDomainGuidance) {
    lines.push(...renderProductDomainSummaryLines(result.productDomainGuidance));
  }

  // Core dimensions
  lines.push(`Composite: ${fmt(composite)}  ${bar(composite)}`);
  lines.push('');
  lines.push('--- Core Dimensions (QLRC) ---');

  for (const dim of CORE_DIMENSIONS) {
    const ds = dimensions[dim];
    const info = DIMENSIONS[dim];
    lines.push(
      `  ${dim} (${info.name}): ${fmt(ds.score)}  ${bar(ds.score)}${statusLabel(ds.status)}`,
    );
    if (ds.status === 'calibrating' && ds.calibrationMessage) {
      lines.push(`    ${ds.calibrationMessage}`);
    }
    if (ds.connectorsSourcing.length > 0) {
      lines.push(`    Sources: ${ds.connectorsSourcing.join(', ')}`);
    }
    if (ds.dataQuality) {
      lines.push(`    Data quality: ${ds.dataQuality}`);
    }
  }

  // S supplemental
  lines.push('');
  lines.push('--- Security Posture (Supplemental) ---');
  const sDs = dimensions.S;
  if (sDs.status === 'scored') {
    lines.push(`  S (Security): ${fmt(sDs.score)}  ${bar(sDs.score)}`);
    if (sDs.connectorsSourcing.length > 0) {
      lines.push(`    Sources: ${sDs.connectorsSourcing.join(', ')}`);
    }
  } else {
    lines.push('  S (Security): Not configured');
    lines.push(`    ${DIMENSIONS.S.withoutIt}`);
  }

  // Calibration notice
  if (calibrating.length > 0) {
    lines.push('');
    lines.push('--- Calibration Notice ---');
    for (const dim of calibrating) {
      const info = DIMENSIONS[dim];
      lines.push(`  ${dim} (${info.name}): ${info.calibrating}`);
    }
  }

  // What We Measured
  lines.push('');
  lines.push('--- What We Measured ---');
  for (const dim of ['Q', 'L', 'R', 'C', 'S'] as Dimension[]) {
    const info = DIMENSIONS[dim];
    const ds = dimensions[dim];
    if (ds.status === 'scored') {
      lines.push(`  ${dim} (${info.name}): ${info.explanation}`);
    } else if (ds.status === 'calibrating') {
      lines.push(`  ${dim} (${info.name}): Calibrating. ${info.calibrating}`);
    } else if (ds.status === 'unavailable') {
      lines.push(`  ${dim} (${info.name}): Not measured. ${info.withoutIt}`);
    }
  }

  // Gap analysis
  if (result.weakest && result.strongest) {
    lines.push('');
    lines.push('--- Gap Analysis ---');
    lines.push(
      `  Strongest: ${result.strongest.dimension} (${fmt(result.strongest.score)})`,
    );
    lines.push(
      `  Weakest:   ${result.weakest.dimension} (${fmt(result.weakest.score)})`,
    );
    lines.push(`  Gap:       ${fmt(result.gap)}`);
  }

  // Custom narrative quotes
  const quoteKeys = Object.keys(profile.quotes);
  if (quoteKeys.length > 0) {
    lines.push('');
    lines.push('--- Stakeholder Context ---');
    for (const [key, quote] of Object.entries(profile.quotes)) {
      if (quote) lines.push(`  ${key}: "${quote}"`);
    }
  }

  return lines.join('\n');
}

function renderProductDomainSummaryLines(g: NonNullable<CompositeResult['productDomainGuidance']>): string[] {
  const lines: string[] = [];
  lines.push('--- In-product support: identity, streaming, contract drift ---');
  lines.push(stripBoldMarkers(g.intro));
  lines.push(stripBoldMarkers(g.whenThisApplies));
  lines.push('');
  for (const t of g.topics) {
    lines.push(`[${t.title}]`);
    lines.push(`  In the score: ${stripBoldMarkers(t.inProduct)}`);
    lines.push(`  Not covered: ${stripBoldMarkers(t.notCovered)}`);
    lines.push(
      `  Connectors in use that help: ${t.connectorsThatHelp.join(', ') || '(none yet — see recommended connectors in API JSON)'}`,
    );
    lines.push(`  Next step: ${stripBoldMarkers(t.suggestedNextStep)}`);
    lines.push('');
  }
  if (g.readinessHint) {
    lines.push('Readiness / depth');
    lines.push(`  ${stripBoldMarkers(g.readinessHint)}`);
    lines.push('');
  }
  return lines;
}

function renderRunGuidanceSummaryLines(rg: RunGuidance): string[] {
  const lines: string[] = [];
  lines.push('--- Run guidance (setup, literacy, workflow, signals, ops) ---');
  lines.push('');

  const su = rg.setup;
  lines.push('[Setup]');
  lines.push(stripBoldMarkers(su.intro));
  if (su.connectorHints.length > 0) {
    lines.push('  Connector fixes:');
    for (const h of su.connectorHints) {
      lines.push(`    ${h.connector}: ${stripBoldMarkers(h.error || 'failed')}`);
      lines.push(`      Next: ${stripBoldMarkers(h.nextFix)}`);
    }
  } else {
    lines.push('  No configured-but-failed connectors this run.');
  }
  lines.push(`  Suggested connectors to fill gaps: ${su.minimalViableConnectors.join(', ') || '(see coverage in validation JSON)'}`);
  lines.push(`  ${stripBoldMarkers(su.configFileHint)}`);
  lines.push(`  validation.ready: ${su.validationReady}`);
  lines.push('');

  const sl = rg.scoreLiteracy;
  lines.push('[Score literacy]');
  lines.push(stripBoldMarkers(sl.headline));
  for (const b of sl.bullets) lines.push(`  - ${stripBoldMarkers(b)}`);
  lines.push(`  Composite: ${stripBoldMarkers(sl.compositeInterpretation)}`);
  lines.push(`  Comparability: ${stripBoldMarkers(sl.comparability)}`);
  lines.push(`  Scoring mode: ${stripBoldMarkers(sl.scoringModeExplainer)}`);
  lines.push(`  S dimension: ${stripBoldMarkers(sl.supplementalSNote)}`);
  lines.push('');

  lines.push('[Workflow — first run]');
  for (const s of rg.workflow.firstRun) {
    lines.push(`  ${s.order}. ${s.label}: ${stripBoldMarkers(s.detail)}`);
  }
  lines.push('');
  lines.push('[Workflow — CI / agent]');
  for (const s of rg.workflow.ciOrAgent) {
    lines.push(`  ${s.order}. ${s.label}: ${stripBoldMarkers(s.detail)}`);
  }
  lines.push('');
  lines.push('[Report formats]');
  for (const r of rg.workflow.reportFormats) {
    lines.push(`  ${r.context}: ${r.format} — ${stripBoldMarkers(r.reason)}`);
  }
  lines.push('');

  const seen = rg.signalHints.filter((x) => x.seenInThisRun);
  const unseen = rg.signalHints.length - seen.length;
  lines.push('[Signals in this run]');
  if (seen.length === 0) {
    lines.push('  No formula signal keys in merged output (dimensions may still calibrate).');
  } else {
    for (const s of seen) {
      lines.push(`  ${s.key} [${s.dimension}]: ${stripBoldMarkers(s.plainEnglish)}`);
      lines.push(`    Improve: ${stripBoldMarkers(s.improvesWith)}`);
    }
  }
  lines.push(`  (${unseen} other catalog keys not present in merged signals — see runGuidance.signalHints in JSON.)`);
  lines.push('');

  const op = rg.ops;
  lines.push('[Ops]');
  lines.push(`  schemaVersion: ${op.schemaVersion}`);
  lines.push(`  telemetryEnabled: ${op.telemetryEnabled}`);
  lines.push(`  ${stripBoldMarkers(op.optionalFeaturesNote)}`);
  lines.push(`  ${stripBoldMarkers(op.clientCompatibility)}`);
  lines.push('');

  lines.push(...renderProductDomainSummaryLines(rg.productDomain));
  return lines;
}

// ---------------------------------------------------------------------------
// HTML format
// ---------------------------------------------------------------------------

function renderHtml(result: CompositeResult, profile: NarrativeProfile): string {
  const {
    composite,
    dimensions,
    weightProfile,
    calibrating,
    orgName,
    timestamp,
    schemaVersion,
    assessmentMode,
    scoringMode,
    partialComposite,
    scoredCoreCount,
    epistemicNote,
  } = result;
  const safeOrg = escapeHtml(orgName);
  const wp = WEIGHT_PROFILES[weightProfile];

  const dimRows = (['Q', 'L', 'R', 'C'] as Dimension[])
    .map((dim) => {
      const ds = dimensions[dim];
      const info = DIMENSIONS[dim];
      const pct = Math.round(ds.score * 100);
      return `
      <tr>
        <td><strong>${dim}</strong> ${info.name}</td>
        <td>${fmt(ds.score)}${statusLabel(ds.status)}</td>
        <td>
          <div style="background:#e0e0e0;border-radius:4px;height:18px;width:200px">
            <div style="background:${scoreColor(ds.score)};height:18px;width:${pct}%;border-radius:4px"></div>
          </div>
        </td>
        <td>${escapeHtml(ds.connectorsSourcing.join(', ') || '-')}${ds.dataQuality ? ` <span style="color:#888">(${ds.dataQuality})</span>` : ''}</td>
        <td style="font-size:0.85em;color:#666">${escapeHtml(info.question)}</td>
      </tr>`;
    })
    .join('');

  const sDs = dimensions.S;
  const sRow = sDs.status === 'scored'
    ? `<tr>
        <td><strong>S</strong> Security (Supplemental)</td>
        <td>${fmt(sDs.score)}</td>
        <td><div style="background:#e0e0e0;border-radius:4px;height:18px;width:200px"><div style="background:${scoreColor(sDs.score)};height:18px;width:${Math.round(sDs.score * 100)}%;border-radius:4px"></div></div></td>
        <td>${escapeHtml(sDs.connectorsSourcing.join(', '))}</td>
        <td style="font-size:0.85em;color:#666">${escapeHtml(DIMENSIONS.S.question)}</td>
      </tr>`
    : `<tr>
        <td><strong>S</strong> Security (Supplemental)</td>
        <td colspan="4" style="color:#999">Not configured - ${DIMENSIONS.S.withoutIt}</td>
      </tr>`;

  const calSection = calibrating.length > 0
    ? `<div style="background:#fff3cd;padding:12px;border-radius:6px;margin:16px 0">
        <strong>Calibration in Progress</strong>
        <ul>${calibrating.map((d) => `<li>${d} (${DIMENSIONS[d].name}): ${DIMENSIONS[d].calibrating}</li>`).join('')}</ul>
      </div>`
    : '';

  const whatWeMeasured = (['Q', 'L', 'R', 'C', 'S'] as Dimension[])
    .map((dim) => {
      const info = DIMENSIONS[dim];
      const ds = dimensions[dim];
      if (ds.status === 'scored') {
        return `<li><strong>${dim} (${info.name}):</strong> ${info.explanation}</li>`;
      }
      if (ds.status === 'calibrating') {
        return `<li style="color:#b8860b"><strong>${dim} (${info.name}):</strong> Calibrating - ${info.calibrating}</li>`;
      }
      return `<li style="color:#999"><strong>${dim} (${info.name}):</strong> Not measured. ${info.withoutIt}</li>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>AIEI Report - ${safeOrg}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #333; }
    h1 { border-bottom: 2px solid #ff6c37; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f8f8; font-weight: 600; }
    .composite { font-size: 2em; font-weight: 700; color: ${scoreColor(composite)}; }
  </style>
</head>
<body>
  <h1>AIEI Report: ${safeOrg}</h1>
  <p>Generated: ${escapeHtml(timestamp)} | Schema: v${schemaVersion} | Profile: ${weightProfile} | Mode: ${assessmentMode} | Scoring: ${scoringMode} | Core scored: ${scoredCoreCount}/4</p>
  ${partialComposite ? `<p style="color:#b45309"><strong>Partial composite</strong> — not all QLRC dimensions scored.</p>` : ''}
  ${wp ? `<p style="color:#666"><em>${escapeHtml(wp.rationale)}</em></p>` : ''}
  ${epistemicNote ? `<p style="color:#555;font-size:0.9em"><strong>Limitations:</strong> ${escapeHtml(epistemicNote)}</p>` : ''}

  ${result.runGuidance ? renderRunGuidanceHtml(result.runGuidance) : result.productDomainGuidance ? renderProductDomainGuidanceHtml(result.productDomainGuidance) : ''}

  <div style="text-align:center;margin:24px 0">
    <div class="composite">${fmt(composite)}</div>
    <div>Composite Score (0-1)</div>
  </div>

  ${calSection}

  <h2>Dimension Scores</h2>
  <table>
    <tr><th>Dimension</th><th>Score</th><th>Visual</th><th>Sources</th><th>Measures</th></tr>
    ${dimRows}
    ${sRow}
  </table>

  <h2>What We Measured</h2>
  <ul>${whatWeMeasured}</ul>

  ${result.weakest && result.strongest ? `
  <h2>Gap Analysis</h2>
  <p>Strongest: <strong>${result.strongest.dimension}</strong> (${fmt(result.strongest.score)}) |
     Weakest: <strong>${result.weakest.dimension}</strong> (${fmt(result.weakest.score)}) |
     Gap: <strong>${fmt(result.gap)}</strong></p>
  ` : ''}

  <footer style="margin-top:40px;padding-top:16px;border-top:1px solid #eee;color:#999;font-size:0.85em">
    Powered by @postmanlabs/aiei-core v${schemaVersion}
  </footer>
</body>
</html>`;
}

function renderRunGuidanceHtml(rg: RunGuidance): string {
  const su = rg.setup;
  const hintsHtml =
    su.connectorHints.length > 0
      ? `<ul>${su.connectorHints
          .map(
            (h) =>
              `<li><strong>${escapeHtml(h.connector)}</strong>: ${escapeHtml(h.error || 'failed')}<br><span style="color:#374151">Next: ${escapeHtml(h.nextFix)}</span></li>`,
          )
          .join('')}</ul>`
      : '<p style="font-size:0.9em">No configured connectors failed this run.</p>';

  const wf1 = rg.workflow.firstRun
    .map((s) => `<li><strong>${s.order}. ${escapeHtml(s.label)}</strong> — ${escapeHtml(s.detail)}</li>`)
    .join('');
  const wf2 = rg.workflow.ciOrAgent
    .map((s) => `<li><strong>${s.order}. ${escapeHtml(s.label)}</strong> — ${escapeHtml(s.detail)}</li>`)
    .join('');
  const rf = rg.workflow.reportFormats
    .map((r) => `<li>${escapeHtml(r.context)}: <code>${r.format}</code> — ${escapeHtml(r.reason)}</li>`)
    .join('');

  const seen = rg.signalHints.filter((x) => x.seenInThisRun);
  const sigHtml =
    seen.length > 0
      ? `<ul style="font-size:0.9em">${seen
          .map(
            (s) =>
              `<li><code>${escapeHtml(s.key)}</code> [${s.dimension}] ${escapeHtml(s.plainEnglish)}<br><span style="color:#666">Improve: ${escapeHtml(s.improvesWith)}</span></li>`,
          )
          .join('')}</ul>`
      : '<p style="font-size:0.9em">No merged signal keys this run (dimensions may still be calibrating).</p>';

  const sl = rg.scoreLiteracy;
  const bullets = sl.bullets.map((b) => `<li>${escapeHtml(stripBoldMarkers(b))}</li>`).join('');

  return `
  <div style="margin:24px 0;padding:16px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd">
    <h2 style="margin-top:0">Run guidance</h2>

    <h3 style="font-size:1.1em">Setup</h3>
    <p style="font-size:0.95em">${escapeHtml(stripBoldMarkers(su.intro))}</p>
    ${hintsHtml}
    <p style="font-size:0.9em"><strong>Suggested connectors to close gaps:</strong> ${escapeHtml(su.minimalViableConnectors.join(', ') || '—')}</p>
    <p style="font-size:0.85em;color:#444">${escapeHtml(stripBoldMarkers(su.configFileHint))}</p>
    <p style="font-size:0.85em">validation.ready: <strong>${su.validationReady}</strong></p>

    <h3 style="font-size:1.1em">Score literacy</h3>
    <p style="font-size:0.95em"><strong>${escapeHtml(stripBoldMarkers(sl.headline))}</strong></p>
    <ul>${bullets}</ul>
    <p style="font-size:0.88em;color:#333">${escapeHtml(stripBoldMarkers(sl.compositeInterpretation))}</p>
    <p style="font-size:0.88em;color:#555">${escapeHtml(stripBoldMarkers(sl.comparability))}</p>
    <p style="font-size:0.88em;color:#555">${escapeHtml(stripBoldMarkers(sl.scoringModeExplainer))}</p>
    <p style="font-size:0.85em;color:#666">${escapeHtml(stripBoldMarkers(sl.supplementalSNote))}</p>

    <h3 style="font-size:1.1em">Workflow — first run</h3>
    <ol style="font-size:0.9em">${wf1}</ol>
    <h3 style="font-size:1.1em">Workflow — CI / agent</h3>
    <ol style="font-size:0.9em">${wf2}</ol>
    <h3 style="font-size:1.05em">Report formats</h3>
    <ul style="font-size:0.88em">${rf}</ul>

    <h3 style="font-size:1.1em">Signals seen this run</h3>
    ${sigHtml}

    <h3 style="font-size:1.1em">Ops</h3>
    <p style="font-size:0.88em">schemaVersion: <code>${escapeHtml(rg.ops.schemaVersion)}</code> · telemetry: ${rg.ops.telemetryEnabled}</p>
    <p style="font-size:0.85em;color:#555">${escapeHtml(stripBoldMarkers(rg.ops.optionalFeaturesNote))}</p>
    <p style="font-size:0.85em;color:#555">${escapeHtml(stripBoldMarkers(rg.ops.clientCompatibility))}</p>
  </div>
  ${renderProductDomainGuidanceHtml(rg.productDomain)}`;
}

function renderProductDomainGuidanceHtml(g: NonNullable<CompositeResult['productDomainGuidance']>): string {
  const topicsHtml = g.topics
    .map(
      (t) => `
    <section style="margin:12px 0;padding:12px;background:#f9fafb;border-radius:8px;border-left:4px solid #ff6c37">
      <h3 style="margin:0 0 8px 0;font-size:1.05em">${escapeHtml(t.title)}</h3>
      <p style="margin:6px 0;font-size:0.9em"><strong>In the score:</strong> ${escapeHtml(stripBoldMarkers(t.inProduct))}</p>
      <p style="margin:6px 0;font-size:0.9em;color:#666"><strong>Not covered:</strong> ${escapeHtml(stripBoldMarkers(t.notCovered))}</p>
      <p style="margin:6px 0;font-size:0.85em"><strong>Connectors helping:</strong> ${escapeHtml(t.connectorsThatHelp.join(', ') || '—')}</p>
      <p style="margin:6px 0;font-size:0.9em"><strong>Next step:</strong> ${escapeHtml(stripBoldMarkers(t.suggestedNextStep))}</p>
    </section>`,
    )
    .join('');

  const hint = g.readinessHint
    ? `<p style="margin-top:12px;font-size:0.9em;color:#374151">${escapeHtml(stripBoldMarkers(g.readinessHint))}</p>`
    : '';

  return `
  <div style="margin:24px 0;padding:16px;background:#fff7ed;border-radius:8px;border:1px solid #fed7aa">
    <h2 style="margin-top:0">When identity, streaming, or contract drift comes up</h2>
    <p style="font-size:0.95em">${escapeHtml(stripBoldMarkers(g.intro))}</p>
    <p style="font-size:0.9em;color:#555">${escapeHtml(stripBoldMarkers(g.whenThisApplies))}</p>
    ${topicsHtml}
    ${hint}
  </div>`;
}

function scoreColor(score: number): string {
  if (score >= 0.75) return '#22c55e';
  if (score >= 0.50) return '#eab308';
  if (score >= 0.25) return '#f97316';
  return '#ef4444';
}
