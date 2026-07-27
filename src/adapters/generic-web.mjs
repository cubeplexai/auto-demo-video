/** Minimal adapter for generic web apps. */
export default {
  loginPath: '/login',
  isAuthed: (url) => !/login|sign-?in|register/i.test(url),
  readyUrlTest: (url) => !/login|sign-?in/i.test(url) && url.includes('://'),
  afterLogin: async () => {},
  custom: {},
}
