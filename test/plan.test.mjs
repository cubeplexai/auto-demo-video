import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { planFromScenario } from '../src/plan/plan.mjs'

const tmp = resolve('runs-test-plan')

test('planFromScenario writes script.json', () => {
  mkdirSync(tmp, { recursive: true })
  const scenarioPath = resolve(tmp, 'scenario.yaml')
  writeFileSync(
    scenarioPath,
    `
id: t1
title: Test
adapter: generic-web
steps:
  - id: a
    kind: navigate
    url: /
    caption: Home
    highlight: true
  - id: b
    kind: wait_ms
    ms: 500
`,
  )

  const { scriptPath, script } = planFromScenario({
    scenarioPath,
    outDir: resolve(tmp, 'out'),
  })

  assert.ok(script.scenes.length >= 1)
  assert.equal(script.adapter, 'generic-web')
  const disk = JSON.parse(readFileSync(scriptPath, 'utf8'))
  assert.equal(disk.scenarioId, 't1')

  rmSync(tmp, { recursive: true, force: true })
})
