/**
 * Built-in minimal adapter. Product-specific behavior belongs in *external* modules
 * (your app repo), not in auto-demo-video.
 *
 * External adapter shape (export default):
 * {
 *   loginPath?: string
 *   isAuthed?: (url: string) => boolean
 *   readyUrlTest?: (url: string) => boolean
 *   afterLogin?: (page, cfg) => Promise<void>
 *   custom?: Record<string, (page, step, ctx) => Promise<void>>
 *   composerPlaceholders?: string[]
 * }
 */
export default {
  loginPath: '/login',
  isAuthed: (url) => !/login|sign-?in|register/i.test(url),
  readyUrlTest: (url) => !/login|sign-?in/i.test(url) && url.includes('://'),
  afterLogin: async () => {},
  custom: {},
  /** Optional ordered list of chat input placeholders for send_message */
  composerPlaceholders: [],
}
