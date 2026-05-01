#!/usr/bin/env node
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { runAssessment } from './runner.js';
import { validateConfig } from './setup.js';
import { renderReport } from './reporter.js';
import { getLocalHistory } from './history.js';
import { DIMENSIONS, INDUSTRY_DEFAULTS } from './dimensions.js';
import { EnvironmentConfig, ReportFormat, WEIGHT_PROFILES, CompositeResult, SCHEMA_VERSION } from './types.js';
import { simulateAssessment, SimulationRequest } from './simulate.js';
import { diffByRefs } from './diff.js';
import { getAllContracts, getConnectorContract, registerRuntimeConnector, ConnectorContract } from './connector-contract.js';
import { getCurrentFormula, getFormulaHistory, migrateResult, MigrationRequest } from './formula-version.js';

const PACKAGE_VERSION = '1.3.0';
import { ALL_CONNECTORS } from './connectors/registry.js';

const PORT = parseInt(process.env.AIEI_PORT || '3210', 10);

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function text(res: ServerResponse, body: string, contentType = 'text/plain'): void {
  res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method?.toUpperCase() || 'GET';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    if (method === 'POST' && path === '/v1/assess') {
      const body = JSON.parse(await readBody(req)) as EnvironmentConfig;
      if (!body.orgName || !body.connectors) {
        return json(res, { error: 'orgName and connectors are required' }, 400);
      }
      body.weightProfile = body.weightProfile || 'reliability_first';
      const result = await runAssessment(body);
      return json(res, result);
    }

    if (method === 'POST' && path === '/v1/validate') {
      const body = JSON.parse(await readBody(req)) as EnvironmentConfig;
      if (!body.orgName || !body.connectors) {
        return json(res, { error: 'orgName and connectors are required' }, 400);
      }
      body.weightProfile = body.weightProfile || 'reliability_first';
      const result = await validateConfig(body);
      return json(res, result);
    }

    if (method === 'POST' && path === '/v1/report') {
      const body = JSON.parse(await readBody(req)) as {
        result: CompositeResult;
        format?: ReportFormat;
        narrativeProfile?: { name: string; quotes: Record<string, string> };
      };
      if (!body.result) {
        return json(res, { error: 'result is required' }, 400);
      }
      const format = body.format || 'summary';
      const report = renderReport(body.result, format, body.narrativeProfile);
      if (format === 'html') return text(res, report, 'text/html');
      if (format === 'json') return json(res, JSON.parse(report));
      return text(res, report);
    }

    if (method === 'GET' && path === '/v1/dimensions') {
      return json(res, DIMENSIONS);
    }

    if (method === 'GET' && path.startsWith('/v1/dimensions/')) {
      const dim = path.split('/')[3] as keyof typeof DIMENSIONS;
      if (!DIMENSIONS[dim]) return json(res, { error: `Unknown dimension: ${dim}` }, 404);
      return json(res, DIMENSIONS[dim]);
    }

    if (method === 'GET' && path === '/v1/weights') {
      return json(res, WEIGHT_PROFILES);
    }

    if (method === 'GET' && path.startsWith('/v1/weights/')) {
      const profile = path.split('/')[3] as keyof typeof WEIGHT_PROFILES;
      if (!WEIGHT_PROFILES[profile]) return json(res, { error: `Unknown profile: ${profile}` }, 404);
      return json(res, WEIGHT_PROFILES[profile]);
    }

    if (method === 'GET' && path === '/v1/connectors') {
      const connectors = ALL_CONNECTORS.map((c) => ({
        name: c.name,
        dimensions: c.dimensions,
        requiredCredentials: c.requiredCredentials,
      }));
      return json(res, connectors);
    }

    if (method === 'GET' && path === '/v1/history') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const orgName = url.searchParams.get('orgName') || undefined;
      let records = await getLocalHistory();
      if (orgName) records = records.filter((r) => r.orgName === orgName);
      return json(res, records.slice(-limit));
    }

    if (method === 'GET' && path === '/v1/defaults') {
      return json(res, INDUSTRY_DEFAULTS);
    }

    // --- Simulation ---
    if (method === 'POST' && path === '/v1/simulate') {
      const body = JSON.parse(await readBody(req)) as SimulationRequest;
      if (!body.baseResult) {
        return json(res, { error: 'baseResult is required' }, 400);
      }
      if (!body.hypothetical || Object.keys(body.hypothetical).length === 0) {
        return json(res, { error: 'hypothetical signal overrides required' }, 400);
      }
      const result = simulateAssessment(body);
      return json(res, result);
    }

    // --- Diff ---
    if (method === 'POST' && path === '/v1/diff') {
      const body = JSON.parse(await readBody(req)) as { runA: string; runB: string; configPath?: string };
      if (!body.runA || !body.runB) {
        return json(res, { error: 'runA and runB are required (use "latest", "previous", index, or record ID)' }, 400);
      }
      try {
        const result = await diffByRefs(body.runA, body.runB, body.configPath);
        return json(res, result);
      } catch (e: unknown) {
        return json(res, { error: (e as Error).message }, 400);
      }
    }

    // --- Connector Contracts ---
    if (method === 'GET' && path === '/v1/connectors/contracts') {
      return json(res, getAllContracts());
    }

    if (method === 'GET' && path.startsWith('/v1/connectors/') && path.endsWith('/contract')) {
      const parts = path.split('/');
      const name = parts[3];
      const contract = getConnectorContract(name);
      if (!contract) return json(res, { error: `Connector "${name}" not found` }, 404);
      return json(res, contract);
    }

    if (method === 'POST' && path === '/v1/connectors/register') {
      const body = JSON.parse(await readBody(req)) as { contract: ConnectorContract };
      if (!body.contract) {
        return json(res, { error: 'contract is required' }, 400);
      }
      try {
        const result = registerRuntimeConnector(
          body.contract,
          async () => ({ signals: {}, diagnostics: [], connected: false }),
        );
        return json(res, result);
      } catch (e: unknown) {
        return json(res, { error: (e as Error).message }, 400);
      }
    }

    // --- Formula Versioning ---
    if (method === 'GET' && path === '/v1/formula') {
      return json(res, getCurrentFormula());
    }

    if (method === 'GET' && path === '/v1/formula/history') {
      return json(res, getFormulaHistory());
    }

    if (method === 'POST' && path === '/v1/migrate') {
      const body = JSON.parse(await readBody(req)) as MigrationRequest;
      if (!body.result) {
        return json(res, { error: 'result (CompositeResult) is required' }, 400);
      }
      try {
        const migrated = migrateResult(body);
        return json(res, migrated);
      } catch (e: unknown) {
        return json(res, { error: (e as Error).message }, 400);
      }
    }

    if (method === 'GET' && path === '/') {
      return json(res, {
        name: '@postmanlabs/aiei-core',
        version: PACKAGE_VERSION,
        schemaVersion: SCHEMA_VERSION,
        endpoints: [
          'POST /v1/assess',
          'POST /v1/validate',
          'POST /v1/report',
          'POST /v1/simulate',
          'POST /v1/diff',
          'POST /v1/migrate',
          'POST /v1/connectors/register',
          'GET  /v1/dimensions',
          'GET  /v1/dimensions/{dim}',
          'GET  /v1/weights',
          'GET  /v1/weights/{profile}',
          'GET  /v1/connectors',
          'GET  /v1/connectors/contracts',
          'GET  /v1/connectors/{name}/contract',
          'GET  /v1/history',
          'GET  /v1/defaults',
          'GET  /v1/formula',
          'GET  /v1/formula/history',
        ],
      });
    }

    json(res, { error: 'Not found' }, 404);
  } catch (e: unknown) {
    const message = e instanceof SyntaxError ? 'Invalid JSON body' : (e as Error).message;
    json(res, { error: message }, 500);
  }
}

const server = createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`AIEI server listening on http://localhost:${PORT}`);
  console.log(`OpenAPI spec: openapi.yaml`);
  console.log(`Try: curl http://localhost:${PORT}/v1/connectors`);
});
