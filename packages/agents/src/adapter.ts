// Compatibiliteit: bestaande callers blijven @jc/agents gebruiken.
export { MockModelAdapter, AnthropicModelAdapter, OllamaModelAdapter, Semaphore, createModelAdapter, modelConfigFromEnv } from '@jc/ai';
export type { GenerateRequest, GenerateResult, ModelAdapter, ModelConfig, ModelTool } from '@jc/ai';
