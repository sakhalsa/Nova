import { AssessmentMode, ConnectorName, ProductDomainGuidance, ProductDomainTopicId } from './types.js';

const ALL_CONNECTORS_HELP =
  'Connect the tools your teams already use for APIs, delivery, observability, and security. The index only reflects what those tools can observe.';

function has(c: Set<ConnectorName>, name: ConnectorName): boolean {
  return c.has(name);
}

const RECOMMENDED_WHEN_NONE: Record<ProductDomainTopicId, ConnectorName[]> = {
  identity: ['github', 'gitlab', 'postman', 'crunch42'],
  streaming: ['cloudflare', 'datadog', 'grafana', 'pagerduty'],
  contract_drift: ['postman', 'github', 'crunch42'],
};

/**
 * In-product support when stakeholders ask about identity, streaming (media/CDN),
 * or contract drift vs what AIEI scores. Attached to every assessment result for UIs and reports.
 */
export function buildProductDomainGuidance(
  connected: ConnectorName[],
  ctx: { assessmentMode: AssessmentMode; scoredCoreCount: number },
): ProductDomainGuidance {
  const c = new Set(connected);
  const readiness = ctx.assessmentMode === 'readiness' || ctx.scoredCoreCount < 3;

  const topics: ProductDomainGuidance['topics'] = [
    {
      id: 'identity',
      title: 'Identity, login, and entitlements',
      inProduct:
        'AIEI can surface dependency and code-scan signals (GitHub/GitLab) and API spec posture (42Crunch) under **S**. For **Q/R**, identity-related **HTTP APIs** appear in the score only if you encode them in **Postman** tests and monitors (expected status codes, contracts, monitor pass rates).',
      notCovered:
        'IdP/OAuth provider health, end-user session experience, or org-wide identity policy are **not** measured by this index.',
      connectorsThatHelp: [
        'github',
        'gitlab',
        'crunch42',
        'postman',
      ].filter((n) => has(c, n as ConnectorName)) as ConnectorName[],
      suggestedNextStep: has(c, 'postman')
        ? 'Add or extend Postman collections and monitors for auth and entitlement APIs. Assertions on 401/403/200 and schema checks are what move **contract** and **monitor** signals.'
        : 'Connect **Postman** and add tests for critical auth and entitlement APIs. Without Postman (or equivalent contract tests in scope), identity-related API behavior will not appear in **R**.',
    },
    {
      id: 'streaming',
      title: 'Streaming, CDN, and playback',
      inProduct:
        'AIEI reflects **HTTP/API-layer** reliability: **Cloudflare** (edge errors), **Datadog/Grafana/New Relic** if your services are instrumented, **PagerDuty/ServiceNow** for incident MTTR. Those feed **R** (uptime, CFR, SLO-style signals where supported).',
      notCovered:
        'Video quality (QoE), HLS/DASH manifests, DRM, bitrate ladders, or client-side playback are **not** in the index.',
      connectorsThatHelp: [
        'cloudflare',
        'datadog',
        'grafana',
        'newrelic',
        'pagerduty',
        'servicenow',
      ].filter((n) => has(c, n as ConnectorName)) as ConnectorName[],
      suggestedNextStep: has(c, 'cloudflare') || has(c, 'datadog') || has(c, 'grafana')
        ? 'Ensure playback and API routes that matter are traced in your observability stack. Narrow Postman monitors to production-relevant routes if you use them for synthetic checks.'
        : 'Connect at least one **edge or APM** source (e.g. Cloudflare, Datadog, Grafana) so **R** reflects production HTTP behavior for your streaming stack.',
    },
    {
      id: 'contract_drift',
      title: 'Contract drift (APIs, schemas, events)',
      inProduct:
        '**Postman** drives **contract_catch_rate** and **monitor** pass rates; **Crunch42** strengthens **spec** discipline for **S**. **GitHub/GitLab** show **rework** after bad changes. Together they support **R** and **Q** for **documented, tested** APIs.',
      notCovered:
        'Async pipelines (e.g. Kafka/SNS) only appear if you **test or spec** them in tools that connect here. Schema registry vs runtime drift without tests is **not** auto-detected.',
      connectorsThatHelp: [
        'postman',
        'crunch42',
        'github',
        'gitlab',
      ].filter((n) => has(c, n as ConnectorName)) as ConnectorName[],
      suggestedNextStep: has(c, 'postman')
        ? 'Add contract tests and monitors to the **release-critical** collections and APIs. Expand coverage to event-driven entry points where you expose HTTP or use documented specs the connector can read.'
        : 'Connect **Postman** and wire monitors plus test scripts for APIs where drift causes incidents. Without Postman in scope, **contract_catch_rate** and **slo_attainment** from Postman will not populate.',
    },
  ];

  for (const t of topics) {
    if (t.connectorsThatHelp.length === 0) {
      t.connectorsThatHelp = [...RECOMMENDED_WHEN_NONE[t.id]];
    }
  }

  return {
    intro:
      'If leadership asks whether this score covers **identity**, **streaming**, or **contract drift** end-to-end: it does not replace domain-specific systems. It scores **evidence from connected tools** about API delivery, engineering discipline, and AI-related outcomes.',
    whenThisApplies:
      'Use this block when the assessment feels "incomplete" for those domains, or when **readiness** mode is on because few dimensions scored.',
    topics,
    readinessHint: readiness
      ? `Focus on **0→1**: connect **Postman** + **GitHub or GitLab** + **one observability or edge** connector. Goal: move **scoredCoreCount** toward 4 and exit readiness-only interpretation. ${ALL_CONNECTORS_HELP}`
      : `To deepen the story: add **SonarQube** (Q), **cost** (Portkey/OpenAI/manual), **Crunch42** + GitHub Advanced Security (S), and tighten Postman scope to production APIs. ${ALL_CONNECTORS_HELP}`,
  };
}
