export interface AiChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface AiModelProvider { complete(messages: AiChatMessage[], model?: string): Promise<string> }

export function createOpenAiProvider(apiKey = process.env.OPENAI_API_KEY, fetcher: typeof fetch = fetch): AiModelProvider {
  return {
    async complete(messages, model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini') {
      if (!apiKey) throw new Error('AI is not configured')
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12_000)
      try {
        const result = await fetcher('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: controller.signal, headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, temperature: 0.2, messages }) })
        if (!result.ok) throw new Error('AI provider failure')
        const payload = await result.json() as { choices?: Array<{ message?: { content?: unknown } }> }
        const content = payload.choices?.[0]?.message?.content
        if (typeof content !== 'string' || !content.trim()) throw new Error('Invalid AI response')
        return content.trim()
      } finally { clearTimeout(timeout) }
    },
  }
}
