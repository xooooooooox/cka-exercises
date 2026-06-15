#!/usr/bin/env node
// Build the Tools tab payload (docs/tools.json) by:
//   1. Fetching the Kubernetes OpenAPI spec for a pinned release.
//   2. Curating a CKA-relevant subset of root kinds + their transitively
//      referenced sub-schemas.
//   3. Compacting each definition to { description, fields: [...] }.
//   4. Merging in tools/kubectl-help.json (produced by build-kubectl-help.mjs).
//
// Usage: node scripts/build-kubectl-tools.mjs
//        npm run build:tools
//
// No external dependencies — uses node:https for the spec fetch.

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Args: --minor=X.Y    (default: empty → single-version legacy paths)
function parseArgs() {
  const out = { minor: '' };
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--(\w+)=(.*)$/);
    if (m && m[1] === 'minor') out.minor = m[2];
  }
  return out;
}
const ARGS = parseArgs();

const OUT = path.join(ROOT, 'docs', ARGS.minor ? `tools-${ARGS.minor}.json` : 'tools.json');
const KUBECTL_HELP_FILE = path.join(ROOT, 'tools', ARGS.minor ? `kubectl-help-${ARGS.minor}.json` : 'kubectl-help.json');

// Pin to a known-good kubernetes release. Bump alongside the CKA curriculum.
const K8S_RELEASE = ARGS.minor ? `release-${ARGS.minor}` : 'release-1.34';
const SPEC_URL = `https://raw.githubusercontent.com/kubernetes/kubernetes/${K8S_RELEASE}/api/openapi-spec/swagger.json`;

// Curated CKA-relevant root kinds. Each row: { name, group, version, defRef }.
// defRef is the OpenAPI definition key — matches `definitions[<key>]`.
// shortNames mirrors the kubectl RESTMapper aliases (e.g. `po` for Pod). Used
// by the SPA both to display the alias next to the kind name and to match
// queries like `csr` or `pdb` against the right root kind.
const INCLUDED_KINDS = [
  // Workloads
  { name: 'Pod',                     shortNames: ['po'],     defRef: 'io.k8s.api.core.v1.Pod' },
  { name: 'Deployment',              shortNames: ['deploy'], defRef: 'io.k8s.api.apps.v1.Deployment' },
  { name: 'ReplicaSet',              shortNames: ['rs'],     defRef: 'io.k8s.api.apps.v1.ReplicaSet' },
  { name: 'StatefulSet',             shortNames: ['sts'],    defRef: 'io.k8s.api.apps.v1.StatefulSet' },
  { name: 'DaemonSet',               shortNames: ['ds'],     defRef: 'io.k8s.api.apps.v1.DaemonSet' },
  { name: 'Job',                     shortNames: [],         defRef: 'io.k8s.api.batch.v1.Job' },
  { name: 'CronJob',                 shortNames: ['cj'],     defRef: 'io.k8s.api.batch.v1.CronJob' },
  { name: 'ReplicationController',   shortNames: ['rc'],     defRef: 'io.k8s.api.core.v1.ReplicationController' },
  // Networking
  { name: 'Service',                 shortNames: ['svc'],    defRef: 'io.k8s.api.core.v1.Service' },
  { name: 'Endpoints',               shortNames: ['ep'],     defRef: 'io.k8s.api.core.v1.Endpoints' },
  { name: 'EndpointSlice',           shortNames: [],         defRef: 'io.k8s.api.discovery.v1.EndpointSlice' },
  { name: 'Ingress',                 shortNames: ['ing'],    defRef: 'io.k8s.api.networking.v1.Ingress' },
  { name: 'IngressClass',            shortNames: [],         defRef: 'io.k8s.api.networking.v1.IngressClass' },
  { name: 'NetworkPolicy',           shortNames: ['netpol'], defRef: 'io.k8s.api.networking.v1.NetworkPolicy' },
  // Storage
  { name: 'PersistentVolume',        shortNames: ['pv'],     defRef: 'io.k8s.api.core.v1.PersistentVolume' },
  { name: 'PersistentVolumeClaim',   shortNames: ['pvc'],    defRef: 'io.k8s.api.core.v1.PersistentVolumeClaim' },
  { name: 'StorageClass',            shortNames: ['sc'],     defRef: 'io.k8s.api.storage.v1.StorageClass' },
  { name: 'CSIDriver',               shortNames: [],         defRef: 'io.k8s.api.storage.v1.CSIDriver' },
  { name: 'VolumeAttachment',        shortNames: [],         defRef: 'io.k8s.api.storage.v1.VolumeAttachment' },
  // Config
  { name: 'ConfigMap',               shortNames: ['cm'],     defRef: 'io.k8s.api.core.v1.ConfigMap' },
  { name: 'Secret',                  shortNames: [],         defRef: 'io.k8s.api.core.v1.Secret' },
  { name: 'ResourceQuota',           shortNames: ['quota'],  defRef: 'io.k8s.api.core.v1.ResourceQuota' },
  { name: 'LimitRange',              shortNames: ['limits'], defRef: 'io.k8s.api.core.v1.LimitRange' },
  // RBAC
  { name: 'ServiceAccount',          shortNames: ['sa'],     defRef: 'io.k8s.api.core.v1.ServiceAccount' },
  { name: 'Role',                    shortNames: [],         defRef: 'io.k8s.api.rbac.v1.Role' },
  { name: 'RoleBinding',             shortNames: [],         defRef: 'io.k8s.api.rbac.v1.RoleBinding' },
  { name: 'ClusterRole',             shortNames: [],         defRef: 'io.k8s.api.rbac.v1.ClusterRole' },
  { name: 'ClusterRoleBinding',      shortNames: [],         defRef: 'io.k8s.api.rbac.v1.ClusterRoleBinding' },
  // Cluster
  { name: 'Node',                    shortNames: ['no'],     defRef: 'io.k8s.api.core.v1.Node' },
  { name: 'Namespace',               shortNames: ['ns'],     defRef: 'io.k8s.api.core.v1.Namespace' },
  { name: 'Event',                   shortNames: ['ev'],     defRef: 'io.k8s.api.core.v1.Event' },
  { name: 'PriorityClass',           shortNames: ['pc'],     defRef: 'io.k8s.api.scheduling.v1.PriorityClass' },
  { name: 'HorizontalPodAutoscaler', shortNames: ['hpa'],    defRef: 'io.k8s.api.autoscaling.v2.HorizontalPodAutoscaler' },
  { name: 'CustomResourceDefinition',shortNames: ['crd'],    defRef: 'io.k8s.apiextensions-apiserver.pkg.apis.apiextensions.v1.CustomResourceDefinition' },
  // Security / Cert / Admission / Coordination — newly added for CKA coverage
  { name: 'CertificateSigningRequest',      shortNames: ['csr'], defRef: 'io.k8s.api.certificates.v1.CertificateSigningRequest' },
  { name: 'PodDisruptionBudget',            shortNames: ['pdb'], defRef: 'io.k8s.api.policy.v1.PodDisruptionBudget' },
  { name: 'Lease',                          shortNames: [],      defRef: 'io.k8s.api.coordination.v1.Lease' },
  { name: 'MutatingWebhookConfiguration',   shortNames: [],      defRef: 'io.k8s.api.admissionregistration.v1.MutatingWebhookConfiguration' },
  { name: 'ValidatingWebhookConfiguration', shortNames: [],      defRef: 'io.k8s.api.admissionregistration.v1.ValidatingWebhookConfiguration' },
  { name: 'RuntimeClass',                   shortNames: [],      defRef: 'io.k8s.api.node.v1.RuntimeClass' },
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'cka-exercises-build/1.0' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return resolve(fetchJson(res.headers.location));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`${url} → HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Cap at 4000 chars — covers every real description in the bundled kinds
// (longest seen ~1500 chars on RBAC and TLS-cert fields) while keeping a
// safety ceiling against runaway pathological data. The SPA's field-list
// rows line-clamp the rendered text to 4 lines so the panel stays scannable;
// the leaf-detail view shows the full text untouched.
function compactDesc(s, max = 4000) {
  if (!s) return '';
  const norm = s.replace(/\s+/g, ' ').trim();
  return norm.length > max ? norm.slice(0, max).replace(/\s\S*$/, '') + '…' : norm;
}

function refToKey(ref) {
  // "#/definitions/io.k8s.api.core.v1.PodSpec" → "io.k8s.api.core.v1.PodSpec"
  return ref && ref.startsWith('#/definitions/') ? ref.slice('#/definitions/'.length) : null;
}

// Definitions that we surface as fields (with `ref`) but don't expand further.
// They're either heavily recursive (CRD JSONSchemaProps) or rarely exam-relevant.
const STOP_AT_REF = new Set([
  'io.k8s.apiextensions-apiserver.pkg.apis.apiextensions.v1.JSONSchemaProps',
  'io.k8s.apimachinery.pkg.runtime.RawExtension',
  'io.k8s.apimachinery.pkg.apis.meta.v1.FieldsV1',
  'io.k8s.apimachinery.pkg.apis.meta.v1.ManagedFieldsEntry',
]);

// Emit a compact field list for a definition. Recurses through referenced defs
// via the `wanted` set so we keep a closed graph.
function compactDef(def, wanted) {
  const out = { description: compactDesc(def.description), fields: [] };
  const required = new Set(def.required || []);
  const props = def.properties || {};
  for (const [name, prop] of Object.entries(props)) {
    const row = {
      name,
      description: compactDesc(prop.description),
    };
    if (required.has(name)) row.required = true;
    if (prop.$ref) {
      const k = refToKey(prop.$ref);
      row.type = 'object';
      row.ref = k;
      if (k && !STOP_AT_REF.has(k)) wanted.add(k);
    } else if (prop.type === 'array') {
      const items = prop.items || {};
      if (items.$ref) {
        const k = refToKey(items.$ref);
        row.type = `[]${k ? k.split('.').pop() : 'object'}`;
        row.ref = k;
        if (k && !STOP_AT_REF.has(k)) wanted.add(k);
      } else {
        row.type = `[]${items.type || 'object'}`;
      }
    } else if (prop.type === 'object' && prop.additionalProperties?.$ref) {
      const k = refToKey(prop.additionalProperties.$ref);
      row.type = `map[string]${k ? k.split('.').pop() : 'object'}`;
      row.ref = k;
      if (k && !STOP_AT_REF.has(k)) wanted.add(k);
    } else {
      row.type = prop.type || 'object';
    }
    out.fields.push(row);
  }
  return out;
}

async function main() {
  console.log(`Fetching OpenAPI spec for ${K8S_RELEASE}…`);
  const spec = await fetchJson(SPEC_URL);
  const defs = spec.definitions || {};
  if (Object.keys(defs).length === 0) throw new Error('Empty definitions in spec');

  // Closed graph: start from INCLUDED_KINDS, expand transitively
  const wanted = new Set(INCLUDED_KINDS.map(k => k.defRef));
  const compacted = {};
  // BFS — keep compacting until no new refs appear
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of [...wanted]) {
      if (compacted[key]) continue;
      const def = defs[key];
      if (!def) {
        console.warn(`  missing def: ${key}`);
        compacted[key] = { description: '', fields: [] };
        continue;
      }
      const before = wanted.size;
      compacted[key] = compactDef(def, wanted);
      if (wanted.size > before) changed = true;
    }
  }

  // Build rootKinds with group/version from x-kubernetes-group-version-kind
  // and the kubectl-style short-name aliases from INCLUDED_KINDS.
  const rootKinds = INCLUDED_KINDS.map(({ name, defRef, shortNames }) => {
    const def = defs[defRef];
    const gvk = def?.['x-kubernetes-group-version-kind']?.[0] || {};
    return {
      name,
      group: gvk.group || '',
      version: gvk.version || '',
      ref: defRef,
      shortNames: shortNames || [],
    };
  });

  // Merge in kubectl help
  let kubectlBlock = null;
  if (fs.existsSync(KUBECTL_HELP_FILE)) {
    const k = JSON.parse(fs.readFileSync(KUBECTL_HELP_FILE, 'utf8'));
    kubectlBlock = { version: k.kubectlVersion, commands: k.commands };
  } else {
    console.warn(`  ${path.relative(ROOT, KUBECTL_HELP_FILE)} not found — Tools tab will only have Explain. Run "npm run build:kubectl-help" first.`);
  }

  const payload = {
    schemaVersion: 1,
    k8sVersion: K8S_RELEASE,
    generatedAt: new Date().toISOString(),
    rootKinds,
    definitions: compacted,
    kubectl: kubectlBlock,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload) + '\n');
  const bytes = fs.statSync(OUT).size;
  const kindCount = rootKinds.length;
  const defCount = Object.keys(compacted).length;
  const cmdCount = kubectlBlock?.commands?.length || 0;
  console.log(`Wrote ${path.relative(ROOT, OUT)} — ${kindCount} kinds, ${defCount} defs, ${cmdCount} kubectl commands, ${Math.round(bytes / 1024)} KB`);

  // Budget tuned for Explain (~350KB after trimming) + verbatim kubectl -h
  // payload (~220KB across ~80 commands). Bumped from the initial 500KB
  // target once we measured the actual cost of full-fidelity help output.
  if (bytes > 800 * 1024) {
    console.error(`✗ tools.json exceeds 800KB budget — check for runaway $ref expansion`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
