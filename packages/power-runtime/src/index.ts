/**
 * Shared runtime for Power Apps code apps.
 *
 * Scope rule: this package holds CAPABILITIES and MECHANISMS that are true for
 * any code app on this platform. Business vocabulary — entity types, routes,
 * function names, copy — is injected by the consuming app and never lives here.
 *
 * The React layer is a separate entry point (`@agentic/power-runtime/react`),
 * so non-React consumers pull none of it.
 */
export * from './async/retry';
export * from './dataverse/types';
export * from './dataverse/query';
export * from './background-task';
export * from './ai-cost';
