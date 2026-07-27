/**
 * Example **external** adapter — copy into *your* product repo.
 * Do not add product-specific adapters to auto-demo-video itself.
 *
 * scenario.yaml:
 *   adapter: ./adapters/my-app.mjs
 *   adapterOptions:
 *     homePath: /app
 *     pickLabel: Production
 *
 * export default { ... }
 */

/** @type {import('../src/adapters/generic-web.mjs').default} */
export default {
  loginPath: '/login',

  isAuthed: (url) => !/login|sign-?in/i.test(url),

  /**
   * @param {import('playwright').Page} page
   * @param {{ baseUrl: string, adapterOptions?: Record<string, unknown> }} cfg
   */
  async afterLogin(page, cfg) {
    const opts = cfg.adapterOptions || {}
    const home = opts.homePath || '/app'
    await page.goto(`${cfg.baseUrl}${home}`, { waitUntil: 'domcontentloaded' })

    // Example: pick a labeled workspace/project from adapterOptions — your logic.
    if (opts.pickLabel) {
      // await page.getByText(String(opts.pickLabel)).click()
    }
  },

  /** Chat composer placeholders for send_message steps */
  composerPlaceholders: ['Message', 'Type a message'],

  custom: {
    // scenario step: { kind: custom, custom: "myHook" }
    // myHook: async (page, step, ctx) => { ... }
  },
}
