# Ownership model

## Decision

The package uses deterministic reference counting with an explicit cache protection. Audit mode is the default.

The unit of tracking is a disposable Three.js resource, not an Object3D. Each acquire operation collects a deduplicated set of geometries, materials, textures, render targets and skeletons below its root. Shared references therefore point to the same internal record.

## States

Each resource record tracks three independent counts:

| Count | Meaning | Disposal effect |
| --- | --- | --- |
| owners | live users that claim disposal responsibility | final release can make the resource eligible |
| borrowers | live users that do not claim ownership | blocks disposal while live and never creates eligibility |
| protections | cache or pool ownership anchors | blocks disposal until explicit eviction |

A resource is disposed only when all three counts are zero and the registry has seen an ownership claim or protection. In audit mode the same transition records `would-dispose` and leaves the resource untouched.

## Alternatives considered

### Blind recursive disposal

Rejected because it ignores sharing and competes with loader caches. It is short code with unsafe semantics.

### Weak references and finalisers as the primary mechanism

Rejected because finalisation is non-deterministic. A finaliser also cannot recover the collected Three.js object to call `dispose()` without a strong reference that defeats collection. It is unsuitable for the guarantee that a live resource survives and the final orphan is promptly cleaned.

### Reachability from the current scene

Rejected as a complete ownership signal. A cache, render target pool or temporarily detached model can be valid while unreachable from the active scene. Reachability is useful for diagnostics, not authority.

### Clone every cached asset

Rejected because it trades ownership ambiguity for additional GPU memory, load time and application-specific clone semantics. Skinned meshes and textures make generic deep cloning particularly error-prone.

## React Three Fiber boundary

R3F already attempts automatic disposal for declarative objects. Cached loader results and `<primitive>` objects need explicit handling. A tracked subtree should set `dispose={null}` so R3F and this package do not both manage the same lifecycle.

If a `useLoader` result remains in the R3F cache, it remains owned. Use a protection until `useLoader.clear()` runs. If eviction is outside the caller's control, track the result as borrowed.
