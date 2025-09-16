// Minimal heuristic parser for FAL queue logs → structured progress
// Intentionally simple: safe to use across all model endpoints

export interface ParsedProgressInfo {
  stage: 'queue' | 'preprocessing' | 'encoding' | 'inference' | 'postprocessing' | 'uploading' | 'finalizing' | 'completed' | 'unknown'
  message: string
  step: number
  total: number
  etaSeconds?: number
}

const defaultTotal = 100

export const parseFalLog = (rawMessage?: string): ParsedProgressInfo => {
  const message = (rawMessage || '').trim()

  if (!message) {
    return { stage: 'unknown', message: 'Processing...', step: 0, total: defaultTotal }
  }

  const lower = message.toLowerCase()

  // Stage detection by keyword
  if (lower.includes('queue') || lower.includes('queued')) {
    return { stage: 'queue', message, step: 1, total: defaultTotal }
  }
  if (lower.includes('preprocess') || lower.includes('prepare')) {
    return { stage: 'preprocessing', message, step: 5, total: defaultTotal }
  }
  if (lower.includes('encode') || lower.includes('tokenize')) {
    return { stage: 'encoding', message, step: 10, total: defaultTotal }
  }
  if (lower.includes('inference') || lower.includes('sampling') || lower.includes('denoise')) {
    return { stage: 'inference', message, step: 40, total: defaultTotal }
  }
  if (lower.includes('render') || lower.includes('compose') || lower.includes('stitch')) {
    return { stage: 'postprocessing', message, step: 70, total: defaultTotal }
  }
  if (lower.includes('upload')) {
    return { stage: 'uploading', message, step: 90, total: defaultTotal }
  }
  if (lower.includes('finalizing') || lower.includes('finalize')) {
    return { stage: 'finalizing', message, step: 95, total: defaultTotal }
  }
  if (lower.includes('complete') || lower.includes('done')) {
    return { stage: 'completed', message, step: 100, total: defaultTotal }
  }

  // Generic fallback
  return { stage: 'unknown', message, step: 50, total: defaultTotal }
}

export const combineProgress = (baseStep: number, info?: ParsedProgressInfo): { step: number, total: number } => {
  const total = info?.total ?? defaultTotal
  const step = Math.min(total, Math.max(baseStep, info?.step ?? 0))
  return { step, total }
}

// Time-based ETA progress estimator for when logs are empty
export interface EtaEstimatorOptions {
  expectedMs: number
  total?: number
  minStartStep?: number
  maxCapStep?: number
}

export interface EtaSnapshot {
  step: number
  total: number
  etaSeconds: number
  elapsedSeconds: number
}

export const createEtaEstimator = (options: EtaEstimatorOptions) => {
  const total = options.total ?? defaultTotal
  const minStart = options.minStartStep ?? 5
  const maxCap = Math.min(options.maxCapStep ?? 98, total)
  const expectedMs = Math.max(options.expectedMs, 2000)
  const startedAt = Date.now()
  let lastStep = 0

  const current = (): EtaSnapshot => {
    const elapsedMs = Date.now() - startedAt
    const ratio = Math.min(elapsedMs / expectedMs, 0.99)
    const projected = Math.floor(ratio * total)
    const step = Math.min(maxCap, Math.max(minStart, projected, lastStep))
    lastStep = step
    const remainingMs = Math.max(expectedMs - elapsedMs, 0)
    return {
      step,
      total,
      etaSeconds: Math.ceil(remainingMs / 1000),
      elapsedSeconds: Math.floor(elapsedMs / 1000)
    }
  }

  return { current }
}


