export const BENCHMARKS = {
  quality: {
    industry_avg: 62,
    top_quartile: 82,
    source: 'Postman State of the API 2020-2025',
    total_respondents: 100_000,
    insights: {
      api_priority_years: 6,
      design_for_agents_pct: 24,
      collection_quality_impact: 'Collection quality below 80 means AI code generation works from incomplete specs - higher rework, lower test pass rates.',
    },
    improvement: {
      spectral_rules: '+8-12 points with Postman API Governance enabled',
      response_examples: '+3-5 points per 10% coverage increase',
      error_responses: '+2-4 points with 4xx/5xx coverage',
    },
  },
  reliability: {
    industry_avg: 58,
    dora_elite: 92,
    dora_high: 75,
    dora_medium: 58,
    dora_low: 35,
    source: 'DORA Accelerate 2025 + Postman State of the API 2025',
    insights: {
      no_monitoring_pct: 17,
      api_first_recovery: 'under 1 hour',
      error_spec_gap: 'AI-generated endpoints missing error response specifications cause 12% of SLO misses.',
    },
    improvement: {
      slo_attainment: '+4-6 points by closing SLO gap',
      contract_testing: '+3-5 points with Postman contract tests pre-deploy',
      error_examples: '+2-3 points adding 4xx/5xx to collections',
    },
  },
  lead_time: {
    industry_avg: 35,
    dora_elite: 85,
    dora_high: 65,
    source: 'DORA Accelerate 2025 + Postman State of the API 2024-2025',
    insights: {
      collaboration_blockers_pct: 93,
      queue_time_ratio: 'Typically 60-70% of cycle time is queue, not code.',
      ai_speedup_avg: '35-50% reduction in code time, but pipeline unchanged.',
    },
    improvement: {
      parallel_ci: '+10-15 points by parallelizing CI test stages',
      contract_gate: '+5-8 points using contract tests as fast-pass',
      queue_reduction: '+3-5 points per 2 hours of queue time cut',
    },
  },
  cost: {
    industry_avg: 45,
    forrester_baseline: 78,
    source: 'Forrester TEI + Postman State of the API 2023-2025',
    insights: {
      ai_api_calls_postman: 7_530_000,
      ai_api_calls_yoy_growth: 40,
      quality_reduces_cost: 'Better API specs reduce AI compute: fewer retries, shorter prompts, accurate code on first pass.',
    },
    improvement: {
      spec_quality: '+5-8 points by improving collection quality (reduces token waste)',
      model_right_sizing: '+3-5 points by routing simple tasks to cheaper models',
      caching: '+2-4 points with response caching for repeated API patterns',
    },
  },
  meta: {
    total_respondents: 100_000,
    surveys_analyzed: 6,
    latest_survey: '2025',
    dora_sample: 39_000,
    last_updated: '2026-04-28',
  },
} as const;

export type BenchmarkDimension = 'quality' | 'reliability' | 'lead_time' | 'cost';
