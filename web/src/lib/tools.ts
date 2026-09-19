/**
 * Local tools the agent uses alongside Sanity Context:
 *  - resolve_dependencies: turns a package.json / GitHub URL / npm name into a
 *    list of dependencies with normalised SPDX expressions (npm registry).
 *  - parse_license_expression: SPDX expression → choices, for ad-hoc questions.
 *  - submit_report: the typed final answer. The UI renders it as cards; the
 *    model never re-narrates the data.
 */
import {tool} from 'ai'
import {z} from 'zod'
import {resolveDependencies} from './npm'
import {parseLicenseField} from './spdx'

export const verdictSchema = z.enum(['compatible', 'conditional', 'incompatible', 'disputed', 'unknown'])

export const citationSchema = z.object({
  title: z.string().describe('Short label, e.g. "FSF license list: Apache 2.0"'),
  url: z.string().describe('The source URL the claim comes from'),
  quote: z.string().optional().describe('Verbatim sentence from the source, if available'),
})

export const conflictSchema = z.object({
  topic: z.string().describe('What the authorities disagree about'),
  claims: z
    .array(z.object({authority: z.string(), claim: z.string(), url: z.string()}))
    .min(2),
  resolution: z.string().describe('Which view the Knowledge Base instructions treat as authoritative, and why'),
})

export const dependencyVerdictSchema = z.object({
  package: z.string(),
  version: z.string().optional(),
  license: z.string().describe('Normalised SPDX expression as resolved'),
  verdict: verdictSchema,
  reason: z.string().describe('One or two sentences, grounded in a ruling or Knowledge Base entry'),
  conditions: z.array(z.string()).default([]).describe('What must be true / done for this to be allowed'),
  obligations: z.array(z.string()).default([]).describe('Concrete things to do when shipping'),
  citations: z.array(citationSchema).default([]),
  conflict: conflictSchema.optional(),
})

export const reportSchema = z.object({
  projectLicense: z.string().describe('Normalised SPDX id of the project (or LicenseRef-Unlicensed)'),
  headline: z.string().describe('One sentence: can this ship, and what blocks it'),
  verdicts: z.array(dependencyVerdictSchema),
  nextSteps: z.array(z.string()).default([]),
  caveats: z.array(z.string()).default([]).describe('Ambiguities, unknown licenses, truncation'),
})

export type Report = z.infer<typeof reportSchema>

export const localTools = {
  resolve_dependencies: tool({
    description:
      'Resolve the declared license of every direct dependency of a JavaScript project from the npm registry. Input may be a package.json (JSON text), a GitHub repository URL, or an npm package name. Returns the project license, and for each dependency its version, normalised SPDX expression, alternative choices (for OR expressions), ambiguity notes and repository. Call this first whenever the user gives a project.',
    inputSchema: z.object({
      source: z.string().describe('package.json contents, GitHub repo URL, or npm package name'),
      includeDev: z.boolean().default(false).describe('Also resolve devDependencies (usually not shipped)'),
      includePeer: z.boolean().default(false),
    }),
    execute: async ({source, includeDev, includePeer}) => {
      const project = await resolveDependencies(source, {includeDev, includePeer})
      return {
        name: project.name,
        source: project.source,
        projectLicense: {
          raw: project.projectLicense.raw,
          expression: project.projectLicense.expression,
          choices: project.projectLicense.choices,
          notes: project.projectLicense.notes,
        },
        truncated: project.truncated,
        dependencies: project.dependencies.map((d) => ({
          name: d.name,
          kind: d.kind,
          version: d.version,
          license: d.license.expression,
          choices: d.license.choices,
          ambiguous: d.license.ambiguous,
          notes: d.license.notes,
          repository: d.repository,
          error: d.error,
        })),
      }
    },
  }),

  parse_license_expression: tool({
    description:
      'Normalise a license string or SPDX expression (e.g. "GPL-3.0+", "(MIT OR Apache-2.0)", "BSD") into canonical SPDX ids and the list of alternative choices. Use for questions that mention a license by name.',
    inputSchema: z.object({expression: z.string()}),
    execute: async ({expression}) => {
      const p = parseLicenseField(expression)
      return {expression: p.expression, choices: p.choices, ambiguous: p.ambiguous, notes: p.notes}
    },
  }),

  submit_report: tool({
    description:
      'Deliver the final compatibility report for a project. Call exactly once, after every dependency has a verdict grounded in a compatibilityRuling from the dataset or a Knowledge Base entry. The UI renders this; do not repeat its contents as prose.',
    inputSchema: reportSchema,
    execute: async (report) => report,
  }),
}
