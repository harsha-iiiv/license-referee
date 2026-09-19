import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {contextPlugin} from '@sanity/context/studio'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'License Referee',

  projectId: '9qqt8rm4',
  dataset: 'production',

  plugins: [structureTool(), visionTool(), contextPlugin()],

  schema: {
    types: schemaTypes,
  },
})
