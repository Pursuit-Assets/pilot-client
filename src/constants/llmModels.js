// Single source of truth for the user-facing LLM roster (the model pickers on
// the Learning page, the GPT chat, and the Coach Evals coach/judge selectors).
//
// `value` is the OpenRouter slug sent to the server; `label`/`description` are
// display-only. Order is the display order. Individual surfaces choose their own
// DEFAULT selection separately (e.g. Learning defaults to LLM_MODELS[0], GPT to
// gpt-5.6-sol) — this module only defines the available options.
//
// Refresh this list when the roster changes; every picker updates automatically.
export const LLM_MODELS = [
  { value: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5', description: 'Latest Claude model' },
  { value: 'anthropic/claude-opus-4.8', label: 'Claude Opus 4.8', description: 'Most capable Claude' },
  { value: 'openai/gpt-5.6-sol', label: 'GPT 5.6 Sol', description: 'Latest GPT flagship' },
  { value: 'openai/gpt-5.6-terra', label: 'GPT 5.6 Terra', description: 'Balanced GPT' },
  { value: 'openai/gpt-5.6-luna', label: 'GPT 5.6 Luna', description: 'Fast GPT' },
  { value: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview', description: 'Advanced reasoning' },
  { value: 'x-ai/grok-4.5', label: 'Grok 4.5', description: 'Fast reasoning' },
  { value: 'moonshotai/kimi-k3', label: 'Kimi K3', description: 'Advanced model' },
  { value: 'z-ai/glm-5.2', label: 'GLM 5.2', description: 'Versatile model' },
  { value: 'deepseek/deepseek-v4-pro', label: 'Deepseek V4 Pro', description: 'Code specialist' },
];
