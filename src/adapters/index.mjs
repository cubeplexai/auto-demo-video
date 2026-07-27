const adapters = {
  'generic-web': () => import('./generic-web.mjs'),
  cubeplex: () => import('./cubeplex.mjs'),
}

export async function loadAdapter(name) {
  const key = name || 'generic-web'
  const loader = adapters[key]
  if (!loader) {
    throw new Error(
      `Unknown adapter "${key}". Available: ${Object.keys(adapters).join(', ')}`,
    )
  }
  const mod = await loader()
  return mod.default || mod
}
