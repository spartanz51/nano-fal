import { createProgressStrategy, createFrameLogParser } from '../../utils/progress-strategy.js'

export interface SeedanceProgressHints {
  durationSec: number
  resolution?: string
}

export interface SeedanceStrategyOverrides {
  queueStartStep?: number
  inQueueMessage?: string
  finalizingMessage?: string
  defaultInProgressMessage?: (stepCount: number) => string
}

export const createSeedanceProgressStrategy = (
  hints: SeedanceProgressHints,
  overrides?: SeedanceStrategyOverrides
) => {
  const initialTotalFrames = Math.max(10, Math.floor((hints.durationSec || 5) * 24))
  let expectedMs = Math.max(2000, Math.floor((hints.durationSec || 5) * 1000))
  if (hints.resolution === '1080p') expectedMs += 20000
  if (hints.resolution === '720p') expectedMs += 10000

  const strategy = createProgressStrategy({
    expectedMs,
    inQueueMessage: overrides?.inQueueMessage ?? 'Waiting in queue...',
    finalizingMessage: overrides?.finalizingMessage ?? 'Finalizing video...',
    defaultInProgressMessage: overrides?.defaultInProgressMessage ?? ((n) => `Animating frame ${n}...`),
    logParser: createFrameLogParser({ initialTotalFrames })
  })

  if (overrides?.queueStartStep !== undefined) {
    const start = Math.max(0, Math.min(100, overrides.queueStartStep))
    return {
      onQueue: () => ({ message: overrides?.inQueueMessage ?? 'Waiting in queue...', progress: { step: start, total: 100 } }),
      onProgress: strategy.onProgress,
      onCompleted: strategy.onCompleted
    }
  }

  return strategy
}


