import {defineField, defineType} from 'sanity'
import {ClipboardIcon} from '@sanity/icons/Clipboard'

/**
 * A concrete thing a developer must do when a trigger happens (distribute a
 * binary, modify a file, serve over a network, link statically...). One
 * license has several obligations; each cites where it comes from.
 */
export const obligation = defineType({
  name: 'obligation',
  title: 'Obligation',
  type: 'document',
  icon: ClipboardIcon,
  fields: [
    defineField({
      name: 'license',
      type: 'reference',
      to: [{type: 'license'}],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'trigger',
      type: 'string',
      options: {
        list: [
          {title: 'Distributing source', value: 'distribute-source'},
          {title: 'Distributing binaries', value: 'distribute-binary'},
          {title: 'Modifying the code', value: 'modify'},
          {title: 'Linking as a library', value: 'link'},
          {title: 'Serving over a network (SaaS)', value: 'network'},
          {title: 'Using trademarks', value: 'trademark'},
          {title: 'Always', value: 'always'},
        ],
      },
      validation: (r) => r.required(),
    }),
    defineField({name: 'requirement', type: 'text', rows: 3, validation: (r) => r.required()}),
    defineField({
      name: 'severity',
      description: 'How costly it is to comply: notice = copy a file; disclose = publish source; relicense = your whole work changes license.',
      type: 'string',
      options: {list: ['notice', 'disclose', 'relicense', 'restriction'], layout: 'radio'},
      validation: (r) => r.required(),
    }),
    defineField({name: 'authority', type: 'reference', to: [{type: 'source'}]}),
    defineField({name: 'sourceUrl', type: 'url'}),
  ],
  preview: {
    select: {license: 'license.spdxId', trigger: 'trigger', requirement: 'requirement'},
    prepare: ({license, trigger, requirement}) => ({
      title: `${license}: ${trigger}`,
      subtitle: requirement,
    }),
  },
})
