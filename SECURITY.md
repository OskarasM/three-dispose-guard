# Security policy

## Supported version

The latest published minor release receives security fixes.

## Reporting a vulnerability

Do not open a public issue containing exploit details.

Report the problem privately through GitHub's security-advisory form for `OskarasM/three-dispose-guard`. Include:

- The affected package version and entry point.
- A minimal reproduction.
- The expected and observed ownership transition.
- Whether the issue can dispose a live shared resource or retain sensitive application data.
- Any suggested mitigation.

You should receive an acknowledgement within seven days. No bounty programme is currently offered.

## Scope

This package controls calls to Three.js resource `dispose()` methods. It does not process credentials, perform network requests or provide a security boundary around untrusted WebGL content.
