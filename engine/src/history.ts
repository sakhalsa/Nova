import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import {
  CompositeResult,
  EnvironmentConfig,
  ScoreRecord,
  SCHEMA_VERSION,
  ALL_DIMENSIONS,
  ValidationResult,
} from './types.js';

const HISTORY_FILE = 'aiei-history.json';

function buildRecord(
  result: CompositeResult,
  config: EnvironmentConfig,
  validation?: ValidationResult,
): ScoreRecord {
  const scores: Record<string, number> = {};
  for (const dim of ALL_DIMENSIONS) {
    scores[dim] = result.dimensions[dim].score;
  }

  const signalMap: Record<string, { value: number; source: string }> = {};
  for (const dim of ALL_DIMENSIONS) {
    for (const sig of result.dimensions[dim].signals) {
      signalMap[sig.key] = { value: sig.value, source: sig.source };
    }
  }

  const connected: string[] = [];
  const failed: string[] = [];
  const fallback: string[] = [];

  if (validation) {
    for (const c of validation.connectors) {
      if (c.configured && c.connected && !connected.includes(c.name)) connected.push(c.name);
      if (c.configured && !c.connected && !failed.includes(c.name)) failed.push(c.name);
    }
  } else {
    for (const dim of ALL_DIMENSIONS) {
      for (const c of result.dimensions[dim].connectorsSourcing) {
        if (!connected.includes(c)) connected.push(c);
      }
    }
  }

  return {
    id: `${config.orgName.toLowerCase().replace(/\s+/g, '-')}-${result.timestamp}`,
    schemaVersion: SCHEMA_VERSION,
    timestamp: result.timestamp,
    orgName: config.orgName,
    weightProfile: result.weightProfile,
    composite: result.composite,
    scores: scores as Record<string, number>,
    s: {
      configured: result.dimensions.S.status === 'scored',
      score: result.dimensions.S.status === 'scored' ? result.dimensions.S.score : null,
    },
    calibrating: result.calibrating,
    connectors: { connected, failed, fallback },
    signals: signalMap,
  };
}

export async function appendLocal(
  result: CompositeResult,
  config: EnvironmentConfig,
  validation?: ValidationResult,
): Promise<void> {
  const configDir = config.configPath ? dirname(resolve(config.configPath)) : process.cwd();
  const historyPath = resolve(configDir, HISTORY_FILE);

  let history: ScoreRecord[] = [];
  if (existsSync(historyPath)) {
    try {
      history = JSON.parse(readFileSync(historyPath, 'utf-8'));
    } catch {
      history = [];
    }
  }

  history.push(buildRecord(result, config, validation));
  writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
}

export async function uploadToTurbopuffer(
  result: CompositeResult,
  config: EnvironmentConfig,
  validation?: ValidationResult,
): Promise<void> {
  const apiKey = process.env.TURBOPUFFER_API_KEY?.trim();
  if (!apiKey) return;

  let Turbopuffer: unknown;
  try {
    const mod = await (Function('return import("@turbopuffer/turbopuffer")')() as Promise<{ default?: unknown }>);
    Turbopuffer = mod.default || mod;
  } catch {
    return;
  }

  const client = new (Turbopuffer as { new (opts: Record<string, string>): {
    namespace(name: string): {
      write(opts: Record<string, unknown>): Promise<unknown>;
    };
  } })({
    apiKey,
  });

  const record = buildRecord(result, config, validation);
  const ns = client.namespace('aiei-scores');

  await ns.write({
    upsert_rows: [
      {
        id: record.id,
        vector: [
          record.scores.Q || 0,
          record.scores.L || 0,
          record.scores.R || 0,
          record.scores.C || 0,
          record.s.score || 0,
        ],
        orgName: record.orgName,
        schemaVersion: record.schemaVersion,
        composite: record.composite,
        Q: record.scores.Q || 0,
        L: record.scores.L || 0,
        R: record.scores.R || 0,
        C: record.scores.C || 0,
        S: record.s.score || 0,
        sConfigured: record.s.configured,
        calibrating: record.calibrating.join(','),
        weightProfile: record.weightProfile,
        connectorCount: record.connectors.connected.length,
        timestamp: record.timestamp,
        assessorName: config.assessorName || '',
      },
    ],
    distance_metric: 'cosine_distance',
  });
}

export function getLocalHistory(configPath?: string): ScoreRecord[] {
  const configDir = configPath ? dirname(resolve(configPath)) : process.cwd();
  const historyPath = resolve(configDir, HISTORY_FILE);

  if (!existsSync(historyPath)) return [];

  try {
    return JSON.parse(readFileSync(historyPath, 'utf-8'));
  } catch {
    return [];
  }
}
