import { NanoSDK, NodeDefinition, NodeInstance, resolveAsset, uploadAsset } from '@nanograph/sdk'
import { QueueStatus } from '@fal-ai/client'
import { configureFalClient, fal } from '../../utils/fal-client.js'
import { getParameterValue } from '../../utils/parameter-utils.js'
import { createProgressStrategy } from '../../utils/progress-strategy.js'

interface NanoBananaImage {
  url?: string
}

interface NanoBananaEditResponse {
  data?: {
    images?: NanoBananaImage[]
    description?: string
  }
  images?: NanoBananaImage[]
  description?: string
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const allowedFormats = new Set(['jpeg', 'png'])

const detectImageFormat = (buffer: Buffer): string => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg'
  }

  if (
    buffer.length >= 8 &&
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
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x39 || buffer[4] === 0x37) &&
    buffer[5] === 0x61
  ) {
    return 'gif'
  }

  if (
    buffer.length >= 12 &&
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
  uid: 'fal-nano-banana-edit',
  name: 'Nano Banana Edit',
  category: 'Image Editing',
  version: '1.0.0',
  type: 'server',
  description: 'Edits images using the Fal.ai Nano Banana edit model',
  inputs: [
    {
      name: 'prompt',
      type: 'string',
      description: 'Text prompt describing the desired changes'
    },
    {
      name: 'image1',
      type: 'asset:image',
      description: 'Primary image to edit'
    },
    {
      name: 'image2',
      type: 'asset:image',
      description: 'Optional additional reference image',
      optional: true
    },
    {
      name: 'image3',
      type: 'asset:image',
      description: 'Optional additional reference image',
      optional: true
    },
    {
      name: 'image4',
      type: 'asset:image',
      description: 'Optional additional reference image',
      optional: true
    }
  ],
  outputs: [
    {
      name: 'images',
      type: 'asset:image',
      description: 'Edited images as asset URIs'
    },
    {
      name: 'description',
      type: 'string',
      description: 'Model response describing the edits'
    }
  ],
  parameters: [
    {
      name: 'num_images',
      type: 'number',
      value: 1,
      default: 1,
      label: 'Number of Images',
      description: 'How many edited images to generate (1-4)',
      min: 1,
      max: 4
    },
    {
      name: 'output_format',
      type: 'select',
      value: 'jpeg',
      default: 'jpeg',
      label: 'Output Format',
      description: 'Format of the edited images',
      options: [
        { label: 'JPEG', value: 'jpeg' },
        { label: 'PNG', value: 'png' }
      ]
    },
    {
      name: 'sync_mode',
      type: 'boolean',
      value: false,
      default: false,
      label: 'Sync Mode',
      description: 'Return inline images instead of URLs (Fal API option)'
    }
  ]
}

const nanoBananaEditNode: NodeInstance = NanoSDK.registerNode(nodeDefinition)

nanoBananaEditNode.execute = async ({ inputs, parameters, context }) => {
  configureFalClient()

  const prompt = inputs.prompt?.[0] as string
  const imageInputs = [
    inputs.image1?.[0] as string | undefined,
    inputs.image2?.[0] as string | undefined,
    inputs.image3?.[0] as string | undefined,
    inputs.image4?.[0] as string | undefined
  ].filter((uri): uri is string => Boolean(uri))

  if (!prompt) {
    context.sendStatus({ type: 'error', message: 'Prompt is required' })
    throw new Error('Prompt is required')
  }

  if (imageInputs.length === 0) {
    context.sendStatus({ type: 'error', message: 'At least one image is required' })
    throw new Error('At least one image is required')
  }

  const numImages = clamp(Number(getParameterValue(parameters, 'num_images', 1)), 1, 4)
  const requestedFormat = String(getParameterValue(parameters, 'output_format', 'jpeg'))
  const outputFormat = allowedFormats.has(requestedFormat) ? requestedFormat : 'jpeg'
  const syncMode = Boolean(getParameterValue(parameters, 'sync_mode', false))

  context.sendStatus({ type: 'running', message: 'Preparing input images...' })

  try {
    const imageDataUrls: string[] = []

    for (let index = 0; index < imageInputs.length; index++) {
      const assetUri = imageInputs[index]
      const buffer: Buffer = await resolveAsset(assetUri, { asBuffer: true }) as Buffer
      const format = detectImageFormat(buffer)
      const base64 = buffer.toString('base64')
      imageDataUrls.push(`data:image/${format};base64,${base64}`)

      context.sendStatus({
        type: 'running',
        message: `Processed reference image ${index + 1}/${imageInputs.length}`,
        progress: { step: Math.min(10 + (index + 1) * 5, 40), total: 100 }
      })
    }

    const requestPayload = {
      prompt,
      image_urls: imageDataUrls,
      num_images: numImages,
      output_format: outputFormat,
      sync_mode: syncMode
    }

    let stepCount = 0
    const expectedMs = Math.min(180000, Math.max(20000, numImages * 9000))
    const strategy = createProgressStrategy({
      expectedMs,
      inQueueMessage: 'Waiting in queue...',
      finalizingMessage: 'Finalizing edits...',
      defaultInProgressMessage: (n) => `Processing step ${n}...`
    })

    const result = await fal.subscribe('fal-ai/nano-banana/edit', {
      input: requestPayload,
      logs: true,
      onQueueUpdate: (status: QueueStatus) => {
        if (status.status === 'IN_QUEUE') {
          const r = strategy.onQueue()
          const startStep = Math.max(40, r.progress.step)
          context.sendStatus({ type: 'running', message: r.message, progress: { step: startStep, total: 100 } })
        } else if (status.status === 'IN_PROGRESS') {
          stepCount++
          const r = strategy.onProgress(status, stepCount)
          context.sendStatus({ type: 'running', message: r.message, progress: r.progress })
        } else if (status.status === 'COMPLETED') {
          const r = strategy.onCompleted()
          context.sendStatus({ type: 'running', message: r.message, progress: r.progress })
        }
      }
    }) as NanoBananaEditResponse

    const images = result.data?.images ?? result.images ?? []
    if (!images.length) {
      throw new Error('No images were returned by the Nano Banana edit API')
    }

    const uploadedUris: string[] = []
    for (const image of images) {
      if (!image.url) {
        continue
      }

      const response = await fetch(image.url)
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const uploadResult = await uploadAsset(buffer, { type: 'image' })

      if (!uploadResult.uri) {
        throw new Error('Failed to upload edited image')
      }

      uploadedUris.push(uploadResult.uri)
    }

    if (!uploadedUris.length) {
      throw new Error('Edited images could not be retrieved')
    }

    const description = result.data?.description ?? result.description ?? ''

    return {
      images: uploadedUris,
      description: description ? [description] : []
    }
  } catch (error: any) {
    const message = error?.message ?? 'Failed to edit images'
    context.sendStatus({ type: 'error', message })
    throw error
  }
}

export default nanoBananaEditNode
