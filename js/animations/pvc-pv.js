/**
 * PersistentVolumeClaims and PersistentVolumes: binding, zones, and reclaim.
 *
 * Sits right after statefulsets, as the mechanism that animation's own
 * volumeClaimTemplates and WaitForFirstConsumer lines only name-drop. That
 * animation showed a claim outliving its pod; this one shows how a claim
 * became a volume in the first place, the zone mismatch that binding mode
 * can cause before any pod is even scheduled - the same zone story
 * topology-spread told for compute, told here for storage - and what
 * actually happens to the data when the claim goes away.
 *
 * Frame shape:
 *   { boxes: [{ role: 'pvc'|'pv'|'pod', cls, title, sub }],
 *     note, badge, focus }
 */

const MODES = [
  { id: 'dynamic-provisioning', label: 'Dynamic provisioning',
    caption: 'A PVC with no matching PersistentVolume gets one created for it on demand' },
  { id: 'binding-mode', label: 'Immediate can strand a zone', antiPattern: true,
    caption: 'Binding before a pod exists means guessing a zone — and the guess can be wrong' },
  { id: 'reclaim-delete', label: 'reclaimPolicy: Delete',
    caption: 'Deleting the claim deletes the volume and the data with it — the default for most StorageClasses' },
  { id: 'reclaim-retain', label: 'reclaimPolicy: Retain', advanced: true,
    caption: 'The data survives, but the volume needs a human before anything can bind to it again' },
];

const COL_X = { pvc: 40, pv: 260, pod: 480 };
const COL_W = 190;
const COL_Y = 60;
const COL_H = 100;
const TITLE = { pvc: 'PVC: data-0', pv: 'PV', pod: 'Pod: app-1' };

function box(role, cls, sub, title) {
  return { role, cls, sub, title: title || TITLE[role] };
}

function buildFrames(modeId) {
  const f = [];
  const push = (o) => f.push(o);

  if (modeId === 'dynamic-provisioning') {
    push({ boxes: [box('pvc', 'pend', 'Pending')],
      note: 'A PVC requests 10Gi with storageClassName: gp3-csi',
      badge: 'No PersistentVolume exists yet — there is nothing to bind to' });
    push({ boxes: [box('pvc', 'pend', 'Pending'), box('pv', 'pend', 'being provisioned')],
      note: 'The gp3-csi StorageClass has a provisioner: it creates a PV to match',
      focus: ['provisioner:'],
      badge: 'This is dynamic provisioning — nobody pre-created a PersistentVolume by hand' });
    push({ boxes: [box('pvc', 'run', 'Bound'), box('pv', 'run', 'Bound · zone a')],
      note: 'The new PV binds to the PVC — both flip to Bound',
      badge: 'Bound is a two-way link: the PVC names this PV, and the PV’s claimRef names this PVC' });
    push({ boxes: [box('pvc', 'run', 'Bound'), box('pv', 'run', 'Bound · zone a'), box('pod', 'run', 'mounted · zone a')],
      note: 'Only now can a pod mount it',
      badge: 'The pod was never blocked on scheduling here — capacity existed everywhere. That is not always true' });
  }

  if (modeId === 'binding-mode') {
    push({ boxes: [box('pvc', 'pend', 'Pending')],
      note: 'This StorageClass uses volumeBindingMode: Immediate',
      focus: ['volumeBindingMode: Immediate'],
      badge: 'The PV binds as soon as the PVC is created — before any pod has asked for it' });
    push({ boxes: [box('pvc', 'run', 'Bound'), box('pv', 'run', 'Bound · zone a')],
      note: 'The provisioner picks zone a — nothing told it otherwise',
      badge: 'Immediate binding has no idea which zone a pod will eventually need' });
    push({ boxes: [box('pvc', 'run', 'Bound'), box('pv', 'run', 'Bound · zone a'), box('pod', 'pend', 'wants zone b')],
      note: 'Later, a pod using this claim is scheduled — topology spread puts it in zone b',
      badge: 'The volume is already bound in zone a. A block volume cannot follow it to zone b' });
    push({ boxes: [box('pvc', 'run', 'Bound'), box('pv', 'run', 'Bound · zone a'), box('pod', 'pend', '0 nodes match')],
      note: 'The pod stays Pending: volume node affinity conflict',
      badge: 'A scheduling failure caused entirely by storage — not by resources, not by any spread constraint you wrote' });
    push({ boxes: [box('pvc', 'run', 'Bound'), box('pv', 'run', 'Bound · zone a')],
      note: 'WaitForFirstConsumer avoids this: binding waits for a pod, then binds in that pod’s zone',
      badge: 'This is the default for gp3-csi in OpenShift for exactly this reason' });
  }

  if (modeId === 'reclaim-delete') {
    push({ boxes: [box('pvc', 'run', 'Bound'), box('pv', 'run', 'Bound')],
      note: 'A PVC is Bound to a dynamically-provisioned PV — reclaimPolicy: Delete',
      focus: ['reclaimPolicy: Delete'],
      badge: 'Delete is the default for almost every dynamic StorageClass' });
    push({ boxes: [box('pv', 'run', 'Bound')],
      note: 'The Deployment is removed, and its PVC is deleted with it — routine cleanup',
      badge: 'This step alone is harmless. The next one is not' });
    push({ boxes: [],
      note: 'The PV is deleted too, and the underlying storage volume is destroyed with it',
      badge: 'Not "released" — actually destroyed. The data is gone, not just detached' });
    push({ boxes: [],
      note: 'Correct for a stateless workload’s scratch volume. A disaster for a database’s',
      badge: 'The reclaim policy decides whether "delete the PVC" means "clean up" or "destroy the only copy"' });
  }

  if (modeId === 'reclaim-retain') {
    push({ boxes: [box('pvc', 'run', 'Bound'), box('pv', 'run', 'Bound')],
      note: 'Same scenario, reclaimPolicy: Retain this time',
      focus: ['reclaimPolicy: Retain'],
      badge: 'Nothing about the PVC or the data changes yet — only what happens after deletion does' });
    push({ boxes: [box('pv', 'run', 'Bound')],
      note: 'The PVC is deleted',
      badge: 'Identical step to the last mode. Watch what the PV does next' });
    push({ boxes: [box('pv', 'pend', 'Released')],
      note: 'The PV survives, and moves to Released — not Available, not Bound',
      badge: 'The data is intact. Nothing can use this volume automatically, including a brand-new PVC that looks identical' });
    push({ boxes: [box('pv', 'pend', 'Released · stale claimRef')],
      note: 'An admin must clear spec.claimRef by hand before anything can bind to it again',
      focus: ['claimRef'],
      badge: 'Retain protects data. It does not restore self-service — that trade is deliberate' });
    push({ boxes: [box('pv', 'pend', 'Released · stale claimRef')],
      note: 'Delete is safe to automate. Retain is safe to lose track of',
      badge: 'Most teams need Delete for scratch data and Retain for anything that holds a customer’s data' });
  }

  return f;
}

function pill(role, b) {
  const x = COL_X[role];
  return `<g class="pod ${b.cls}"><rect x="${x}" y="${COL_Y}" width="${COL_W}" height="${COL_H}" rx="10"/>`
      + `<text class="svg-sub" x="${x + COL_W / 2}" y="${COL_Y + COL_H / 2 - 10}" text-anchor="middle" dominant-baseline="central">${b.title}</text>`
      + `<text class="svg-sub" x="${x + COL_W / 2}" y="${COL_Y + COL_H / 2 + 10}" text-anchor="middle" dominant-baseline="central">${b.sub}</text></g>`;
}

function renderSVG(frame) {
  let out = '';
  frame.boxes.forEach((b) => { out += pill(b.role, b); });
  out += '<text class="legend-text" x="40" y="192">solid = Bound/mounted · dotted = Pending, provisioning, or Released</text>';
  return out;
}

function metrics(frame) {
  const find = (role) => frame.boxes.find((b) => b.role === role);
  const pvc = find('pvc');
  const pv = find('pv');
  const pod = find('pod');
  return [
    { label: 'PVC', value: pvc ? pvc.sub : 'deleted', tone: pvc?.cls === 'run' ? 'ok' : pvc ? 'warn' : 'bad' },
    { label: 'PV', value: pv ? pv.sub : 'deleted', tone: pv?.cls === 'run' ? 'ok' : pv ? 'warn' : 'bad' },
    { label: 'Pod', value: pod ? pod.sub : '—', tone: pod?.cls === 'run' ? 'ok' : pod ? 'warn' : '' },
  ];
}

const NOTES = {
  'dynamic-provisioning': [
    { heading: 'What to point at', text: 'The PV appearing only after the PVC exists — nobody pre-created storage and waited for someone to claim it.' },
    { heading: 'Line that lands', text: 'A PVC is a request, a PV is the thing that satisfies it, and dynamic provisioning is just a controller creating the second one because the first one asked.' },
    { ask: 'Do you know which of your StorageClasses provision on demand versus expect a pre-created pool of PVs?' },
  ],
  'binding-mode': [
    { heading: 'What to point at', text: 'The PV already Bound in zone a, two frames before the pod that needs zone b even exists.' },
    { heading: 'Line that lands', text: 'This is the same zone problem topology-spread solved for compute, except nothing you configured on the pod can fix it — the volume decided the zone first.' },
    { ask: 'Have you ever seen a pod stuck Pending with a storage-affinity reason and gone looking for a compute problem instead?' },
  ],
  'reclaim-delete': [
    { heading: 'What to point at', text: 'The PV disappearing in the same step as the PVC — there is no intermediate "are you sure."' },
    { heading: 'Line that lands', text: 'Deleting a PVC feels like routine cleanup because most of the time it is. reclaimPolicy is the one field that decides when it is not.' },
    { ask: 'Which of your StorageClasses back a database, and do you actually know their reclaimPolicy?' },
  ],
  'reclaim-retain': [
    { heading: 'What to point at', text: 'The PV still sitting there after its PVC is gone — Released, not deleted, but also not usable by anything yet.' },
    { heading: 'Line that lands', text: 'Retain is not "safer" in every sense — it trades an automatic disaster for a manual chore somebody has to remember to do.' },
    { ask: 'If a PVC backing a production database were deleted by accident tomorrow, does its StorageClass leave you a PV to recover, or nothing at all?' },
  ],
};

const YAML = {
  'dynamic-provisioning': `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-0
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: gp3-csi
  resources:
    requests:
      storage: 10Gi
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3-csi
provisioner: ebs.csi.aws.com
reclaimPolicy: Delete
`,
  'binding-mode': `apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3-csi
provisioner: ebs.csi.aws.com
volumeBindingMode: Immediate
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-0
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: gp3-csi
  resources:
    requests:
      storage: 10Gi
`,
  'reclaim-delete': `apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3-csi
provisioner: ebs.csi.aws.com
reclaimPolicy: Delete

# When the PVC is deleted, the PV and the
# underlying storage volume are deleted too.
`,
  'reclaim-retain': `apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3-csi-retain
provisioner: ebs.csi.aws.com
reclaimPolicy: Retain

# The PV keeps the data after its PVC is deleted,
# but moves to Released - not Available, not Bound.
# An admin must clear spec.claimRef by hand before
# anything can bind to it again.
`,
};

const FEATURES = {
  'dynamic-provisioning': [
    { name: 'PersistentVolumeClaim', kind: 'v1',
      what: 'A request for storage by size and access mode. Stays Pending until something can satisfy it.' },
    { name: 'StorageClass', kind: 'storage.k8s.io/v1',
      what: 'Names a provisioner and default policies. Dynamic provisioning happens because a PVC references one.' },
    { name: 'PersistentVolume', kind: 'v1',
      what: 'The actual piece of storage — created on demand here, rather than pre-provisioned by an admin.' },
  ],
  'binding-mode': [
    { name: 'volumeBindingMode', kind: 'StorageClass',
      what: "Immediate binds (and picks a zone) the moment the PVC is created; WaitForFirstConsumer waits for a pod to be scheduled and binds in that pod's zone." },
    { name: 'PV node affinity', kind: 'PersistentVolume',
      what: "A zone-scoped PV carries a node affinity the scheduler must match. A pod that can't reach that zone stays Pending." },
    { name: 'kube-scheduler', kind: 'control plane',
      what: 'Reports a plain scheduling failure here that looks like a resource problem but is actually a storage one.' },
  ],
  'reclaim-delete': [
    { name: 'reclaimPolicy: Delete', kind: 'StorageClass',
      what: 'The default for nearly every dynamic StorageClass — deleting the PVC deletes the PV and the underlying storage together.' },
    { name: 'PersistentVolume', kind: 'v1',
      what: 'Under Delete, removed entirely, not just detached — there is no intermediate recoverable state.' },
  ],
  'reclaim-retain': [
    { name: 'reclaimPolicy: Retain', kind: 'StorageClass',
      what: 'The PV and its data survive PVC deletion, moving to a Released phase instead of being deleted.' },
    { name: 'status.phase: Released', kind: 'PersistentVolume',
      what: 'Not Available, not Bound — nothing can claim it automatically even though the data is intact.' },
    { name: 'spec.claimRef', kind: 'PersistentVolume',
      what: 'The stale reference to the deleted PVC, which has to be cleared by hand before the PV can be reused.' },
  ],
};

export default {
  id: 'pvc-pv',
  advanced: true,
  title: 'PersistentVolumeClaims and PersistentVolumes: binding, zones, and reclaim',
  summary: 'How a claim actually becomes a volume, why binding mode can strand a pod in the wrong zone, and what happens to the data when the claim is deleted.',
  description: 'A PersistentVolumeClaim dynamically provisioning a PersistentVolume, a binding-mode mismatch that leaves a pod unschedulable in the wrong zone, and the same claim deletion ending in either destroyed storage or a Released volume depending on reclaimPolicy.',
  viewBox: '0 0 680 210',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
