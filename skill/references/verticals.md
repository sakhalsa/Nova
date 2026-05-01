# Vertical-Specific Framing

## Financial Services

**Weight profile:** `quality_first` (wQ=0.35, wL=0.20, wR=0.35, wC=0.10)

Regulatory failures have outsized consequences. A defect in a payments API is not the same as a defect in an internal tool. Quality and reliability carry disproportionate weight because compliance violations, audit failures, and production outages have regulatory, reputational, and financial penalties.

**Framing for FSI:**
- R-Score maps to SLO compliance and production stability
- Q-Score maps to defect rates in regulated code paths
- L-Score demonstrates operational efficiency to regulators
- C-Score justifies AI investment to the board

**Assessment entry point:** "Can your agents do root cause analysis on your APIs in 3 minutes? Or does your team still spend 30 minutes per incident?"

## Platform Engineering / SRE

**Weight profile:** `reliability_first` (wQ=0.20, wL=0.20, wR=0.45, wC=0.15)

Platform teams are the internal service providers. Their customers are other engineering teams. Reliability is the primary contract. If the platform is unreliable, every team building on it is affected.

**Framing for Platform Eng:**
- R-Score is the primary KPI (SLO attainment, uptime, contract catch rate)
- L-Score tracks whether AI is accelerating platform delivery
- Q-Score validates that AI-generated platform code meets quality bar
- C-Score justifies the platform investment

## Growth / Startups

**Weight profile:** `speed_first` (wQ=0.20, wL=0.40, wR=0.25, wC=0.15)

Speed to market is the competitive advantage. AI should be compressing cycle times. If it isn't, the investment is wrong.

**Framing for Growth:**
- L-Score is the primary KPI (cycle time compression)
- R-Score ensures speed isn't buying fragility
- Q-Score guards against velocity-quality divergence
- C-Score tracks burn rate impact

## Cost Optimization / Mature Orgs

**Weight profile:** `cost_first` (wQ=0.25, wL=0.20, wR=0.20, wC=0.35)

The board wants ROI proof. Is the AI investment returning value? C-Score becomes the lead metric.

**Framing for Cost Focus:**
- C-Score: actual ROI with dollar breakdown
- Q-Score: quality improvements reducing defect remediation costs
- L-Score: time savings converting to labor value
- R-Score: stability reducing incident response costs
