export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface AiToolCall {
  id: string
  name: string
  arguments: unknown
}

export interface AiModelResponse {
  content: string | null
  toolCalls: AiToolCall[]
}

export interface AiModelProvider {
  complete(messages: AiChatMessage[], tools?: AiToolDefinition[], model?: string): Promise<AiModelResponse>
}

export function createOpenAiProvider(apiKey = process.env.OPENAI_API_KEY, fetcher: typeof fetch = fetch): AiModelProvider {
  return {
    async complete(messages, tools, model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini') {
      if (!apiKey) throw new Error('AI is not configured')
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12_000)
      try {
        const result = await fetcher('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: controller.signal, headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, temperature: 0.2, messages, tools, tool_choice: tools?.length ? 'auto' : undefined }) })
        if (!result.ok) throw new Error('AI provider failure')
        const payload = await result.json() as { choices?: Array<{ message?: { content?: unknown; tool_calls?: Array<{ id?: unknown; function?: { name?: unknown; arguments?: unknown } }> } }> }
        const message = payload.choices?.[0]?.message
        const toolCalls = (message?.tool_calls ?? []).map((call) => {
          if (typeof call.id !== 'string' || typeof call.function?.name !== 'string' || typeof call.function.arguments !== 'string') throw new Error('Invalid AI tool call')
          let args: unknown
          try { args = JSON.parse(call.function.arguments) } catch { throw new Error('Invalid AI tool arguments') }
          return { id: call.id, name: call.function.name, arguments: args }
        })
        const content = message?.content
        if (content != null && typeof content !== 'string') throw new Error('Invalid AI response')
        if (!content?.trim() && !toolCalls.length) throw new Error('Invalid AI response')
        return { content: content?.trim() || null, toolCalls }
      } finally { clearTimeout(timeout) }
    },
  }
}
