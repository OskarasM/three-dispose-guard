import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react'
import { ResourceRegistry, createResourceRegistry } from './registry'
import type {
  AcquireOptions,
  RegistrySnapshot,
  ResourceRegistryOptions,
  ResourceRoot,
} from './types'

const RegistryContext = createContext<ResourceRegistry | null>(null)

export interface ResourceRegistryProviderProps extends PropsWithChildren {
  registry?: ResourceRegistry
  options?: ResourceRegistryOptions
}

export function ResourceRegistryProvider({
  children,
  registry: suppliedRegistry,
  options,
}: ResourceRegistryProviderProps) {
  const registry = useMemo(
    () => suppliedRegistry ?? createResourceRegistry(options),
    [suppliedRegistry, options],
  )

  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>
}

export function useResourceRegistry(): ResourceRegistry {
  const registry = useContext(RegistryContext)
  if (!registry) {
    throw new Error('useResourceRegistry must be used inside ResourceRegistryProvider')
  }
  return registry
}

export interface UseResourceLeaseOptions extends AcquireOptions {
  registry?: ResourceRegistry
}

/**
 * Tracks a stable Three.js root for the lifetime of a React component.
 *
 * R3F users should put `dispose={null}` on the tracked subtree so that one
 * ownership system, rather than two competing systems, controls cleanup.
 */
export function useResourceLease(
  root: ResourceRoot | null | undefined,
  options: UseResourceLeaseOptions = {},
): void {
  const contextRegistry = useContext(RegistryContext)
  const registry = options.registry ?? contextRegistry
  if (!registry) {
    throw new Error('Pass a registry or wrap the component in ResourceRegistryProvider')
  }

  const ownership = options.ownership ?? 'borrowed'
  const label = options.label

  useEffect(() => {
    if (!root) return
    const lease = registry.acquire(root, { ownership, label })
    return () => lease.release()
  }, [registry, root, ownership, label])
}

export function useResourceSnapshot(registry?: ResourceRegistry): RegistrySnapshot {
  const contextRegistry = useContext(RegistryContext)
  const selected = registry ?? contextRegistry
  if (!selected) {
    throw new Error('Pass a registry or wrap the component in ResourceRegistryProvider')
  }

  return useSyncExternalStore(
    (listener) => selected.subscribe(listener),
    () => selected.snapshot(),
    () => selected.snapshot(),
  )
}
