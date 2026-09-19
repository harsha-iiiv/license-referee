import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai'
import {buildAgent} from '@/lib/agent'

export const maxDuration = 120

export async function POST(req: Request) {
  const {messages}: {messages: UIMessage[]} = await req.json()

  let agent
  try {
    agent = await buildAgent({mode: 'sanity'})
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const hint = /401|403/.test(message)
      ? ' Check SANITY_ORGANIZATION_TOKEN (needs Context Viewer on the organization).'
      : ''
    return Response.json({error: `Sanity Context connection failed: ${message}.${hint}`}, {status: 502})
  }

  const result = streamText({
    model: agent.model,
    system: agent.system,
    messages: await convertToModelMessages(messages),
    tools: agent.tools,
    stopWhen: isStepCount(18),
    onEnd: agent.close,
    onError: ({error}) => {
      console.error('[chat] stream error', error)
    },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({stream: result.stream}),
  })
}
