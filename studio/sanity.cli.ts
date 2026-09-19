import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: '9qqt8rm4',
    dataset: 'production',
  },
  studioHost: 'license-referee',
  deployment: {
    appId: 'zkzoqdoacrlokjzlrxzugs78',
    autoUpdates: true,
  },
})
