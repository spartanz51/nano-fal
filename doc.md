About
Kling 2.1 Master Image to Video API.

1. Calling the API
#
Install the client
#
The client provides a convenient way to interact with the model API.

npmyarnpnpmbun

npm install --save @fal-ai/client
Migrate to @fal-ai/client
The @fal-ai/serverless-client package has been deprecated in favor of @fal-ai/client. Please check the migration guide for more information.

Setup your API Key
#
Set FAL_KEY as an environment variable in your runtime.


export FAL_KEY="YOUR_API_KEY"
Submit a request
#
The client API handles the API submit protocol. It will handle the request status updates and return the result when the request is completed.


import { fal } from "@fal-ai/client";

const result = await fal.subscribe("fal-ai/kling-video/v2.1/master/image-to-video", {
  input: {
    prompt: "Sunlight dapples through budding branches, illuminating a vibrant tapestry of greens and browns as a pair of robins meticulously weave twigs and mud into a cradle of life, their tiny forms a whirlwind of activity against a backdrop of blossoming spring.  The scene unfolds with a gentle, observational pace, allowing the viewer to fully appreciate the intricate details of nest construction, the soft textures of downy feathers contrasted against the rough bark of the branches, the delicate balance of strength and fragility in their creation.",
    image_url: "https://v3.fal.media/files/zebra/9Nrm22YyLojSTPJbZYNhh_image.webp"
  },
  logs: true,
  onQueueUpdate: (update) => {
    if (update.status === "IN_PROGRESS") {
      update.logs.map((log) => log.message).forEach(console.log);
    }
  },
});
console.log(result.data);
console.log(result.requestId);
2. Authentication
#
The API uses an API Key for authentication. It is recommended you set the FAL_KEY environment variable in your runtime when possible.

API Key
#
In case your app is running in an environment where you cannot set environment variables, you can set the API Key manually as a client configuration.

import { fal } from "@fal-ai/client";

fal.config({
  credentials: "YOUR_FAL_KEY"
});
Protect your API Key
When running code on the client-side (e.g. in a browser, mobile app or GUI applications), make sure to not expose your FAL_KEY. Instead, use a server-side proxy to make requests to the API. For more information, check out our server-side integration guide.

3. Queue
#
Long-running requests
For long-running requests, such as training jobs or models with slower inference times, it is recommended to check the Queue status and rely on Webhooks instead of blocking while waiting for the result.

Submit a request
#
The client API provides a convenient way to submit requests to the model.


import { fal } from "@fal-ai/client";

const { request_id } = await fal.queue.submit("fal-ai/kling-video/v2.1/master/image-to-video", {
  input: {
    prompt: "Sunlight dapples through budding branches, illuminating a vibrant tapestry of greens and browns as a pair of robins meticulously weave twigs and mud into a cradle of life, their tiny forms a whirlwind of activity against a backdrop of blossoming spring.  The scene unfolds with a gentle, observational pace, allowing the viewer to fully appreciate the intricate details of nest construction, the soft textures of downy feathers contrasted against the rough bark of the branches, the delicate balance of strength and fragility in their creation.",
    image_url: "https://v3.fal.media/files/zebra/9Nrm22YyLojSTPJbZYNhh_image.webp"
  },
  webhookUrl: "https://optional.webhook.url/for/results",
});
Fetch request status
#
You can fetch the status of a request to check if it is completed or still in progress.


import { fal } from "@fal-ai/client";

const status = await fal.queue.status("fal-ai/kling-video/v2.1/master/image-to-video", {
  requestId: "764cabcf-b745-4b3e-ae38-1200304cf45b",
  logs: true,
});
Get the result
#
Once the request is completed, you can fetch the result. See the Output Schema for the expected result format.


import { fal } from "@fal-ai/client";

const result = await fal.queue.result("fal-ai/kling-video/v2.1/master/image-to-video", {
  requestId: "764cabcf-b745-4b3e-ae38-1200304cf45b"
});
console.log(result.data);
console.log(result.requestId);
4. Files
#
Some attributes in the API accept file URLs as input. Whenever that's the case you can pass your own URL or a Base64 data URI.

Data URI (base64)
#
You can pass a Base64 data URI as a file input. The API will handle the file decoding for you. Keep in mind that for large files, this alternative although convenient can impact the request performance.

Hosted files (URL)
#
You can also pass your own URLs as long as they are publicly accessible. Be aware that some hosts might block cross-site requests, rate-limit, or consider the request as a bot.

Uploading files
#
We provide a convenient file storage that allows you to upload files and use them in your requests. You can upload files using the client API and use the returned URL in your requests.


import { fal } from "@fal-ai/client";

const file = new File(["Hello, World!"], "hello.txt", { type: "text/plain" });
const url = await fal.storage.upload(file);
Auto uploads
The client will auto-upload the file for you if you pass a binary object (e.g. File, Data).

Read more about file handling in our file upload guide.

5. Schema
#
Input
#
prompt string
image_url string
URL of the image to be used for the video

duration DurationEnum
The duration of the generated video in seconds Default value: "5"

Possible enum values: 5, 10

negative_prompt string
Default value: "blur, distort, and low quality"

cfg_scale float
The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt. Default value: 0.5


{
  "prompt": "Sunlight dapples through budding branches, illuminating a vibrant tapestry of greens and browns as a pair of robins meticulously weave twigs and mud into a cradle of life, their tiny forms a whirlwind of activity against a backdrop of blossoming spring.  The scene unfolds with a gentle, observational pace, allowing the viewer to fully appreciate the intricate details of nest construction, the soft textures of downy feathers contrasted against the rough bark of the branches, the delicate balance of strength and fragility in their creation.",
  "image_url": "https://v3.fal.media/files/zebra/9Nrm22YyLojSTPJbZYNhh_image.webp",
  "duration": "5",
  "negative_prompt": "blur, distort, and low quality",
  "cfg_scale": 0.5
}
Output
#
video File
The generated video


{
  "video": {
    "url": "https://v3.fal.media/files/rabbit/YuUWKFq508zzWIiQ0i2vt_output.mp4"
  }
}
Other types
#
TextToVideoV21MasterRequest
#
prompt string
duration DurationEnum
The duration of the generated video in seconds Default value: "5"

Possible enum values: 5, 10

aspect_ratio AspectRatioEnum
The aspect ratio of the generated video frame Default value: "16:9"

Possible enum values: 16:9, 9:16, 1:1

negative_prompt string
Default value: "blur, distort, and low quality"

cfg_scale float
The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt. Default value: 0.5

V1TextToVideoRequest
#
prompt string
duration DurationEnum
The duration of the generated video in seconds Default value: "5"

Possible enum values: 5, 10

aspect_ratio AspectRatioEnum
The aspect ratio of the generated video frame Default value: "16:9"

Possible enum values: 16:9, 9:16, 1:1

negative_prompt string
Default value: "blur, distort, and low quality"

cfg_scale float
The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt. Default value: 0.5

camera_control CameraControlEnum
Camera control parameters

Possible enum values: down_back, forward_up, right_turn_forward, left_turn_forward

advanced_camera_control CameraControl
Advanced Camera control parameters

File
#
url string
The URL where the file can be downloaded from.

content_type string
The mime type of the file.

file_name string
The name of the file. It will be auto-generated if not provided.

file_size integer
The size of the file in bytes.

file_data string
File data

ImageToVideoRequest
#
prompt string
image_url string
duration DurationEnum
The duration of the generated video in seconds Default value: "5"

Possible enum values: 5, 10

negative_prompt string
Default value: "blur, distort, and low quality"

cfg_scale float
The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt. Default value: 0.5

ProImageToVideoRequest
#
prompt string
image_url string
duration DurationEnum
The duration of the generated video in seconds Default value: "5"

Possible enum values: 5, 10

aspect_ratio AspectRatioEnum
The aspect ratio of the generated video frame Default value: "16:9"

Possible enum values: 16:9, 9:16, 1:1

tail_image_url string
URL of the image to be used for the end of the video

negative_prompt string
Default value: "blur, distort, and low quality"

cfg_scale float
The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt. Default value: 0.5

LipsyncA2VRequest
#
video_url string
The URL of the video to generate the lip sync for.

audio_url string
The URL of the audio to generate the lip sync for.

CameraControl
#
movement_type MovementTypeEnum
The type of camera movement

Possible enum values: horizontal, vertical, pan, tilt, roll, zoom

movement_value integer
The value of the camera movement

ImageToVideoV21StandardRequest
#
prompt string
image_url string
URL of the image to be used for the video

duration DurationEnum
The duration of the generated video in seconds Default value: "5"

Possible enum values: 5, 10

negative_prompt string
Default value: "blur, distort, and low quality"

cfg_scale float
The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt. Default value: 0.5

ImageToVideoV21ProRequest
#
prompt string
image_url string
URL of the image to be used for the video

duration DurationEnum
The duration of the generated video in seconds Default value: "5"

Possible enum values: 5, 10

negative_prompt string
Default value: "blur, distort, and low quality"

cfg_scale float
The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt. Default value: 0.5

LipsyncT2VRequest
#
video_url string
The URL of the video to generate the lip sync for.

text string
Text content for lip-sync video generation. Max 120 characters.

voice_id VoiceIdEnum
Voice ID to use for speech synthesis

Possible enum values: genshin_vindi2, zhinen_xuesheng, AOT, ai_shatang, genshin_klee2, genshin_kirara, ai_kaiya, oversea_male1, ai_chenjiahao_712, girlfriend_4_speech02, chat1_female_new-3, chat_0407_5-1, cartoon-boy-07, uk_boy1, cartoon-girl-01, PeppaPig_platform, ai_huangzhong_712, ai_huangyaoshi_712, ai_laoguowang_712, chengshu_jiejie, you_pingjing, calm_story1, uk_man2, laopopo_speech02, heainainai_speech02, reader_en_m-v1, commercial_lady_en_f-v1, tiyuxi_xuedi, tiexin_nanyou, girlfriend_1_speech02, girlfriend_2_speech02, zhuxi_speech02, uk_oldman3, dongbeilaotie_speech02, chongqingxiaohuo_speech02, chuanmeizi_speech02, chaoshandashu_speech02, ai_taiwan_man2_speech02, xianzhanggui_speech02, tianjinjiejie_speech02, diyinnansang_DB_CN_M_04-v2, yizhipiannan-v1, guanxiaofang-v2, tianmeixuemei-v1, daopianyansang-v1, mengwa-v1

voice_language VoiceLanguageEnum
The voice language corresponding to the Voice ID Default value: "en"

Possible enum values: zh, en

voice_speed float
Speech rate for Text to Video generation Default value: 1

V1ImageToVideoRequest
#
prompt string
The prompt for the video

image_url string
URL of the image to be used for the video

duration DurationEnum
The duration of the generated video in seconds Default value: "5"

Possible enum values: 5, 10

negative_prompt string
Default value: "blur, distort, and low quality"

cfg_scale float
The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt. Default value: 0.5

tail_image_url string
URL of the image to be used for the end of the video

static_mask_url string
URL of the image for Static Brush Application Area (Mask image created by users using the motion brush)

dynamic_masks list<DynamicMask>
List of dynamic masks

DynamicMask
#
mask_url string
URL of the image for Dynamic Brush Application Area (Mask image created by users using the motion brush)

trajectories list<Trajectory>
List of trajectories

TextToVideoRequest
#
prompt string
duration DurationEnum
The duration of the generated video in seconds Default value: "5"

Possible enum values: 5, 10

aspect_ratio AspectRatioEnum
The aspect ratio of the generated video frame Default value: "16:9"

Possible enum values: 16:9, 9:16, 1:1

negative_prompt string
Default value: "blur, distort, and low quality"

cfg_scale float
The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt. Default value: 0.5

VideoEffectsRequest
#
input_image_urls list<string>
URL of images to be used for hug, kiss or heart_gesture video.

effect_scene EffectSceneEnum
The effect scene to use for the video generation

Possible enum values: hug, kiss, heart_gesture, squish, expansion, fuzzyfuzzy, bloombloom, dizzydizzy

duration DurationEnum
The duration of the generated video in seconds Default value: "5"

Possible enum values: 5, 10

MultiImageToVideoRequest
#
prompt string
input_image_urls list<string>
List of image URLs to use for video generation. Supports up to 4 images.

duration DurationEnum
The duration of the generated video in seconds Default value: "5"

Possible enum values: 5, 10

aspect_ratio AspectRatioEnum
The aspect ratio of the generated video frame Default value: "16:9"

Possible enum values: 16:9, 9:16, 1:1

negative_prompt string
Default value: "blur, distort, and low quality"

TextToVideoV2MasterRequest
#
prompt string
duration DurationEnum
The duration of the generated video in seconds Default value: "5"

Possible enum values: 5, 10

aspect_ratio AspectRatioEnum
The aspect ratio of the generated video frame Default value: "16:9"

Possible enum values: 16:9, 9:16, 1:1

negative_prompt string
Default value: "blur, distort, and low quality"

cfg_scale float
The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt. Default value: 0.5

Trajectory
#
x integer
X coordinate of the motion trajectory

y integer
Y coordinate of the motion trajectory

ImageToVideoV2MasterRequest
#
prompt string
image_url string
URL of the image to be used for the video

duration DurationEnum
The duration of the generated video in seconds Default value: "5"

Possible enum values: 5, 10

negative_prompt string
Default value: "blur, distort, and low quality"

cfg_scale float
The CFG (Classifier Free Guidance) scale is a measure of how close you want the model to stick to your prompt. Default value: 0.5

Related Models