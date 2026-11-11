import { useMemo } from 'react'
import { diffProjects } from '../shared/diff'
import type { Project, ValidationReport } from '../shared/model'
const display = (value: unknown) =>
  value === undefined
    ? '(absent)'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2)
export function ProposalDiff({
  before,
  after,
  validation,
}: {
  before: Project
  after: Project
  validation?: ValidationReport
}) {
  const differences = useMemo(() => diffProjects(before, after), [before, after])
  const removed = differences.filter((item) => item.change === 'removed')
  return (
    <section className="proposal-diff" aria-label="Semantic proposal diff">
      <h4>Field-level changes</h4>
      {!!removed.length && (
        <p role="status">
          Removes {removed.filter((item) => item.entity === 'component').length} components and{' '}
          {removed.filter((item) => item.entity === 'relationship').length} relationships, including
          cascaded removals. Review carefully.
        </p>
      )}
      {!differences.length && <p>No semantic changes.</p>}
      {differences.map((item) => (
        <details key={`${item.entity}:${item.id}`} open={item.change === 'removed'}>
          <summary>
            {item.change} {item.entity}: {item.id}
          </summary>
          <table>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Before</th>
                <th scope="col">After</th>
              </tr>
            </thead>
            <tbody>
              {item.fields.map((field) => (
                <tr key={field.field}>
                  <th scope="row">{field.field}</th>
                  <td>{display(field.before)}</td>
                  <td>{display(field.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
      <p>
        Warnings are advisory observations, not certification of security, cost, performance, or
        design quality.
      </p>
      {validation?.warnings.map((warning, index) => (
        <p className="advisory" key={`${warning.code}:${warning.path}:${index}`}>
          {warning.code}: {warning.message}
        </p>
      ))}
    </section>
  )
}
