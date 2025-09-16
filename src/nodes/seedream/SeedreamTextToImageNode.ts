import { NanoSDK, NodeDefinition, NodeInstance, uploadAsset } from '@nanograph/sdk'
import { QueueStatus } from '@fal-ai/client'
import { configureFalClient, fal } from '../../utils/fal-client.js'
import { getParameterValue } from '../../utils/parameter-utils.js'

interface SeedreamTextToImageResponse {
  data: {
    images: Array<{
      url: string
    }>
    seed?: number
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const nodeDef: NodeDefinition = {
  uid: 'fal-seedream-text-to-image',
  name: 'Seedream v4 Text to Image',
  category: 'Image Generation',
  version: '1.0.0',
  type: 'server',
  description: 'Generates images from text prompts using the Fal.ai Bytedance Seedream v4 text-to-image model',
  inputs: [
    {
      name: 'prompt',
      type: 'string',
      description: 'Text prompt describing the image to generate'
    }
  ],
  outputs: [
    {
      name: 'images',
      type: 'asset:image',
      description: 'Generated images as asset URIs'
    },
    {
      name: 'seed',
      type: 'number',
      description: 'Seed used for generation when provided by the API'
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
      description: 'Maximum images returned per generation',
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

const seedreamTextToImageNode: NodeInstance = NanoSDK.registerNode(nodeDef)

seedreamTextToImageNode.execute = async ({ inputs, parameters, context }) => {
  configureFalClient()

  const prompt = inputs.prompt?.[0] as string

  if (!prompt) {
    context.sendStatus({ type: 'error', message: 'Prompt is required' })
    throw new Error('Prompt is required')
  }

  const imageWidth = clamp(Number(getParameterValue(parameters, 'image_width', 1280)), 1024, 4096)
  const imageHeight = clamp(Number(getParameterValue(parameters, 'image_height', 1280)), 1024, 4096)
  const numImages = clamp(Number(getParameterValue(parameters, 'num_images', 1)), 1, 6)
  const maxImages = clamp(Number(getParameterValue(parameters, 'max_images', 1)), 1, 6)
  const seedValue = Number(getParameterValue(parameters, 'seed', -1))
  const enableSafetyChecker = Boolean(getParameterValue(parameters, 'enable_safety_checker', true))
  const syncMode = Boolean(getParameterValue(parameters, 'sync_mode', false))

  context.sendStatus({ type: 'running', message: 'Generating images...' })

  try {
    const requestPayload: any = {
      prompt,
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
    const result = await fal.subscribe('fal-ai/bytedance/seedream/v4/text-to-image', {
      input: requestPayload,
      logs: true,
      onQueueUpdate: (status: QueueStatus) => {
        if (status.status === 'IN_QUEUE') {
          context.sendStatus({
            type: 'running',
            message: 'Waiting in queue...',
            progress: { step: 10, total: 100 }
          })
        } else if (status.status === 'IN_PROGRESS') {
          stepCount++
          const progress = Math.min(20 + stepCount * 3, 90)
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
    }) as SeedreamTextToImageResponse

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
    context.sendStatus({ type: 'error', message: error.message || 'Failed to generate images' })
    throw error
  }
}

export default seedreamTextToImageNode
