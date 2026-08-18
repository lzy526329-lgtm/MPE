export interface DiskPartition {
  mount: string
  total: number
  used: number
  free: number
}

export interface SystemInfo {
  platform: string
  osVersion: string
  hostname: string
  arch: string
  cpuModel: string
  cpuCores: number
  totalMem: number
  freeMem: number
  uptime: number
  gpuModel: string
  diskInfo: DiskPartition[]
}
