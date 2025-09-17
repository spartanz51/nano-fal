import { NanoSDK, NodeDefinition, NodeInstance } from '@nanograph/sdk'
import { QueueStatus } from '@fal-ai/client'
import { configureFalClient, fal } from '../../utils/fal-client.js'
import { createProgressStrategy } from '../../utils/progress-strategy.js'
import { loadImageAssetAsDataUrl, uploadFalGeneratedImage, FalGeneratedImage } from './shared.js'

interface MoondreamPointObjectDetectionResponse {
  data?: {
    image?: FalGeneratedImage
    objects?: any[]
  }
  image?: FalGeneratedImage
  objects?: any[]
}

const nodeDefinition: NodeDefinition = {
  uid: 'fal-moondream2-point-object-detection',
  name: 'Moondream 2 Point Object Detection',
  category: 'Image Analysis',
  version: '1.0.0',
  type: 'server',
  description: 'Detects specific objects and highlights their locations using Fal.ai Moondream 2 point object detection endpoint',
  inputs: [
    {
      name: 'image',
      type: 'asset:image',
      description: 'Input image containing the object'
    },
    {
      name: 'object',
      type: 'string',
      description: 'Object name(s) to detect (comma-separated if multiple)'
    }
  ],
  outputs: [
    {
      name: 'image',
      type: 'asset:image',
      description: 'Image annotated with detected object locations'
    },
    {
      name: 'objects',
      type: 'string',
      description: 'JSON array of detected objects with metadata'
    }
  ],
  parameters: []
}

const moondreamPointObjectDetectionNode: NodeInstance = NanoSDK.registerNode(nodeDefinition)

moondreamPointObjectDetectionNode.execute = async ({ inputs, context }) => {
  configureFalClient()

  const image = inputs.image?.[0] as string
  const objectInputs = (inputs.object ?? []) as string[]
  const targetObject = objectInputs
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .join(', ')

  if (!image) {
    const message = 'Input image is required'
    context.sendStatus({ type: 'error', message })
    throw new Error(message)
  }

  if (!targetObject) {
    const message = 'Object to detect is required'
    context.sendStatus({ type: 'error', message })
    throw new Error(message)
  }

  context.sendStatus({ type: 'running', message: 'Preparing image for point detection...' })

  try {
    const imageDataUrl = await loadImageAssetAsDataUrl(image)

    let stepCount = 0
    const strategy = createProgressStrategy({
      expectedMs: 20000,
      inQueueMessage: 'Waiting in queue...',
      finalizingMessage: 'Finalizing detections...',
      defaultInProgressMessage: (n) => `Processing step ${n}...`
    })

    const result = await fal.subscribe('fal-ai/moondream2/point-object-detection', {
      input: {
        image_url: imageDataUrl,
        object: targetObject
      },
      logs: true,
      onQueueUpdate: (status: QueueStatus) => {
        if (status.status === 'IN_QUEUE') {
          const r = strategy.onQueue()
          context.sendStatus({ type: 'running', message: r.message, progress: r.progress })
        } else if (status.status === 'IN_PROGRESS') {
          stepCount++
          const r = strategy.onProgress(status, stepCount)
          context.sendStatus({ type: 'running', message: r.message, progress: r.progress })
        } else if (status.status === 'COMPLETED') {
          const r = strategy.onCompleted()
          context.sendStatus({ type: 'running', message: r.message, progress: r.progress })
        }
      }
    }) as MoondreamPointObjectDetectionResponse

    const imagePayload = result.data?.image ?? result.image
    const objects = result.data?.objects ?? result.objects ?? []

    if (!imagePayload) {
      throw new Error('Moondream 2 did not return an annotated image')
    }

    const uploadedImageUri = await uploadFalGeneratedImage(imagePayload, 'moondream-point-detection.png')
    const objectsJson = objects && objects.length ? JSON.stringify(objects) : undefined

    return {
      image: [uploadedImageUri],
      objects: objectsJson ? [objectsJson] : []
    }
  } catch (error: any) {
    const message = error?.message ?? 'Failed to run point object detection'
    context.sendStatus({ type: 'error', message })
    throw error
  }
}

export default moondreamPointObjectDetectionNode
