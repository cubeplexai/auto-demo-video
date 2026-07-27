/**
 * CubePlex adapter: workspace selection (Team / test, never Personal).
 */
export default {
  loginPath: '/login',
  isAuthed: (url) => /\/w\//.test(url) || /\/workspaces/.test(url),
  readyUrlTest: (url) => /\/w\//.test(url),

  async afterLogin(page, cfg) {
    const script = cfg.script || {}
    const preferred = (
      script.auth?.workspaceNames?.length
        ? script.auth.workspaceNames
        : process.env.WORKSPACE_NAMES?.split(',') || ['Team Workspace', 'test', 'Team']
    ).map((s) => s.trim()).filter(Boolean)

    const forbid = new Set(
      (
        script.auth?.forbiddenWorkspaces?.length
          ? script.auth.forbiddenWorkspaces
          : process.env.FORBIDDEN_WORKSPACES?.split(',') || ['Personal']
      )
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    )

    await page.goto(`${cfg.baseUrl}/workspaces`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    const options = await page.evaluate(() => {
      const out = []
      for (const a of document.querySelectorAll('a[href^="/w/"]')) {
        const href = a.getAttribute('href') || ''
        const m = href.match(/^\/w\/([^/?#]+)$/)
        if (!m) continue
        let name = ''
        let node = a.parentElement
        for (let depth = 0; depth < 8 && node; depth++) {
          const block = (node.innerText || '')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
          const title = block.find(
            (t) =>
              t &&
              !/^open$/i.test(t) &&
              !/^role:/i.test(t) &&
              !/^workspaces$/i.test(t) &&
              t.length < 80,
          )
          if (title) {
            name = title
            break
          }
          node = node.parentElement
        }
        out.push({ name, href, wsId: m[1] })
      }
      const seen = new Set()
      return out.filter((o) => {
        if (seen.has(o.wsId)) return false
        seen.add(o.wsId)
        return true
      })
    })

    console.log(
      '[cubeplex] workspaces:',
      options.map((o) => `${o.name}→${o.wsId}`).join(', '),
    )

    let pick = null
    for (const want of preferred) {
      const w = want.toLowerCase()
      pick =
        options.find((o) => o.name.toLowerCase() === w) ||
        options.find((o) => o.name.toLowerCase().includes(w)) ||
        null
      if (pick) break
    }
    if (!pick) {
      pick = options.find((o) => !forbid.has(o.name.toLowerCase())) || null
    }
    if (!pick) {
      throw new Error(
        `No allowed workspace. Found: ${options.map((o) => o.name).join(', ') || '(none)'}`,
      )
    }
    if (forbid.has(pick.name.toLowerCase())) {
      throw new Error(`Refusing workspace "${pick.name}"`)
    }

    console.log(`[cubeplex] select "${pick.name}" (${pick.wsId})`)
    await page.goto(`${cfg.baseUrl}/w/${pick.wsId}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(1200)
  },

  custom: {},
}
