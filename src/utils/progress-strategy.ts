import { QueueStatus } from '@fal-ai/client'
import { createEtaEstimator, parseFalLog, combineProgress } from './progress-utils.js'

export interface ProgressComputationResult {
  message: string
  progress: { step: number, total: number }
}

export type LogParser = (status: QueueStatus, stepCount: number) => ProgressComputationResult | null

export interface ProgressStrategyOptions {
  expectedMs: number
  minStartStep?: number
  maxCapStep?: number
  inQueueMessage?: string
  finalizingMessage?: string
  defaultInProgressMessage?: (stepCount: number) => string
  logParser?: LogParser
}

export const createProgressStrategy = (options: ProgressStrategyOptions) => {
  const eta = createEtaEstimator({
    expectedMs: options.expectedMs,
    minStartStep: options.minStartStep ?? 10,
    maxCapStep: options.maxCapStep ?? 98
  })

  const inQueueMessage = options.inQueueMessage ?? 'Waiting in queue...'
  const finalizingMessage = options.finalizingMessage ?? 'Finalizing...'
  const defaultInProgressMessage = options.defaultInProgressMessage ?? ((step: number) => `Processing step ${step}...`)

  const onQueue = (): ProgressComputationResult => ({
    message: inQueueMessage,
    progress: { step: 5, total: 100 }
  })

  const onProgress = (status: QueueStatus, stepCount: number): ProgressComputationResult => {
    // Try custom parser first
    if (options.logParser) {
      try {
        const parsed = options.logParser(status, stepCount)
        if (parsed && parsed.progress?.total && parsed.progress?.step !== undefined) {
          // Clip to 0..total
          const total = parsed.progress.total
          const step = Math.min(total, Math.max(0, parsed.progress.step))
          return { message: parsed.message, progress: { step, total } }
        }
      } catch {}
    }

    // Fallback to generic: use FAL logs if any; else ETA
    const hasLogs = 'logs' in status && Array.isArray((status as any).logs) && (status as any).logs.length > 0
    if (hasLogs) {
      const logMessage = (status as any).logs[(status as any).logs.length - 1]?.message as string | undefined
      const parsed = parseFalLog(logMessage)
      const base = Math.min(20 + stepCount * 3, 92)
      const progress = combineProgress(base, parsed)
      return {
        message: parsed.message || logMessage || defaultInProgressMessage(stepCount),
        progress
      }
    }

    const snap = eta.current()
    return {
      message: `Processing... (${snap.elapsedSeconds}s elapsed, ~${snap.etaSeconds}s ETA)`,
      progress: { step: snap.step, total: snap.total }
    }
  }

  const onCompleted = (): ProgressComputationResult => ({
    message: finalizingMessage,
    progress: { step: 100, total: 100 }
  })

  return { onQueue, onProgress, onCompleted }
}

// Helper to build a frame-based parser (e.g., Seedance)
export interface FrameParserOptions {
  frameRegex?: RegExp // defaults to /Animating frame\s+(\d+)/i
  initialTotalFrames?: number // default 200
  hardCapPercent?: number // default 98
}

export const createFrameLogParser = (opts?: FrameParserOptions): LogParser => {
  const regex = opts?.frameRegex ?? /Animating frame\s+(\d+)/i
  let totalFrames = Math.max(10, opts?.initialTotalFrames ?? 200)
  const cap = Math.min(99, Math.max(50, opts?.hardCapPercent ?? 98))

  return (status: QueueStatus, _stepCount: number) => {
    const hasLogs = 'logs' in status && Array.isArray((status as any).logs) && (status as any).logs.length > 0
    if (!hasLogs) return null
    const logMessage = (status as any).logs[(status as any).logs.length - 1]?.message as string | undefined
    if (!logMessage) return null
    const match = logMessage.match(regex)
    if (!match) return null
    const frame = Number(match[1])
    if (!Number.isFinite(frame)) return null
    if (frame > totalFrames) totalFrames = frame + 5 // adjust dynamically to avoid early 100%
    const percent = Math.min(cap, Math.floor((frame / totalFrames) * 100))
    return {
      message: `Animating frame ${frame}...`,
      progress: { step: percent, total: 100 }
    }
  }
}


