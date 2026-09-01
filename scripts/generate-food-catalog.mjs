#!/usr/bin/env node
/**
 * 扫描 public/foods/*.png，合并已有 foodCatalog.json 数值后重新生成配置。
 *
 * 用法: node scripts/generate-food-catalog.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const foodsPublic = path.join(root, 'public/foods')
const catalogPath = path.join(root, 'electron/game/foodCatalog.json')

/** 文件名（不含扩展名）→ 配置 id */
const NAME_TO_ID = {
  饼干: 'cookie',
  巧克力: 'chocolate',
  奶油面包: 'creamBread',
  草莓牛奶: 'strawberryMilk',
}

const DEFAULT_ECONOMY = {
  cookie: { name: '饼干', price: 3, satiety: 12 },
  chocolate: { name: '巧克力', price: 5, satiety: 18 },
  creamBread: { name: '奶油面包', price: 8, satiety: 28 },
  strawberryMilk: { name: '草莓牛奶', price: 12, satiety: 35 },
}

function loadExistingCatalog() {
  if (!fs.existsSync(catalogPath)) return { version: 1, foods: {} }
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
}

function buildEntry(fileName, id, existing) {
  const defaults = DEFAULT_ECONOMY[id] ?? { name: fileName, price: 5, satiety: 20 }
  const prev = existing?.foods?.[id] ?? {}
  const name = prev.name ?? defaults.name ?? fileName
  return {
    name,
    price: prev.price ?? defaults.price,
    satiety: prev.satiety ?? defaults.satiety,
    image: fileName,
  }
}

function main() {
  const existing = loadExistingCatalog()
  const foods = {}

  const files = fs
    .readdirSync(foodsPublic)
    .filter((file) => file.endsWith('.png'))
    .sort()

  for (const file of files) {
    const baseName = file.replace(/\.png$/i, '')
    const id = NAME_TO_ID[baseName] ?? baseName
    foods[id] = buildEntry(file, id, existing)
  }

  if (Object.keys(foods).length === 0) {
    console.error('未在 public/foods 下找到 PNG 素材')
    process.exit(1)
  }

  const next = { version: existing.version ?? 1, foods }
  fs.writeFileSync(catalogPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  console.log(`已生成 ${catalogPath}`)
  console.log(`共 ${Object.keys(foods).length} 种食物: ${Object.keys(foods).join(', ')}`)
}

main()
