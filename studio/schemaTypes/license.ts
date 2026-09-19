import {defineArrayMember, defineField, defineType} from 'sanity'
import {DocumentTextIcon} from '@sanity/icons/DocumentText'

export const LICENSE_CATEGORIES = [
  {title: 'Public domain / dedication', value: 'public-domain'},
  {title: 'Permissive', value: 'permissive'},
  {title: 'Weak copyleft (file / library scope)', value: 'weak-copyleft'},
  {title: 'Strong copyleft', value: 'strong-copyleft'},
  {title: 'Network copyleft (AGPL-style)', value: 'network-copyleft'},
  {title: 'Source-available (not open source)', value: 'source-available'},
  {title: 'Content / documentation license', value: 'content'},
  {title: 'Proprietary / unlicensed', value: 'proprietary'},
]

/**
 * One license, keyed by SPDX identifier. Facts come from SPDX (identifiers,
 * OSI / FSF flags), choosealicense.com (permissions / conditions /
 * limitations), and the FSF license list (GPL compatibility verdict).
 */
export const license = defineType({
  name: 'license',
  title: 'License',
  type: 'document',
  icon: DocumentTextIcon,
  fields: [
    defineField({
      name: 'spdxId',
      title: 'SPDX identifier',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({name: 'name', type: 'string', validation: (r) => r.required()}),
    defineField({
      name: 'aliases',
      description: 'Other names seen in package metadata (e.g. "BSD", "GPL", "Apache 2").',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
    }),
    defineField({
      name: 'category',
      type: 'string',
      options: {list: LICENSE_CATEGORIES, layout: 'dropdown'},
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'osiApproved',
      title: 'OSI approved',
      type: 'string',
      options: {list: ['yes', 'no', 'unknown'], layout: 'radio'},
      initialValue: 'unknown',
    }),
    defineField({
      name: 'fsfLibre',
      title: 'FSF: free software',
      type: 'string',
      options: {list: ['yes', 'no', 'unknown'], layout: 'radio'},
      initialValue: 'unknown',
    }),
    defineField({
      name: 'gplCompatibility',
      title: 'FSF GPL-compatibility verdict',
      description: 'As stated on the FSF license list. "partial" = compatible with some GPL versions only.',
      type: 'string',
      options: {
        list: [
          {title: 'Compatible with GPLv2 and GPLv3', value: 'compatible'},
          {title: 'Compatible with GPLv3 only', value: 'gplv3-only'},
          {title: 'Compatible with GPLv2 only', value: 'gplv2-only'},
          {title: 'Incompatible', value: 'incompatible'},
          {title: 'Not stated', value: 'unknown'},
        ],
      },
      initialValue: 'unknown',
    }),
    defineField({name: 'summary', type: 'text', rows: 3}),
    defineField({
      name: 'permissions',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      options: {
        list: ['commercial-use', 'modifications', 'distribution', 'private-use', 'patent-use'],
      },
    }),
    defineField({
      name: 'conditions',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      options: {
        list: [
          'include-copyright',
          'include-copyright--source',
          'document-changes',
          'disclose-source',
          'network-use-disclose',
          'same-license',
          'same-license--file',
          'same-license--library',
        ],
      },
    }),
    defineField({
      name: 'limitations',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      options: {list: ['trademark-use', 'liability', 'patent-use', 'warranty']},
    }),
    defineField({
      name: 'steward',
      title: 'License steward',
      type: 'reference',
      to: [{type: 'source'}],
    }),
    defineField({
      name: 'links',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({name: 'label', type: 'string'}),
            defineField({name: 'url', type: 'url'}),
          ],
          preview: {select: {title: 'label', subtitle: 'url'}},
        }),
      ],
    }),
    defineField({
      name: 'deprecatedIds',
      description: 'SPDX ids superseded by this one (e.g. GPL-3.0 → GPL-3.0-only).',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
    }),
  ],
  preview: {select: {title: 'spdxId', subtitle: 'name'}},
})
