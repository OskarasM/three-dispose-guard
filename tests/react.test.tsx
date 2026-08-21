import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createResourceRegistry } from '../src'
import { ResourceRegistryProvider, useResourceLease } from '../src/react'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const containers: HTMLElement[] = []

afterEach(() => {
  for (const container of containers.splice(0)) container.remove()
})

describe('useResourceLease', () => {
  it('releases an owned resource on component unmount', async () => {
    const container = document.createElement('div')
    containers.push(container)
    document.body.append(container)
    const geometry = new BoxGeometry()
    const material = new MeshBasicMaterial()
    const mesh = new Mesh(geometry, material)
    const dispose = vi.spyOn(geometry, 'dispose')
    const registry = createResourceRegistry({ mode: 'dispose' })

    function Subject() {
      useResourceLease(mesh, { ownership: 'owned', label: 'react subject' })
      return null
    }

    const root = createRoot(container)
    await act(async () => {
      root.render(
        <ResourceRegistryProvider registry={registry}>
          <Subject />
        </ResourceRegistryProvider>,
      )
    })
    expect(dispose).not.toHaveBeenCalled()

    await act(async () => root.unmount())
    expect(dispose).toHaveBeenCalledOnce()
  })
})
