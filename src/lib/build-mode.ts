declare const __ROASTBOOK_DEMO_MODE__: boolean

export const DEMO_MODE =
  typeof __ROASTBOOK_DEMO_MODE__ === 'boolean' ? __ROASTBOOK_DEMO_MODE__ : false

export const DEMO_MODE_READ_ONLY_MESSAGE =
  "This is just a demo, so you can't create, edit, or delete anything here."
