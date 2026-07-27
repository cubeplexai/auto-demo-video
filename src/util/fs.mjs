import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { dirname, resolve, isAbsolute } from 'node:path'
import { parse as parseYaml } from 'yaml'

export function ensureDir(p) {
  mkdirSync(p, { recursive: true })
  return p
}

export function readText(p) {
  return readFileSync(p, 'utf8')
}

export function writeText(p, s) {
  ensureDir(dirname(p))
  writeFileSync(p, s)
}

export function writeJson(p, obj) {
  writeText(p, JSON.stringify(obj, null, 2) + '\n')
}

export function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}

export function readYamlOrJson(p) {
  const raw = readFileSync(p, 'utf8')
  if (p.endsWith('.yaml') || p.endsWith('.yml')) return parseYaml(raw)
  return JSON.parse(raw)
}

export function abs(base, p) {
  if (!p) return p
  return isAbsolute(p) ? p : resolve(base, p)
}

export function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

export {
  existsSync,
  copyFileSync,
  readdirSync,
  statSync,
  readFileSync,
  resolve,
  dirname,
}
