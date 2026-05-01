import { Dimension } from './types.js';

export interface DimensionInfo {
  key: Dimension;
  name: string;
  core: boolean;
  question: string;
  explanation: string;
  withoutIt: string;
  calibrating: string;
  methodology: string;
}

export const DIMENSIONS: Record<Dimension, DimensionInfo> = {
  R: {
    key: 'R',
    name: 'Reliability',
    core: true,
    question: 'Is AI-assisted code maintaining production stability?',
    explanation:
      'Measures whether AI-touched services maintain uptime, SLO attainment, and contract integrity in production. Tracks change failure rate, service level compliance, and infrastructure adaptability across your observability stack.',
    withoutIt:
      'You cannot answer: "Is faster delivery breaking things?" Teams shipping faster with AI may be accumulating production risk invisibly.',
    calibrating:
      'Collecting baseline reliability metrics from your observability connectors. Next run will produce a score against these baselines.',
    methodology:
      'Multiplicative product of five factors: (1-CFR) x SLO attainment x contract catch rate x uptime x adaptability. A zero in any factor drives the entire score to zero - reliability has no safe dimension to ignore.',
  },
  Q: {
    key: 'Q',
    name: 'Quality',
    core: true,
    question: 'Is AI making our code better or just faster?',
    explanation:
      'Measures whether AI-assisted development introduces fewer defects, maintains test coverage, and reduces rework. Compares AI-generated code defect rates against your non-AI baseline to quantify the quality delta.',
    withoutIt:
      'You cannot answer: "Is AI-generated code introducing more bugs than it solves?" Speed without quality measurement creates invisible technical debt.',
    calibrating:
      'Baseline captured: your current defect rate and test pass rate are stored. The next run will compare AI-assisted metrics against this baseline to produce a quality score.',
    methodology:
      'Product of defect improvement ratio, test pass rate delta, and inverse rework rate. Requires a non-AI baseline - first run establishes the baseline, second run produces a score.',
  },
  L: {
    key: 'L',
    name: 'Lead Time',
    core: true,
    question: 'Is AI actually accelerating delivery?',
    explanation:
      'Measures whether AI reduces cycle time from code to production. Compares PR merge speed, deployment frequency, and pipeline throughput between AI-assisted and traditional workflows.',
    withoutIt:
      'You cannot answer: "Are developers actually shipping faster, or just writing more code?" AI adoption without lead time measurement cannot prove velocity gains to leadership.',
    calibrating:
      'Baseline captured: your current cycle time from commit to merge is stored. The next run will compare AI-assisted cycle times against this baseline.',
    methodology:
      'Ratio of AI-assisted cycle time to non-AI baseline cycle time, subtracted from 1. A score of 0.40 means AI-assisted PRs merge 40% faster than the baseline.',
  },
  C: {
    key: 'C',
    name: 'Cost Efficiency',
    core: true,
    question: 'Are we getting our money\'s worth from AI?',
    explanation:
      'Measures whether the ROI on AI tooling justifies the spend. Compares labor hours saved and overhead reduction against token costs, infrastructure, and tooling investment.',
    withoutIt:
      'You cannot answer: "Is our AI investment generating measurable returns?" Without cost efficiency tracking, AI budgets are approved on faith rather than evidence.',
    calibrating:
      'Provide monthlyAiCost (total AI spend) or connect a cost provider (Portkey, OpenAI) to enable cost efficiency scoring. Labor savings are estimated from your source control data.',
    methodology:
      'ROI ratio: (labor value saved - overhead) / total AI cost, normalized against a target ROI. A score of 1.0 means you have met or exceeded your target return on AI investment.',
  },
  S: {
    key: 'S',
    name: 'Security Posture',
    core: false,
    question: 'Is our security posture keeping pace with the speed AI enables?',
    explanation:
      'Measures API spec security, dependency vulnerabilities, and code scanning alerts. Provides critical context on whether rapid AI-assisted development is outpacing security review capacity.',
    withoutIt:
      'You cannot answer: "Is AI-accelerated shipping creating security blind spots?" Faster delivery without security measurement is a compliance risk that compounds silently.',
    calibrating:
      'Security analysis requires 42Crunch (API spec audits) or GitHub Advanced Security (dependency and code scanning). Connect a security provider to activate.',
    methodology:
      'Supplemental dimension scored independently from QLRC composite. Combines API specification audit scores with dependency vulnerability and code scanning signals. Does not affect your composite score but surfaces security risks that speed may obscure.',
  },
};

export const INDUSTRY_DEFAULTS = {
  baselineDefectRate: 3.2,
  baselineCycleTimeHours: 24,
  targetRoi: 2.0,
  source: 'DORA State of DevOps 2024, industry median values',
};

/** Locked portfolio priors for Q/L from Postman-developed State of the API/AIEI source material. */
export const STATE_OF_API_BASELINES = {
  baselineDefectRate: 0.12,
  baselineCycleTimeHours: 24,
  edition: 'Postman State of the API 2025 / AIEI thesis',
  reportYear: 2025,
  sourceNote:
    'Locked portfolio priors from Postman-developed State of the API and AIEI thesis materials. Q portfolio baseline uses 0.12 defect rate; L portfolio baseline uses 24h cycle time.',
  locked: true,
} as const;
