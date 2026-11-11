import type { Component, Project } from './model'
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('en-US').trim()
/** Literal, bounded semantic search; user input is never interpreted as a regex. */
export function searchComponents(project: Project, query: string, limit = 30): Component[] {
  const needle = normalize(query)
  const maximum = Number.isFinite(limit) ? Math.max(0, Math.min(500, Math.floor(limit))) : 30
  return project.components
    .map((component, index) => {
      const id = normalize(component.id),
        name = normalize(component.name)
      const haystack = normalize(
        [
          component.id,
          component.name,
          component.kind,
          component.technology,
          component.owner,
          component.description,
          ...component.tags,
        ].join(' '),
      )
      const rank = !needle
        ? 4
        : id === needle
          ? 0
          : name === needle
            ? 1
            : id.startsWith(needle) || name.startsWith(needle)
              ? 2
              : haystack.includes(needle)
                ? 3
                : 5
      return { component, index, rank }
    })
    .filter((item) => item.rank < 5)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, maximum)
    .map((item) => item.component)
}
