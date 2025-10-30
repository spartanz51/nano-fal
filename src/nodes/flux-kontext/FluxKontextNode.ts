import { NanoSDK, NodeDefinition, NodeInstance, resolveAsset, uploadAsset } from '@nanograph/sdk'
import { QueueStatus } from '@fal-ai/client'
import { configureFalClient, fal } from '../../utils/fal-client.js'
import { createProgressStrategy } from '../../utils/progress-strategy.js'
import { getParameterValue } from '../../utils/parameter-utils.js'
import { uploadBufferToFal } from '../../utils/fal-storage.js'

interface FluxKontextImage {
  url?: string
}

interface FluxKontextResponse {
  images?: FluxKontextImage[]
  seed?: number
  data?: {
    images?: FluxKontextImage[]
    seed?: number
  }
}

const MODEL_OPTIONS = ['pro', 'max'] as const
const OUTPUT_FORMATS = ['jpeg', 'png'] as const
const SAFETY_LEVELS = ['1', '2', '3', '4', '5', '6'] as const
const ASPECT_RATIOS = ['21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:21'] as const

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

const ensureOption = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => {
  if (typeof value === 'string' && (options as readonly string[]).includes(value)) {
    return value as T
  }
  return fallback
}

const detectImageFormat = (buffer: Buffer): 'jpeg' | 'png' | 'webp' => {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg'
  }
  if (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png'
  }
  if (
    buffer.length > 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp'
  }
  return 'jpeg'
}

const nodeDefinition: NodeDefinition = {
  uid: 'fal-flux-kontext',
  name: 'Flux Kontext Image Edit',
  category: 'Image Editing',
  version: '1.1.0',
  type: 'server',
  description: 'Edits an input image with text guidance using Fal.ai Flux Kontext models',
  inputs: [
    {
      name: 'prompt',
      type: 'string',
      description: 'Text prompt describing how to transform the image'
    },
    {
      name: 'image',
      type: 'asset:image',
      description: 'Source image to edit'
    }
  ],
  outputs: [
    {
      name: 'image',
      type: 'asset:image',
      description: 'Generated images as NanoGraph asset URIs'
    },
    {
      name: 'seed',
      type: 'number',
      description: 'Seed value returned by the API when deterministic generation is used'
    }
  ],
  parameters: [
    {
      name: 'model_version',
      type: 'select',
      value: 'max',
      default: 'max',
      label: 'Model Version',
      description: 'Choose between Flux Kontext Pro and Flux Kontext Max',
      options: [
        { label: 'Flux Kontext Pro', value: 'pro' },
        { label: 'Flux Kontext Max', value: 'max' }
      ]
    },
    {
      name: 'guidance_scale',
      type: 'number',
      value: 3.5,
      default: 3.5,
      min: 1,
      max: 20,
      step: 0.1,
      label: 'Guidance Scale',
      description: 'Controls how strongly the model follows the prompt (1-20)'
    },
    {
      name: 'num_images',
      type: 'number',
      value: 1,
      default: 1,
      min: 1,
      max: 4,
      step: 1,
      label: 'Number of Images',
      description: 'How many images to generate per request (1-4)'
    },
    {
      name: 'output_format',
      type: 'select',
      value: 'jpeg',
      default: 'jpeg',
      label: 'Output Format',
      description: 'File format for generated images',
      options: [
        { label: 'JPEG', value: 'jpeg' },
        { label: 'PNG', value: 'png' }
      ]
    },
    {
      name: 'safety_tolerance',
      type: 'select',
      value: '2',
      default: '2',
      label: 'Safety Tolerance',
      description: 'Content safety tolerance level (1 = strict, 6 = most permissive)',
      options: [
        { label: '1 - Most Strict', value: '1' },
        { label: '2 - Strict', value: '2' },
        { label: '3 - Moderate', value: '3' },
        { label: '4 - Permissive', value: '4' },
        { label: '5 - Very Permissive', value: '5' },
        { label: '6 - Most Permissive', value: '6' }
      ]
    },
    {
      name: 'aspect_ratio',
      type: 'select',
      value: '1:1',
      default: '1:1',
      label: 'Aspect Ratio',
      description: 'Aspect ratio for generated images',
      options: ASPECT_RATIOS.map((ratio) => ({ label: ratio, value: ratio }))
    },
    {
      name: 'sync_mode',
      type: 'boolean',
      value: false,
      default: false,
      label: 'Sync Mode',
      description: 'Wait for CDN uploads before returning (reduces queue polling, slightly slower)'
    },
    {
      name: 'enhance_prompt',
      type: 'boolean',
      value: false,
      default: false,
      label: 'Enhance Prompt',
      description: 'Let the model automatically enhance the prompt for more detail'
    },
    {
      name: 'seed',
      type: 'number',
      value: -1,
      default: -1,
      min: -1,
      step: 1,
      label: 'Seed',
      description: 'Use a fixed seed (>= 0) for repeatable generations, or -1 for random'
    }
  ]
}

const fluxKontextNode: NodeInstance = NanoSDK.registerNode(nodeDefinition)

fluxKontextNode.execute = async ({ inputs, parameters, context }) => {
  configureFalClient()

  const prompt = inputs.prompt?.[0] as string
  const imageUri = inputs.image?.[0] as string

  if (!prompt) {
    context.sendStatus({ type: 'error', message: 'Prompt is required' })
    throw new Error('Prompt is required')
  }

  if (!imageUri) {
    context.sendStatus({ type: 'error', message: 'An input image is required' })
    throw new Error('An input image is required')
  }

  const modelVersion = ensureOption(getParameterValue(parameters, 'model_version', 'max'), MODEL_OPTIONS, 'max')
  const guidanceScale = clamp(Number(getParameterValue(parameters, 'guidance_scale', 3.5)), 1, 20)
  const numImages = clamp(Math.round(Number(getParameterValue(parameters, 'num_images', 1))), 1, 4)
  const requestedFormat = getParameterValue(parameters, 'output_format', 'jpeg')
  const outputFormat = ensureOption(requestedFormat, OUTPUT_FORMATS, 'jpeg')
  const safetyTolerance = ensureOption(getParameterValue(parameters, 'safety_tolerance', '2'), SAFETY_LEVELS, '2')
  const aspectRatio = ensureOption(getParameterValue(parameters, 'aspect_ratio', '1:1'), ASPECT_RATIOS, '1:1')
  const syncMode = Boolean(getParameterValue(parameters, 'sync_mode', false))
  const enhancePrompt = Boolean(getParameterValue(parameters, 'enhance_prompt', false))
  const seedValue = Number(getParameterValue(parameters, 'seed', -1))
  const seed = Number.isInteger(seedValue) && seedValue >= 0 ? seedValue : undefined

  context.sendStatus({ type: 'running', message: 'Preparing source image...' })

  const imageBuffer = await resolveAsset(imageUri, { asBuffer: true }) as Buffer
  const detectedFormat = detectImageFormat(imageBuffer)
  const imageUrl = await uploadBufferToFal(imageBuffer, detectedFormat, { filenamePrefix: 'flux-kontext-source' })

  const payload: Record<string, unknown> = {
    prompt,
    guidance_scale: guidanceScale,
    num_images: numImages,
    output_format: outputFormat,
    safety_tolerance: safetyTolerance,
    aspect_ratio: aspectRatio,
    sync_mode: syncMode,
    enhance_prompt: enhancePrompt,
    image_url: imageUrl
  }

  if (typeof seed === 'number') {
    payload.seed = seed
  }

  const endpoint = modelVersion === 'max'
    ? 'fal-ai/flux-pro/kontext/max'
    : 'fal-ai/flux-pro/kontext'

  const baseMs = modelVersion === 'max' ? 36000 : 26000
  const syncFactor = syncMode ? 1.2 : 1
  const expectedMs = Math.min(120000, Math.max(18000, Math.floor(baseMs * numImages * syncFactor)))

  const strategy = createProgressStrategy({
    expectedMs,
    inQueueMessage: 'Waiting in queue...',
    finalizingMessage: 'Finalizing images...',
    defaultInProgressMessage: (step) => `Processing step ${step}...`
  })

  try {
    let stepCount = 0

    const result = await fal.subscribe(endpoint, {
      input: payload as any,
      logs: true,
      onQueueUpdate: (status: QueueStatus) => {
        if (status.status === 'IN_QUEUE') {
          const update = strategy.onQueue()
          context.sendStatus({ type: 'running', message: update.message, progress: update.progress })
        } else if (status.status === 'IN_PROGRESS') {
          stepCount += 1
          const update = strategy.onProgress(status, stepCount)
          context.sendStatus({ type: 'running', message: update.message, progress: update.progress })
        } else if (status.status === 'COMPLETED') {
          const update = strategy.onCompleted()
          context.sendStatus({ type: 'running', message: update.message, progress: update.progress })
        }
      }
    }) as FluxKontextResponse

    const responseData = (result as any)?.data ?? {}
    const directImages: FluxKontextImage[] = Array.isArray(result.images) ? result.images : []
    const dataImages: FluxKontextImage[] = Array.isArray(responseData.images) ? responseData.images : []
    const images: FluxKontextImage[] = directImages.length ? directImages : dataImages

    if (!images.length) {
      throw new Error('No images were returned by the Flux Kontext API')
    }

    const uploadedImages = await Promise.all(images.map(async (image: FluxKontextImage) => {
      if (!image?.url) {
        throw new Error('Flux Kontext returned an image without a URL')
      }

      const response = await fetch(image.url)
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const uploadResult = await uploadAsset(buffer, { type: 'image' })

      if (!uploadResult?.uri) {
        throw new Error('Failed to upload generated image')
      }

      return uploadResult.uri
    }))

    const responseSeed = typeof responseData.seed === 'number'
      ? responseData.seed
      : (typeof (result as any).seed === 'number' ? (result as any).seed : undefined)

    return {
      image: uploadedImages,
      seed: typeof responseSeed === 'number' ? [responseSeed] : []
    }
  } catch (error: any) {
    const message = error?.message || 'Failed to generate image'
    context.sendStatus({ type: 'error', message })
    throw error
  }
}

export default fluxKontextNode
