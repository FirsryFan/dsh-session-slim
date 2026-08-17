/**
 * @dsh-external/dsh-session-slim
 *
 * Host half: installs runtime wrappers on the ApiProxy so history and live
 * frames stop shipping `sourceEventSeqs` arrays and settled `assistant/chunk`
 * events to the browser. For the deeper core changes (range-based
 * sourceEventSeqs, client-side live pruning) run:
 *
 *   bash scripts/apply-core-patch.sh /path/to/deepseek-harness
 *
 * The runtime wrappers are safe on their own and also safe when the core patch
 * is already applied (the transforms are idempotent).
 */
import type { Context } from 'cordis'
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session'
import type { AssistantStreamSummary, SessionEvent } from '@deepseek-ai/dsh-session'

export const name = '@dsh-external/dsh-session-slim'
export const inject = ['apiProxy']

type ApiProxyLike = {
  sessions: {
    history(request: unknown): Promise<{
      result: { ok: true; value: { events: { event: SessionEvent; view?: unknown }[] } } | { ok: false; value?: unknown }
    }>
  }
  events: {
    mux(request: unknown, signal: AbortSignal): AsyncIterable<{
      rpcId?: unknown
      payload: { type: 'session/event'; sessionId: unknown; event: SessionEvent; view?: unknown } | Record<string, unknown>
    }>
  }
}

type AppContext = Context & { apiProxy: ApiProxyLike }

function withoutSourceEventSeqs(event: SessionEvent): SessionEvent {
  if (!Object.prototype.hasOwnProperty.call(event, 'sourceEventSeqs')) return event
  const copy = { ...event } as SessionEvent & { sourceEventSeqs?: unknown }
  delete copy.sourceEventSeqs
  return copy
}

function isTokenDeltaChunk(chunk: { type: string }): boolean {
  return chunk.type === 'text-delta' || chunk.type === 'reasoning-delta' || chunk.type === 'tool-call-delta'
}

function assistantStreamSummaries(events: readonly SessionEvent[]): Map<string, AssistantStreamSummary> {
  const chunkStats = new Map<string, {
    firstChunkSeq: number
    firstChunkTime: number
    firstTokenTime?: number
    chunkCount: number
  }>()
  for (const event of events) {
    if (event.type !== 'assistant/chunk') continue
    const { turn, step, chunk } = event.data
    const key = `${turn}:${step}`
    const stats = chunkStats.get(key) ?? {
      firstChunkSeq: event.seq,
      firstChunkTime: event.time,
      chunkCount: 0,
    }
    if (stats.firstTokenTime === undefined && isTokenDeltaChunk(chunk as { type: string })) {
      stats.firstTokenTime = event.time
    }
    stats.chunkCount += 1
    chunkStats.set(key, stats)
  }
  const summaries = new Map<string, AssistantStreamSummary>()
  for (const event of events) {
    if (event.type !== 'assistant/message' || !isAppendSurfaceEvent(event)) continue
    const key = `${event.data.turn}:${event.data.step}`
    const summary = event.data.stream ?? chunkStats.get(key)
    if (summary !== undefined) summaries.set(key, summary)
  }
  return summaries
}

function pruneSettledAssistantChunks(
  events: readonly SessionEvent[],
  summaries: ReadonlyMap<string, AssistantStreamSummary>,
): SessionEvent[] {
  if (summaries.size === 0) return [...events]
  return events.filter(event => {
    if (event.type !== 'assistant/chunk') return true
    const { turn, step } = event.data
    return !summaries.has(`${turn}:${step}`)
  })
}

function transformHistoryEvents(entries: { event: SessionEvent; view?: unknown }[]): { event: SessionEvent; view?: unknown }[] {
  const events = entries.map(entry => entry.event)
  const summaries = assistantStreamSummaries(events)
  const pageEvents = pruneSettledAssistantChunks(events, summaries)
  return pageEvents.map(event => {
    const entry = entries.find(candidate => candidate.event.seq === event.seq)
    let wireEvent = withoutSourceEventSeqs(event)
    if (event.type === 'assistant/message'
      && isAppendSurfaceEvent(event)
      && event.data.stream === undefined) {
      const summary = summaries.get(`${event.data.turn}:${event.data.step}`)
      if (summary !== undefined) {
        wireEvent = {
          ...wireEvent,
          data: { ...wireEvent.data, stream: summary },
        } as SessionEvent
      }
    }
    return { event: wireEvent, ...(entry?.view === undefined ? {} : { view: entry.view }) }
  })
}

async function* transformMux(
  source: AsyncIterable<{ rpcId?: unknown; payload: { type: 'session/event'; sessionId: unknown; event: SessionEvent; view?: unknown } | Record<string, unknown> }>,
): AsyncIterable<{ rpcId?: unknown; payload: { type: 'session/event'; sessionId: unknown; event: SessionEvent; view?: unknown } | Record<string, unknown> }> {
  for await (const request of source) {
    if (request.payload?.type === 'session/event') {
      const payload = request.payload as { type: 'session/event'; sessionId: unknown; event: SessionEvent; view?: unknown }
      yield {
        ...request,
        payload: {
          ...payload,
          event: withoutSourceEventSeqs(payload.event),
        },
      }
    } else {
      yield request
    }
  }
}

export function apply(ctx: AppContext): void {
  const apiProxy = ctx.apiProxy
  const originalHistory = apiProxy.sessions.history.bind(apiProxy.sessions)
  apiProxy.sessions.history = async (request: unknown) => {
    const response = await originalHistory(request)
    if (response.result.ok) {
      response.result.value.events = transformHistoryEvents(response.result.value.events)
    }
    return response
  }

  const originalMux = apiProxy.events.mux.bind(apiProxy.events)
  apiProxy.events.mux = (request: unknown, signal: AbortSignal) =>
    transformMux(originalMux(request, signal))

  ctx.logger?.info?.('[dsh-session-slim] runtime history/live wrappers installed')
}
