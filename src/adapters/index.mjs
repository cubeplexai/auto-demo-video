/**
 * Adapters are product-specific hooks (login aftercare, workspace pickers, custom steps).
 *
 * Built-in: only `generic-web`.
 * Everything else must be an external module path or package:
 *   adapter: "./adapters/my-app.mjs"
 *   adapter: "@myorg/adv-adapter-myapp"
 *   --adapter /abs/path/to/adapter.mjs
 */
import { pathToFileURL } from 'node:url'
import { resolve, isAbsolute } from 'node:path'
import { existsSync } from 'node:fs'

export async function loadAdapter(nameOrPath, opts = {}) {
  const cwd = opts.cwd || process.cwd()
  const id = (nameOrPath || 'generic-web').trim()

  if (id === 'generic-web' || id === 'default' || id === '') {
    const mod = await import('./generic-web.mjs')
    return mod.default || mod
  }

  // Relative / absolute path to a local adapter module (outside this package)
  if (
    id.startsWith('.') ||
    id.startsWith('/') ||
    isAbsolute(id) ||
    id.endsWith('.mjs') ||
    id.endsWith('.js') ||
    id.endsWith('.cjs') ||
    id.endsWith('.ts')
  ) {
    const full = isAbsolute(id) ? id : resolve(cwd, id)
    if (!existsSync(full)) {
      throw new Error(
        `Adapter file not found: ${full}\n` +
          `Point scenario.adapter or --adapter at a module that exports default { afterLogin?, custom?, ... }.`,
      )
    }
    const mod = await import(pathToFileURL(full).href)
    return mod.default || mod
  }

  // npm package name
  try {
    const mod = await import(id)
    return mod.default || mod
  } catch (err) {
    throw new Error(
      `Failed to load adapter "${id}". Use "generic-web" or an external path/package.\n${err}`,
    )
  }
}
