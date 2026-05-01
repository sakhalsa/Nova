import { Dimension, ConnectorName, SignalConfidence } from '../types.js';

export interface DiagnosticEntry {
  key: string;
  value: unknown;
  label: string;
}

export interface ProvenanceEntry {
  signal: string;
  rawValue: unknown;
  normalizedValue: number;
  connector: string;
  apiEndpoint: string;
  timestamp: string;
  sampleSize: number;
}

export interface ConnectorOutput {
  signals: Record<string, number>;
  diagnostics: DiagnosticEntry[];
  connected: boolean;
  confidence?: SignalConfidence;
  provenance?: ProvenanceEntry[];
}

export interface Connector {
  name: ConnectorName;
  dimensions: Dimension[];
  requiredCredentials: string[];
  validate(config: Record<string, unknown>): Promise<{ connected: boolean; error?: string }>;
  collect(config: Record<string, unknown>): Promise<ConnectorOutput>;
}
