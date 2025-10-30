import { NanoSDK, NodeDefinition, NodeInstance, resolveAsset, uploadAsset } from '@nanograph/sdk'
import { QueueStatus } from '@fal-ai/client'
import { configureFalClient, fal } from '../../utils/fal-client.js'
import { getParameterValue } from '../../utils/parameter-utils.js'
import { createSeedanceProgressStrategy } from './progress.js'
import { uploadBufferToFal } from '../../utils/fal-storage.js'

interface SeedanceVideoResponse {
  data?: {
    video?: {
      url?: string
    }
    seed?: number
  }
}

const ASPECT_RATIOS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'auto', '9:21'] as const
const VIDEO_RESOLUTIONS = ['480p', '720p'] as const
const VIDEO_DURATIONS = ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const

type AspectRatio = (typeof ASPECT_RATIOS)[number]

type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number]

type VideoDuration = (typeof VIDEO_DURATIONS)[number]

const ensureOption = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => {
  if (typeof value === 'string' && options.includes(value as T)) {
    return value as T
  }
  return fallback
}

const detectImageMime = (buffer: Buffer): string => {
  const signature = buffer.slice(0, 12)

  if (signature.slice(0, 4).toString('hex') === '89504e47') {
    return 'png'
  }

  if (signature.slice(0, 3).toString('hex') === 'ffd8ff') {
    return 'jpeg'
  }

  if (signature.slice(0, 4).toString('hex') === '47494638') {
    return 'gif'
  }

  if (signature.slice(0, 4).toString('hex') === '424d') {
    return 'bmp'
  }

  if (
    signature.slice(0, 4).toString('ascii') === 'RIFF' &&
    signature.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp'
  }

  return 'jpeg'
}

const uploadBufferAsImageUrl = async (buffer: Buffer, filenamePrefix: string): Promise<string> => {
  const format = detectImageMime(buffer)
  return uploadBufferToFal(buffer, format, { filenamePrefix })
}

const nodeDefinition: NodeDefinition = {
  uid: 'fal-seedance-reference-to-video',
  name: 'Seedance Reference to Video',
  category: 'Video Generation',
  version: '1.0.0',
  type: 'server',
  description: 'Generates videos from multiple reference images using Fal.ai Bytedance Seedance Lite',
  inputs: [
    {
      name: 'prompt',
      type: 'string',
      description: 'Text prompt describing the desired motion and story'
    },
    {
      name: 'reference_image1',
      type: 'asset:image',
      description: 'First reference image as asset URI'
    },
    {
      name: 'reference_image2',
      type: 'asset:image',
      description: 'Second reference image as asset URI',
      optional: true
    },
    {
      name: 'reference_image3',
      type: 'asset:image',
      description: 'Third reference image as asset URI',
      optional: true
    },
    {
      name: 'reference_image4',
      type: 'asset:image',
      description: 'Fourth reference image as asset URI',
      optional: true
    }
  ],
  outputs: [
    {
      name: 'video',
      type: 'asset:video',
      description: 'Generated video as asset URI'
    },
    {
      name: 'seed',
      type: 'number',
      description: 'Seed returned by the API when deterministic generation is used'
    }
  ],
  parameters: [
    {
      name: 'aspect_ratio',
      type: 'select',
      value: 'auto',
      default: 'auto',
      label: 'Aspect Ratio',
      description: 'Aspect ratio of the generated video',
      options: [
        { label: '21:9 - Ultra Wide', value: '21:9' },
        { label: '16:9 - Widescreen', value: '16:9' },
        { label: '4:3 - Standard', value: '4:3' },
        { label: '1:1 - Square', value: '1:1' },
        { label: '3:4 - Portrait', value: '3:4' },
        { label: '9:16 - Vertical', value: '9:16' },
        { label: 'Auto (match inputs)', value: 'auto' },
        { label: '9:21 - Tall Vertical', value: '9:21' }
      ]
    },
    {
      name: 'resolution',
      type: 'select',
      value: '720p',
      default: '720p',
      label: 'Resolution',
      description: 'Rendering resolution',
      options: [
        { label: '480p', value: '480p' },
        { label: '720p', value: '720p' }
      ]
    },
    {
      name: 'duration',
      type: 'select',
      value: '5',
      default: '5',
      label: 'Duration (seconds)',
      description: 'Clip duration in seconds',
      options: VIDEO_DURATIONS.map((value) => ({ label: `${value} seconds`, value }))
    },
    {
      name: 'camera_fixed',
      type: 'boolean',
      value: false,
      default: false,
      label: 'Lock Camera',
      description: 'Enable to keep the camera fixed throughout the clip'
    },
    {
      name: 'enable_safety_checker',
      type: 'boolean',
      value: true,
      default: true,
      label: 'Safety Checker',
      description: 'Toggle the Seedance safety checker'
    },
    {
      name: 'seed',
      type: 'number',
      value: -1,
      default: -1,
      label: 'Seed (-1 = random)',
      description: 'Use a fixed seed >= 0 for repeatable generations'
    }
  ]
}

const seedanceReferenceToVideoNode: NodeInstance = NanoSDK.registerNode(nodeDefinition)

seedanceReferenceToVideoNode.execute = async ({ inputs, parameters, context }) => {
  configureFalClient()

  const prompt = inputs.prompt?.[0] as string
  const reference1 = inputs.reference_image1?.[0] as string | undefined
  const reference2 = inputs.reference_image2?.[0] as string | undefined
  const reference3 = inputs.reference_image3?.[0] as string | undefined
  const reference4 = inputs.reference_image4?.[0] as string | undefined

  if (!prompt) {
    context.sendStatus({ type: 'error', message: 'Prompt is required' })
    throw new Error('Prompt is required')
  }

  const referenceUris = [reference1, reference2, reference3, reference4].filter((uri): uri is string => Boolean(uri))

  if (referenceUris.length === 0) {
    context.sendStatus({ type: 'error', message: 'At least one reference image is required' })
    throw new Error('At least one reference image is required')
  }

  const aspectRatioValue = getParameterValue<string>(parameters, 'aspect_ratio', 'auto')
  const resolutionValue = getParameterValue<string>(parameters, 'resolution', '720p')
  const durationValue = getParameterValue<string>(parameters, 'duration', '5')
  const cameraFixedValue = getParameterValue<boolean>(parameters, 'camera_fixed', false)
  const safetyCheckerValue = getParameterValue<boolean>(parameters, 'enable_safety_checker', true)
  const seedValueRaw = getParameterValue<number>(parameters, 'seed', -1)

  const aspect_ratio = ensureOption<AspectRatio>(aspectRatioValue, ASPECT_RATIOS, 'auto')
  const resolution = ensureOption<VideoResolution>(resolutionValue, VIDEO_RESOLUTIONS, '720p')
  const duration = ensureOption<VideoDuration>(durationValue, VIDEO_DURATIONS, '5')
  const camera_fixed = Boolean(cameraFixedValue)
  const enable_safety_checker = Boolean(safetyCheckerValue)
  const seedNumber = Number(seedValueRaw)

  context.sendStatus({ type: 'running', message: 'Processing reference images...' })

  try {
    const referenceImageUrls: string[] = []

    for (let index = 0; index < referenceUris.length; index += 1) {
      const buffer: Buffer = await resolveAsset(referenceUris[index], { asBuffer: true }) as Buffer
      const uploadedUrl = await uploadBufferAsImageUrl(buffer, `seedance-reference-${index + 1}`)
      referenceImageUrls.push(uploadedUrl)
      context.sendStatus({
        type: 'running',
        message: `Uploaded reference image ${index + 1}/${referenceUris.length}`,
        progress: { step: Math.min(10 + (index + 1) * 5, 40), total: 100 }
      })
    }

    const requestPayload: any = {
      prompt,
      reference_image_urls: referenceImageUrls,
      aspect_ratio,
      resolution,
      duration,
      camera_fixed,
      enable_safety_checker
    }

    if (Number.isInteger(seedNumber) && seedNumber >= 0) {
      requestPayload.seed = seedNumber
    }

    let stepCount = 0
    const strategy = createSeedanceProgressStrategy({ durationSec: Number(duration), resolution })
    const result = await fal.subscribe('fal-ai/bytedance/seedance/v1/lite/reference-to-video', {
      input: requestPayload,
      logs: true,
      onQueueUpdate: (status: QueueStatus) => {
        if (status.status === 'IN_QUEUE') {
          const r = strategy.onQueue()
          context.sendStatus({ type: 'running', message: r.message, progress: r.progress })
        } else if (status.status === 'IN_PROGRESS') {
          stepCount += 1
          const r = strategy.onProgress(status, stepCount)
          context.sendStatus({ type: 'running', message: r.message, progress: r.progress })
        } else if (status.status === 'COMPLETED') {
          const r = strategy.onCompleted()
          context.sendStatus({ type: 'running', message: r.message, progress: r.progress })
        }
      }
    }) as SeedanceVideoResponse

    const videoUrl = result.data?.video?.url

    if (!videoUrl) {
      throw new Error('No video was generated by Seedance')
    }

    const response = await fetch(videoUrl)
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const uploadResult = await uploadAsset(buffer, { type: 'video' })

    if (!uploadResult?.uri) {
      throw new Error('Failed to upload generated video')
    }

    const seedOutput = typeof result.data?.seed === 'number' ? [result.data.seed] : []

    return {
      video: [uploadResult.uri],
      seed: seedOutput
    }
  } catch (error: any) {
    const message = error?.message || 'Failed to generate video from references'
    context.sendStatus({ type: 'error', message })
    throw error
  }
}

export default seedanceReferenceToVideoNode
