export const V12 = {
  white: '#FFFFFF',
  black: '#000000',
  purple: '#7644FD',
  orange: '#FF6C37',
  pink: '#F37FFE',

  bg: '#0F0F0F',
  bgCard: '#1A1A1A',
  bgCardHover: '#222222',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  border: '#2A2A2A',

  scoreGood: '#22C55E',
  scoreWarn: '#EAB308',
  scoreBad: '#EF4444',
  scoreNeutral: '#7644FD',

  font: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
  fontMono: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
} as const;

export function scoreColor(score: number): string {
  if (score >= 0.75) return V12.scoreGood;
  if (score >= 0.50) return V12.scoreWarn;
  if (score >= 0.25) return V12.orange;
  return V12.scoreBad;
}

export function stageColor(stage: string): string {
  switch (stage) {
    case 'Leader': return V12.scoreGood;
    case 'Scale': return V12.purple;
    case 'Growth': return V12.orange;
    default: return V12.scoreBad;
  }
}
