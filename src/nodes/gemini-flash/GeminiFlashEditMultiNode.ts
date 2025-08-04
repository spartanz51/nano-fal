import { NanoSDK, NodeDefinition, NodeInstance, resolveAsset, uploadAsset } from '@nanograph/sdk'
import { QueueStatus } from '@fal-ai/client'
import { configureFalClient, fal } from '../../utils/fal-client.js'
import { getParameterValue } from '../../utils/parameter-utils.js'

interface GeminiFlashEditMultiResponse {
  data: {
    image: {
      url: string
      content_type: string
      file_name: string
      file_size: number
      width: number
      height: number
    }
    description: string
  }
}

const nodeDef: NodeDefinition = {
  uid: 'gemini-flash-edit-multi',
  name: 'Gemini Flash Edit Multi',
  category: 'Image Editing',
  version: '1.0.0',
  type: 'server',
  description: 'Edits multiple images using text prompts and reference images with Gemini Flash Edit Multi',
  inputs: [
    {
      name: 'prompt',
      type: 'string',
      description: 'Text prompt describing the image edits to apply'
    },
    {
      name: 'image1',
      type: 'asset:image',
      description: 'First image as asset URI',
      optional: true
    },
    {
      name: 'image2',
      type: 'asset:image',
      description: 'Second image as asset URI',
      optional: true
    },
    {
      name: 'image3',
      type: 'asset:image',
      description: 'Third image as asset URI',
      optional: true
    },
    {
      name: 'image4',
      type: 'asset:image',
      description: 'Fourth image as asset URI',
      optional: true
    }
  ],
  outputs: [
    {
      name: 'edited_image',
      type: 'asset:image',
      description: 'Edited image as asset URI'
    },
    {
      name: 'description',
      type: 'string',
      description: 'Text description or response from Gemini'
    }
  ],
  parameters: []
}

const geminiFlashEditMultiNode: NodeInstance = NanoSDK.registerNode(nodeDef)

geminiFlashEditMultiNode.execute = async ({ inputs, parameters, context }) => {
  // Configure Fal client
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

  // Collect all provided images
  const inputImages = [image1, image2, image3, image4].filter(img => img !== undefined)
  
  if (inputImages.length === 0) {
    context.sendStatus({ type: 'error', message: 'At least one input image is required' })
    throw new Error('At least one input image is required')
  }

  context.sendStatus({ type: 'running', message: 'Processing input images...' })

  try {
    // Resolve all input image assets and convert to data URLs
    const inputImageUrls: string[] = []
    
    for (let i = 0; i < inputImages.length; i++) {
      const imageBuffer: Buffer = await resolveAsset(inputImages[i], { asBuffer: true }) as Buffer
      const imageBase64 = imageBuffer.toString('base64')
      const imageDataUrl = `data:image/jpeg;base64,${imageBase64}`
      inputImageUrls.push(imageDataUrl)
      
      context.sendStatus({ 
        type: 'running', 
        message: `Processed image ${i + 1}/${inputImages.length}`,
        progress: { step: (i + 1) * 20, total: 100 }
      })
    }

    console.log(`Converted ${inputImageUrls.length} input images to data URLs`)

    let stepCount = 0
    const result = await fal.subscribe('fal-ai/gemini-flash-edit/multi', {
      input: {
        prompt,
        input_image_urls: inputImageUrls
      },
      logs: true,
      onQueueUpdate: (status: QueueStatus) => {
        if (status.status === 'IN_QUEUE') {
          context.sendStatus({ 
            type: 'running', 
            message: 'Waiting in queue...',
            progress: { step: 30, total: 100 }
          })
        } else if (status.status === 'IN_PROGRESS') {
          stepCount++
          const progress = Math.min(40 + (stepCount * 3), 80) // 40-80%
          if ('logs' in status && status.logs) {
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
    }) as GeminiFlashEditMultiResponse

    if (!result.data || !result.data.image || !result.data.image.url) {
      throw new Error('No edited image was generated')
    }

    // Log the full response for debugging
    console.log('Full API response:', JSON.stringify(result.data, null, 2))

    // Get the edited image URL, fetch it and upload as asset
    const imageUrl = result.data.image.url
    console.log('Generated edited image URL:', imageUrl)
    
    const response = await fetch(imageUrl)
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    console.log('Uploading edited image as asset...')
    const uploadResult = await uploadAsset(buffer, {
      type: 'image',
    })

    if (!uploadResult.uri) {
      throw new Error('Failed to upload generated image')
    }

    console.log('Upload successful, URI:', uploadResult.uri)
    console.log('Gemini description:', result.data.description)

    return {
      edited_image: [uploadResult.uri],
      description: [result.data.description || '']
    }
  } catch (error: any) {
    context.sendStatus({ type: 'error', message: error.message || 'Failed to edit images' })
    throw error
  }
}

export default geminiFlashEditMultiNode 