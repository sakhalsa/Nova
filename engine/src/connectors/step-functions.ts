import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

function sfnEndpoint(region: string): string {
  return `https://states.${region}.amazonaws.com`;
}

function awsHeaders(accessKeyId: string): Record<string, string> {
  return {
    'Content-Type': 'application/x-amz-json-1.0',
    'X-Amz-Security-Token': accessKeyId,
  };
}

async function sfnCall(
  region: string, accessKeyId: string, secretAccessKey: string,
  target: string, body: Record<string, unknown>,
): Promise<unknown> {
  const res = await timedFetch(sfnEndpoint(region), {
    method: 'POST',
    headers: {
      ...awsHeaders(accessKeyId),
      'X-Amz-Target': `AWSStepFunctions.${target}`,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`SFN ${target}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const stepFunctionsConnector: Connector = {
  name: 'step_functions',
  dimensions: ['R'],
  requiredCredentials: ['region', 'accessKeyId', 'secretAccessKey'],

  async validate(config) {
    try {
      await sfnCall(
        config.region as string, config.accessKeyId as string,
        config.secretAccessKey as string, 'ListStateMachines', { maxResults: 1 },
      );
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const region = config.region as string;
    const keyId = config.accessKeyId as string;
    const secret = config.secretAccessKey as string;
    const arns = (config.stateMachineArns as string[]) || [];
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    try {
      let machineArns = arns;
      if (machineArns.length === 0) {
        const list = (await sfnCall(region, keyId, secret, 'ListStateMachines', { maxResults: 20 })) as Record<string, unknown>;
        const machines = (list.stateMachines as Array<Record<string, unknown>>) || [];
        machineArns = machines.map(m => m.stateMachineArn as string);
      }

      diagnostics.push({ key: 'state_machines', value: machineArns.length, label: 'State machines sampled' });

      let totalExecutions = 0;
      let succeeded = 0;
      let failed = 0;
      let timedOut = 0;

      for (const arn of machineArns.slice(0, 20)) {
        try {
          const execs = (await sfnCall(region, keyId, secret, 'ListExecutions', {
            stateMachineArn: arn, maxResults: 100, statusFilter: 'SUCCEEDED',
          })) as Record<string, unknown>;
          const succList = (execs.executions as Array<unknown>) || [];
          succeeded += succList.length;

          const failExecs = (await sfnCall(region, keyId, secret, 'ListExecutions', {
            stateMachineArn: arn, maxResults: 100, statusFilter: 'FAILED',
          })) as Record<string, unknown>;
          const failList = (failExecs.executions as Array<unknown>) || [];
          failed += failList.length;

          const toExecs = (await sfnCall(region, keyId, secret, 'ListExecutions', {
            stateMachineArn: arn, maxResults: 100, statusFilter: 'TIMED_OUT',
          })) as Record<string, unknown>;
          const toList = (toExecs.executions as Array<unknown>) || [];
          timedOut += toList.length;

          totalExecutions += succList.length + failList.length + toList.length;
        } catch {
          // individual machine may fail
        }
      }

      if (totalExecutions > 0) {
        const successRate = succeeded / totalExecutions;
        signals.adaptability = successRate;
        diagnostics.push({ key: 'execution_success_rate', value: successRate, label: 'Execution success rate' });
        diagnostics.push({ key: 'total_executions', value: totalExecutions, label: 'Total executions sampled' });
        diagnostics.push({ key: 'failed_executions', value: failed, label: 'Failed executions' });
        diagnostics.push({ key: 'timed_out_executions', value: timedOut, label: 'Timed-out executions' });
      }

      return {
        signals,
        diagnostics,
        connected: totalExecutions > 0,
        confidence: {
          sampleSize: totalExecutions,
          timeWindowDays: 30,
          truncated: machineArns.length > 20,
          completeness: totalExecutions > 50 ? 'full' : totalExecutions > 10 ? 'partial' : 'minimal',
        },
      };
    } catch (e: unknown) {
      return {
        signals: {},
        diagnostics: [{ key: 'error', value: (e as Error).message, label: 'Step Functions API error' }],
        connected: false,
      };
    }
  },
};
