export type WatermarkPlatform = 'douyin' | 'kuaishou'
export type WatermarkMediaType = 'video' | 'picture'

export interface WatermarkResult {
  md5: string
  message: string
  user_name: string
  user_head_img: string
  desc: string
  img_url: string
  video_url: string
  type: WatermarkMediaType
  platform: WatermarkPlatform
  referer: string
  images: string[]
}

export interface SaveWatermarkRequest {
  url: string
  referer: string
  suggestedName: string
}

export interface SaveWatermarkResult {
  outputPath: string
  size: number
}
