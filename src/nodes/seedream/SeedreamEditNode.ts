import { NanoSDK, NodeDefinition, NodeInstance, resolveAsset, uploadAsset } from '@nanograph/sdk'
import { QueueStatus } from '@fal-ai/client'
import { configureFalClient, fal } from '../../utils/fal-client.js'
import { getParameterValue } from '../../utils/parameter-utils.js'

interface SeedreamEditResponse {
  data: {
    images: Array<{
      url: string
    }>
    seed?: number
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const nodeDef: NodeDefinition = {
  uid: 'fal-seedream-edit',
  name: 'Seedream v4 Edit',
  category: 'Image Editing',
  version: '1.0.0',
  type: 'server',
  description: 'Edits images using the Fal.ai Bytedance Seedream v4 Edit model',
  inputs: [
    {
      name: 'prompt',
      type: 'string',
      description: 'Text prompt describing the desired edits'
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
      description: 'Generated or edited images as asset URIs'
    },
    {
      name: 'seed',
      type: 'number',
      description: 'Random seed used for generation (if provided by API)'
    }
  ],
  parameters: [
    {
      name: 'image_width',
      type: 'number',
      value: 1280,
      default: 1280,
      label: 'Image Width',
      description: 'Width of the generated image (1024 - 4096)',
      min: 1024,
      max: 4096
    },
    {
      name: 'image_height',
      type: 'number',
      value: 1280,
      default: 1280,
      label: 'Image Height',
      description: 'Height of the generated image (1024 - 4096)',
      min: 1024,
      max: 4096
    },
    {
      name: 'num_images',
      type: 'number',
      value: 1,
      default: 1,
      label: 'Generations',
      description: 'Number of times to run the model',
      min: 1,
      max: 6
    },
    {
      name: 'max_images',
      type: 'number',
      value: 1,
      default: 1,
      label: 'Images per Generation',
      description: 'Maximum images to return for each generation',
      min: 1,
      max: 6
    },
    {
      name: 'seed',
      type: 'number',
      value: -1,
      default: -1,
      label: 'Seed (-1 = random)',
      description: 'Fixed seed for reproducibility; use -1 for random'
    },
    {
      name: 'enable_safety_checker',
      type: 'boolean',
      value: true,
      default: true,
      label: 'Enable Safety Checker',
      description: 'Toggle the Seedream safety checker'
    },
    {
      name: 'sync_mode',
      type: 'boolean',
      value: false,
      default: false,
      label: 'Sync Mode',
      description: 'Wait for images to upload before returning'
    }
  ]
}

const seedreamEditNode: NodeInstance = NanoSDK.registerNode(nodeDef)

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
  return 'jpeg'
}

seedreamEditNode.execute = async ({ inputs, parameters, context }) => {
  configureFalClient()

  const prompt = inputs.prompt?.[0] as string
  const image1 = inputs.image1?.[0] as string
  const image2 = inputs.image2?.[0] as string
  const image3 = inputs.image3?.[0] as string
  const image4 = inputs.image4?.[0] as string

  if (!prompt) {
    context.sendStatus({ type: 'error', message: 'Prompt is required' })
    throw new Error('Prompt is required')
  }

  const inputImages = [
    image1,
    image2,
    image3,
    image4
  ].filter((uri): uri is string => Boolean(uri))

  if (inputImages.length === 0) {
    context.sendStatus({ type: 'error', message: 'At least one input image is required' })
    throw new Error('At least one input image is required')
  }

  const imageWidth = clamp(Number(getParameterValue(parameters, 'image_width', 1280)), 1024, 4096)
  const imageHeight = clamp(Number(getParameterValue(parameters, 'image_height', 1280)), 1024, 4096)
  const numImages = clamp(Number(getParameterValue(parameters, 'num_images', 1)), 1, 6)
  const maxImages = clamp(Number(getParameterValue(parameters, 'max_images', 1)), 1, 6)
  const seedValue = Number(getParameterValue(parameters, 'seed', -1))
  const enableSafetyChecker = Boolean(getParameterValue(parameters, 'enable_safety_checker', true))
  const syncMode = Boolean(getParameterValue(parameters, 'sync_mode', false))

  context.sendStatus({ type: 'running', message: 'Preparing input images...' })

  try {
    const imageDataUrls: string[] = []

    for (let i = 0; i < inputImages.length; i++) {
      const assetUri = inputImages[i]
      const buffer: Buffer = await resolveAsset(assetUri, { asBuffer: true }) as Buffer
      const format = detectImageFormat(buffer)
      const base64 = buffer.toString('base64')
      const dataUrl = `data:image/${format};base64,${base64}`
      imageDataUrls.push(dataUrl)

      context.sendStatus({
        type: 'running',
        message: `Processed image ${i + 1}/${inputImages.length}`,
        progress: { step: Math.min(10 + (i + 1) * 5, 40), total: 100 }
      })
    }

    const requestPayload: any = {
      prompt,
      image_urls: imageDataUrls,
      image_size: {
        width: imageWidth,
        height: imageHeight
      },
      num_images: numImages,
      max_images: Math.max(numImages, maxImages),
      enable_safety_checker: enableSafetyChecker,
      sync_mode: syncMode
    }

    if (Number.isInteger(seedValue) && seedValue >= 0) {
      requestPayload.seed = seedValue
    }

    let stepCount = 0
    const result = await fal.subscribe('fal-ai/bytedance/seedream/v4/edit', {
      input: requestPayload,
      logs: true,
      onQueueUpdate: (status: QueueStatus) => {
        if (status.status === 'IN_QUEUE') {
          context.sendStatus({
            type: 'running',
            message: 'Waiting in queue...',
            progress: { step: 40, total: 100 }
          })
        } else if (status.status === 'IN_PROGRESS') {
          stepCount++
          const progress = Math.min(45 + stepCount * 3, 90)
          if ('logs' in status && status.logs?.length) {
            const lastLog = status.logs[status.logs.length - 1]
            context.sendStatus({
              type: 'running',
              message: lastLog?.message || `Processing step ${stepCount}...`,
              progress: { step: progress, total: 100 }
            })
          } else {
            context.sendStatus({
              type: 'running',
              message: `Processing step ${stepCount}...`,
              progress: { step: progress, total: 100 }
            })
          }
        } else if (status.status === 'COMPLETED') {
          context.sendStatus({
            type: 'running',
            message: 'Finalizing...',
            progress: { step: 100, total: 100 }
          })
        }
      }
    }) as SeedreamEditResponse

    if (!result.data?.images?.length) {
      throw new Error('No images were generated')
    }

    const uploadedImageUris: string[] = []

    for (let i = 0; i < result.data.images.length; i++) {
      const imageUrl = result.data.images[i].url
      const response = await fetch(imageUrl)
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const uploadResult = await uploadAsset(buffer, { type: 'image' })

      if (!uploadResult.uri) {
        throw new Error('Failed to upload generated image')
      }

      uploadedImageUris.push(uploadResult.uri)
    }

    return {
      images: uploadedImageUris,
      seed: typeof result.data.seed === 'number' ? [result.data.seed] : []
    }
  } catch (error: any) {
    context.sendStatus({ type: 'error', message: error.message || 'Failed to edit images' })
    throw error
  }
}

export default seedreamEditNode
