import {defineField, defineType} from 'sanity'
import {BookIcon} from '@sanity/icons/Book'

/**
 * An authority whose statements about licenses we cite: FSF, OSI, ASF, SPDX,
 * Mozilla, Eclipse, choosealicense.com. `authorityRank` encodes the standing
 * decision for conflicts (lower = more authoritative for its `scope`).
 */
export const source = defineType({
  name: 'source',
  title: 'Source (authority)',
  type: 'document',
  icon: BookIcon,
  fields: [
    defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
    defineField({
      name: 'slug',
      type: 'slug',
      options: {source: 'name'},
      validation: (r) => r.required(),
    }),
    defineField({name: 'url', type: 'url', validation: (r) => r.required()}),
    defineField({
      name: 'scope',
      title: 'Authoritative for',
      description: 'What this source is the last word on (used to resolve conflicts).',
      type: 'array',
      of: [{type: 'string'}],
      options: {
        list: [
          {title: 'GPL-family compatibility', value: 'gpl-compatibility'},
          {title: '"Open source" approval', value: 'osi-approval'},
          {title: '"Free software" status', value: 'fsf-libre'},
          {title: 'License identifiers', value: 'identifiers'},
          {title: 'Its own license (steward)', value: 'steward'},
          {title: 'Plain-language summaries', value: 'summary'},
        ],
      },
    }),
    defineField({
      name: 'authorityRank',
      type: 'number',
      description: '1 = primary authority within its scope, 5 = secondary commentary.',
      validation: (r) => r.required().min(1).max(5).integer(),
    }),
    defineField({
      name: 'trustNote',
      type: 'text',
      rows: 3,
      description: 'When to prefer this source over others, and known limits.',
    }),
  ],
  preview: {select: {title: 'name', subtitle: 'url'}},
})
