/**
 * Host-face Typert manifest for the `bailianRouter` RPC service.
 *
 * Hand-written in the structure the typert generator emits (the pattern proven
 * by installed community bundles), but with hand-rolled parsers instead of a
 * schema library: the registry only requires `{ mode, typeSymbol, create() }`,
 * and importing a third-party package here would fail activation for a plugin
 * installed from a plain directory (no `node_modules`).
 *
 * The loader auto-scans the package's `./typert` export; `apply()` additionally
 * registers the manifest when that scan missed the package (file-entry installs).
 */
import { CODECS } from './rpc.js';
const PACKAGE = 'dsh-bailian-auto-router';
const direct = (method) => `${PACKAGE}#bailianRouter/${method}`;
/** The host-face manifest registered with the typert registry. */
export const TYPERT = {
    package: PACKAGE,
    face: 'host',
    schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: [
        {
            id: direct('getState'),
            service: 'bailianRouter',
            namespace: 'bailianRouter',
            method: 'getState',
            invocation: { kind: 'direct' },
            parameters: [],
            result: CODECS.state,
        },
        {
            id: direct('updateConfig'),
            service: 'bailianRouter',
            namespace: 'bailianRouter',
            method: 'updateConfig',
            invocation: { kind: 'direct' },
            parameters: [{ name: 'patch', wire: 'patch', source: 'json', codec: CODECS.patch }],
            result: CODECS.state,
        },
        {
            id: direct('refreshPool'),
            service: 'bailianRouter',
            namespace: 'bailianRouter',
            method: 'refreshPool',
            invocation: { kind: 'direct' },
            parameters: [],
            result: CODECS.refresh,
        },
        {
            id: direct('switchConnection'),
            service: 'bailianRouter',
            namespace: 'bailianRouter',
            method: 'switchConnection',
            invocation: { kind: 'direct' },
            parameters: [
                { name: 'entryId', wire: 'entryId', source: 'json', codec: CODECS.string },
                { name: 'providerId', wire: 'providerId', source: 'json', codec: CODECS.string },
            ],
            result: CODECS.refresh,
        },
        {
            id: direct('resetQuota'),
            service: 'bailianRouter',
            namespace: 'bailianRouter',
            method: 'resetQuota',
            invocation: { kind: 'direct' },
            parameters: [{
                    name: 'model',
                    wire: 'model',
                    source: 'json',
                    codec: CODECS.modelId,
                    acceptsUndefined: true,
                }],
            result: CODECS.state,
        },
        {
            id: direct('clearHistory'),
            service: 'bailianRouter',
            namespace: 'bailianRouter',
            method: 'clearHistory',
            invocation: { kind: 'direct' },
            parameters: [],
            result: CODECS.state,
        },
    ],
};
