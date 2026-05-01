import { runAssessment, buildPresentation, toIndex, toStage } from '@sachsk23/aiei-engine';
import type { EnvironmentConfig, CompositeResult } from '@sachsk23/aiei-engine';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

async function run(): Promise<void> {
  const configPath = process.env.AIEI_CONFIG_PATH || resolve('.aiei.json');
  const githubToken = process.env.GITHUB_TOKEN;
  const prNumber = process.env.GITHUB_PR_NUMBER || process.env.PR_NUMBER;
  const repo = process.env.GITHUB_REPOSITORY;

  if (!existsSync(configPath)) {
    process.stderr.write(`Config not found at ${configPath}\n`);
    process.exit(1);
  }

  const config = JSON.parse(readFileSync(configPath, 'utf-8')) as EnvironmentConfig;
  config.weightProfile = config.weightProfile || 'reliability_first';

  if (process.env.AIEI_HOURLY_RATE) {
    config.hourlyRate = Number(process.env.AIEI_HOURLY_RATE);
  }

  process.stderr.write(`Running AIEI scoring for ${config.orgName}...\n`);
  const { result } = await runAssessment(config);

  const signals = extractSignalValues(result);
  const presentation = buildPresentation(result, signals);
  const idx = presentation.overall.index;
  const stage = presentation.overall.stage;

  const comment = buildPrComment(result, presentation);

  process.stdout.write(comment);

  if (githubToken && prNumber && repo) {
    const [owner, repoName] = repo.split('/');
    const url = `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({ body: comment }),
    });

    if (response.ok) {
      process.stderr.write(`AIEI comment posted to PR #${prNumber}\n`);
    } else {
      process.stderr.write(`Failed to post comment: ${response.status} ${response.statusText}\n`);
    }
  }

  const output = [
    `aiei_score=${idx}`,
    `aiei_stage=${stage}`,
    `aiei_q=${toIndex(result.dimensions.Q.score)}`,
    `aiei_r=${toIndex(result.dimensions.R.score)}`,
    `aiei_l=${toIndex(result.dimensions.L.score)}`,
    `aiei_c=${toIndex(result.dimensions.C.score)}`,
  ];

  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    const { appendFileSync } = await import('node:fs');
    for (const line of output) {
      appendFileSync(outputFile, line + '\n');
    }
  }
}

function extractSignalValues(result: CompositeResult): Map<string, number> {
  const signals = new Map<string, number>();
  for (const ds of Object.values(result.dimensions)) {
    for (const s of ds.signals) {
      signals.set(s.key, s.value);
    }
  }
  return signals;
}

function buildPrComment(result: CompositeResult, presentation: ReturnType<typeof buildPresentation>): string {
  const { overall, dimensions } = presentation;
  const dimNames: Record<string, string> = { Q: 'Quality', R: 'Reliability', L: 'Lead Time', C: 'Cost' };

  const dimRows = ['Q', 'R', 'L', 'C'].map(d => {
    const n = dimensions[d as keyof typeof dimensions];
    return `| ${dimNames[d]} (${d}) | ${n.index} | ${n.stage} |`;
  }).join('\n');

  const topRec = presentation.recommendations[0];

  return `## AIEI Score: ${overall.index} [${overall.stage}]

${overall.narrative}

| Dimension | Index | Stage |
|-----------|-------|-------|
${dimRows}

**Hours recovered:** ${overall.hours_total}/month
${result.epistemicNote ? `\n*${result.epistemicNote}*` : ''}
${topRec ? `\n**Top action:** ${topRec.title} (${topRec.impact})` : ''}

---
*Powered by [@postmanlabs/aiei-engine](https://github.com/postmanlabs/AIEI-Framework) v${result.schemaVersion}*`;
}

run().catch(e => {
  process.stderr.write(`AIEI Action error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
