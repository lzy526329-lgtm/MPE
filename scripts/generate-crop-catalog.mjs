#!/usr/bin/env node
/**
 * 扫描 public/farm/<作物名>/ 下的 shopImg-cutout.png 与 1~3-cutout.png，
 * 合并已有 cropCatalog.json 中的数值，重新生成配置。
 *
 * 用法: node scripts/generate-crop-catalog.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const farmPublic = path.join(root, 'public/farm')
const catalogPath = path.join(root, 'electron/farm/cropCatalog.json')

/** 文件夹名（中文）→ 配置 id */
const FOLDER_TO_ID = {
  小麦: 'wheat',
  香蕉: 'banana',
  苹果: 'apple',
  玉米: 'corn',
  榴莲: 'durian',
}

const DEFAULT_ECONOMY = {
  wheat: {
    name: '小麦',
    growMinutes: 20,
    waterIntervalMinutes: 5,
    seedPrice: 5,
    producePrice: 4,
    yieldMin: 2,
    yieldMax: 3,
    starterSeeds: 5,
    dailySeeds: 3,
  },
  banana: {
    name: '香蕉',
    growMinutes: 15,
    waterIntervalMinutes: 4,
    seedPrice: 5,
    producePrice: 4,
    yieldMin: 2,
    yieldMax: 3,
    starterSeeds: 0,
    dailySeeds: 0,
  },
  apple: {
    name: '苹果',
    growMinutes: 25,
    waterIntervalMinutes: 6,
    seedPrice: 8,
    producePrice: 6,
    yieldMin: 2,
    yieldMax: 3,
    starterSeeds: 0,
    dailySeeds: 0,
  },
  corn: {
    name: '玉米',
    growMinutes: 40,
    waterIntervalMinutes: 8,
    seedPrice: 12,
    producePrice: 10,
    yieldMin: 2,
    yieldMax: 4,
    starterSeeds: 0,
    dailySeeds: 0,
  },
  durian: {
    name: '榴莲',
    growMinutes: 60,
    waterIntervalMinutes: 10,
    seedPrice: 20,
    producePrice: 16,
    yieldMin: 2,
    yieldMax: 4,
    starterSeeds: 0,
    dailySeeds: 0,
  },
}

function hasCropAssets(dir, folderName) {
  const base = path.join(dir, folderName)
  const required = [
    'shopImg-cutout.png',
    '1-cutout.png',
    '2-cutout.png',
    '3-cutout.png',
  ]
  return required.every((file) => fs.existsSync(path.join(base, file)))
}

function loadExistingCatalog() {
  if (!fs.existsSync(catalogPath)) return { version: 1, crops: {} }
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
}

function buildEntry(folderName, id, existing) {
  const defaults = DEFAULT_ECONOMY[id] ?? {
    name: folderName,
    growMinutes: 20,
    waterIntervalMinutes: 5,
    seedPrice: 5,
    producePrice: 4,
    yieldMin: 2,
    yieldMax: 3,
    starterSeeds: 0,
    dailySeeds: 0,
  }
  const prev = existing?.crops?.[id] ?? {}
  const name = prev.name ?? defaults.name ?? folderName
  return {
    name,
    seedName: prev.seedName ?? `${name}种子`,
    seedPrice: prev.seedPrice ?? defaults.seedPrice,
    produceName: prev.produceName ?? name,
    producePrice: prev.producePrice ?? defaults.producePrice,
    growMinutes: prev.growMinutes ?? defaults.growMinutes,
    waterIntervalMinutes: prev.waterIntervalMinutes ?? defaults.waterIntervalMinutes,
    yieldMin: prev.yieldMin ?? defaults.yieldMin,
    yieldMax: prev.yieldMax ?? defaults.yieldMax,
    starterSeeds: prev.starterSeeds ?? defaults.starterSeeds,
    dailySeeds: prev.dailySeeds ?? defaults.dailySeeds,
    shopImg: `${folderName}/shopImg-cutout.png`,
    sprites: [
      `${folderName}/1-cutout.png`,
      `${folderName}/2-cutout.png`,
      `${folderName}/3-cutout.png`,
    ],
  }
}

function main() {
  const existing = loadExistingCatalog()
  const crops = {}

  const folders = fs
    .readdirSync(farmPublic, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => hasCropAssets(farmPublic, name))
    .sort((a, b) => {
      const order = Object.keys(FOLDER_TO_ID)
      return order.indexOf(a) - order.indexOf(b)
    })

  for (const folderName of folders) {
    const id = FOLDER_TO_ID[folderName] ?? folderName
    crops[id] = buildEntry(folderName, id, existing)
  }

  if (Object.keys(crops).length === 0) {
    console.error('未在 public/farm 下找到完整作物素材目录')
    process.exit(1)
  }

  const next = {
    version: existing.version ?? 1,
    crops,
  }

  fs.writeFileSync(catalogPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  console.log(`已生成 ${catalogPath}`)
  console.log(`共 ${Object.keys(crops).length} 种作物: ${Object.keys(crops).join(', ')}`)
}

main()
