export interface ProviderModel {
  id: string;
  name: string;
  enabled: boolean;
  description?: string;
  vendor?: string;
  family?: string;
  version?: string;
  maxInputTokens?: number;
  supportsStreaming?: boolean;
  supportsTokenCounting?: boolean;
}

export interface AIProvider {
  id: string;
  name: string;
  displayName?: string;
  enabled: boolean;
  description?: string;
  supportsStreaming?: boolean;
  supportsTokenCounting?: boolean;
  supportsCancellation?: boolean;
  status?: 'available' | 'fallback' | 'unavailable';
  statusMessage?: string;
  models: ProviderModel[];
}