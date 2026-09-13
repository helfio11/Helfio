import assert from 'node:assert/strict'
import test from 'node:test'
import { createOpenAiProvider, type AiToolDefinition } from './ai.js'

test('OpenAI provider sends schemas and parses native tool calls', async () => {
  let requestBody: Record<string, unknown> | undefined
  const provider = createOpenAiProvider('test-key', async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: 'call-1', function: { name: 'searchCategories', arguments: '{"query":"clean"}' } }] } }] }), { status: 200 })
  })
  const tools: AiToolDefinition[] = [{ type: 'function', function: { name: 'searchCategories', description: 'Search categories', parameters: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false } } }]
  const response = await provider.complete([{ role: 'user', content: 'Find cleaning' }], tools)
  assert.deepEqual(response.toolCalls, [{ id: 'call-1', name: 'searchCategories', arguments: { query: 'clean' } }])
  assert.deepEqual(requestBody?.tools, tools)
})