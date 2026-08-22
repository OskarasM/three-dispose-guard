export type ScenarioId =
  | 'unique'
  | 'shared'
  | 'cache'
  | 'canvas'
  | 'churn'
  | 'in-flight'

export interface ScenarioDefinition {
  id: ScenarioId
  index: string
  title: string
  question: string
  description: string
}

export const scenarios: readonly ScenarioDefinition[] = [
  {
    id: 'unique',
    index: '01',
    title: 'Unique resources',
    question: 'What grows when every mount creates new GPU resources?',
    description: 'Four strategies compare retained resources with three explicit cleanup paths.',
  },
  {
    id: 'shared',
    index: '02',
    title: 'Two live users',
    question: 'Does the first unmount break the second user?',
    description: 'An actual WebGL texture is shared by two meshes and inspected after each release.',
  },
  {
    id: 'cache',
    index: '03',
    title: 'Loader cache reuse',
    question: 'Can zero mounted users still be a valid owner state?',
    description: 'A cache protection keeps a reusable result alive until explicit eviction.',
  },
  {
    id: 'canvas',
    index: '04',
    title: 'Canvas remount',
    question: 'Which cleanup belongs to the scene, and which belongs to the renderer?',
    description: 'Scene resources and WebGL contexts are measured as separate lifecycles.',
  },
  {
    id: 'churn',
    index: '05',
    title: 'Shared churn',
    question: 'Does repeated hand-off change the final disposal count?',
    description: 'Two consumers alternate around one protected asset for a fixed number of cycles.',
  },
  {
    id: 'in-flight',
    index: '06',
    title: 'In-flight eviction',
    question: 'What happens when an evicted load resolves late?',
    description: 'A real R3F preload is evicted before its deterministic loader callback resolves.',
  },
]
