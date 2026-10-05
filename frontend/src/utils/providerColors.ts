const BRAND_COLORS: Record<string, string> = {
  openai: '#10a37f',
  claude: '#d97757',
  gemini: '#4285f4',
  deepseek: '#4f6bf5',
  grok: '#1c1c1c',
  groq: '#f97316',
  siliconflow: '#06b6d4',
  aihubmix: '#8b5cf6',
  ollama: '#7c3aed',
  vllm: '#0891b2',
  huggingface: '#fbbf24',
  openrouter: '#f97316',
  azure_openai: '#0078d4',
  minimax: '#ec4899',
  doubao: '#ef4444',
  glm: '#3b82f6',
  bigmodel: '#3b82f6',
  'z.ai': '#6366f1',
  kimi: '#f59e0b',
  qwen: '#10b981',
  volcengine: '#06b6d4',
  transformers: '#a855f7',
  remote_http: '#6b7280',
  custom_http: '#6b7280',
  codex_cli: '#22c55e',
  claude_code_cli: '#d97757',
  opencode_cli: '#6366f1',
  kimi_code_cli: '#f59e0b',
  qwen_code_cli: '#10b981',
}

const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#0891b2', '#4f46e5', '#7c3aed',
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function getProviderColor(providerKey: string): string {
  const key = providerKey.toLowerCase()
  if (BRAND_COLORS[key]) return BRAND_COLORS[key]
  return PALETTE[hashString(key) % PALETTE.length]
}
