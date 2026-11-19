import { MockModelAdapter, AnthropicModelAdapter, type ModelAdapter } from './adapter';
import { OllamaModelAdapter } from './ollama-adapter';
export * from './adapter';
export * from './ollama-adapter';
export * from './mock';

export interface ModelConfig {
  provider: string;
  allowRealRuns: boolean;
  apiKey: string | undefined;
  modelAlias: string;
  ollamaModel?: string;
  ollamaBaseUrl?: string;
}

export function modelConfigFromEnv(env = process.env): ModelConfig {
  return {
    provider: env.MODEL_PROVIDER || 'mock',
    ollamaModel: env.OLLAMA_MODEL || 'hermes3',
    ollamaBaseUrl: env.OLLAMA_BASE_URL || 'http://localhost:11434',
    allowRealRuns: env.ALLOW_REAL_MODEL_RUNS === 'true',
    apiKey: env.ANTHROPIC_API_KEY || undefined,
    modelAlias: env.MODEL_ALIAS || 'claude-opus-5-5',
  };
}

/** Ollama draait lokaal; alleen Anthropic vereist expliciete toestemming en een key. */
export function createModelAdapter(cfg: ModelConfig): ModelAdapter {
  if (cfg.provider === 'ollama') return new OllamaModelAdapter(cfg.ollamaModel || 'hermes3', cfg.ollamaBaseUrl || 'http://localhost:11434');
  if (cfg.provider === 'anthropic') {
    if (!cfg.allowRealRuns) throw new Error('MODEL_PROVIDER=anthropic maar ALLOW_REAL_MODEL_RUNS is niet true.');
    if (!cfg.apiKey) throw new Error('ANTHROPIC_API_KEY ontbreekt voor echte modelruns.');
    return new AnthropicModelAdapter(cfg.modelAlias, cfg.apiKey);
  }
  return new MockModelAdapter();
}

