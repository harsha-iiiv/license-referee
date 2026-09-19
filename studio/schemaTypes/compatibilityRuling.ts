import {defineField, defineType} from 'sanity'
import {CheckmarkCircleIcon} from '@sanity/icons/CheckmarkCircle'

/**
 * A directional statement: code under `from` may (or may not) be combined into
 * a work distributed under `into`. Every ruling names the authority that said
 * so and quotes it, so the agent can cite rather than reason from memory.
 *
 * Direction matters: Apache-2.0 → GPL-3.0-only is "compatible" (the GPLv3 work
 * may include Apache code) while GPL-3.0-only → Apache-2.0 is "incompatible".
 */
export const compatibilityRuling = defineType({
  name: 'compatibilityRuling',
  title: 'Compatibility ruling',
  type: 'document',
  icon: CheckmarkCircleIcon,
  fields: [
    defineField({
      name: 'from',
      title: 'Dependency license (from)',
      type: 'reference',
      to: [{type: 'license'}],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'into',
      title: 'Project license (into)',
      type: 'reference',
      to: [{type: 'license'}],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'verdict',
      type: 'string',
      options: {
        list: [
          {title: 'Compatible', value: 'compatible'},
          {title: 'Compatible with conditions', value: 'conditional'},
          {title: 'Incompatible', value: 'incompatible'},
          {title: 'Disputed between authorities', value: 'disputed'},
        ],
        layout: 'radio',
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'combination',
      title: 'Kind of combination the ruling covers',
      type: 'string',
      options: {
        list: [
          {title: 'Any inclusion (source or linked)', value: 'any'},
          {title: 'Linking only (library use)', value: 'linking'},
          {title: 'Copying source into the work', value: 'source'},
          {title: 'Separate program / process', value: 'separate'},
        ],
      },
      initialValue: 'any',
    }),
    defineField({
      name: 'conditions',
      description: 'What must be true for the combination to be allowed.',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'rationale',
      type: 'text',
      rows: 4,
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'authority',
      type: 'reference',
      to: [{type: 'source'}],
      validation: (r) => r.required(),
    }),
    defineField({name: 'quote', type: 'text', rows: 3, description: 'Verbatim from the authority.'}),
    defineField({name: 'sourceUrl', type: 'url', validation: (r) => r.required()}),
    defineField({
      name: 'dissent',
      title: 'Dissenting view',
      description: 'If another authority disagrees, who and what they say (with URL).',
      type: 'object',
      fields: [
        defineField({name: 'authority', type: 'reference', to: [{type: 'source'}]}),
        defineField({name: 'claim', type: 'text', rows: 2}),
        defineField({name: 'url', type: 'url'}),
      ],
    }),
    defineField({name: 'lastVerified', type: 'date'}),
  ],
  preview: {
    select: {from: 'from.spdxId', into: 'into.spdxId', verdict: 'verdict'},
    prepare: ({from, into, verdict}) => ({title: `${from} → ${into}`, subtitle: verdict}),
  },
})
