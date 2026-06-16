# Storage (10%)

> CKA Curriculum v1.35 — [cncf/curriculum](https://github.com/cncf/curriculum)

## 考试大纲考点

- Implement storage classes and dynamic volume provisioning
- Configure volume types, access modes and reclaim policies
- Manage persistent volumes and persistent volume claims

> **Note:** 原始练习文档 (`storage.md`) 中的练习内容（RBAC Role/RoleBinding）实际属于 "Cluster Architecture, Installation and Configuration" 部分，已移至 `cluster-architecture.md`。

---

## 1. Implement storage classes and dynamic volume provisioning

> 📖
> [Concepts > Storage > Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/)
> [Concepts > Storage > Dynamic Volume Provisioning](https://kubernetes.io/docs/concepts/storage/dynamic-provisioning/)

### Create a StorageClass and set it as the default

> 🔗 [Concepts > Storage > Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/)

<details><summary>show</summary>
<p>

```bash
# create a StorageClass with the local-path provisioner (常见于 lab 环境)
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-local
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
EOF

# verify the StorageClass is created and marked as default
kubectl get sc
# NAME                   PROVISIONER                    RECLAIMPOLICY   VOLUMEBINDINGMODE
# fast-local (default)   kubernetes.io/no-provisioner   Delete          WaitForFirstConsumer

# to change the default StorageClass: remove annotation from current, add to new
kubectl annotate sc fast-local storageclass.kubernetes.io/is-default-class-
kubectl annotate sc another-sc storageclass.kubernetes.io/is-default-class="true"
```

</p>
</details>

### Create a StorageClass with WaitForFirstConsumer binding mode

> 🔗 [Concepts > Storage > Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/)

<details><summary>show</summary>
<p>

```bash
# WaitForFirstConsumer: PV 绑定延迟到 Pod 调度时，确保 PV 与 Pod 在同一节点
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: delayed-binding
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
EOF

# Immediate: PV 一创建 PVC 就立即绑定（默认行为）
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: immediate-binding
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: Immediate
EOF

# compare the two
kubectl get sc delayed-binding immediate-binding
```

</p>
</details>

### Provision a PersistentVolumeClaim that dynamically creates a PersistentVolume using a StorageClass

> 🔗 [Concepts > Storage > Dynamic Volume Provisioning](https://kubernetes.io/docs/concepts/storage/dynamic-provisioning/)

> **Note:** 动态 provisioning 需要 StorageClass 对应的 provisioner 支持（如 cloud provider 或 CSI driver）。`kubernetes.io/no-provisioner` 不支持动态创建，需手动创建 PV。以下示例假设集群有可用的 dynamic provisioner。

<details><summary>show</summary>
<p>

```bash
# create a PVC that references a StorageClass (假设集群有支持动态 provisioning 的 SC)
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: dynamic-pvc
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: standard   # 替换为集群中可用的 SC 名称
EOF

# verify PV is automatically created and bound
kubectl get pv,pvc

# mount in a pod to verify
kubectl run pvc-test --image=nginx --dry-run=client -o yaml > pvc-pod.yaml
```

```yaml
# pvc-pod.yaml — add volume and volumeMount
apiVersion: v1
kind: Pod
metadata:
  name: pvc-test
spec:
  containers:
  - name: nginx
    image: nginx
    volumeMounts:
    - name: data
      mountPath: /usr/share/nginx/html
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: dynamic-pvc
```

```bash
kubectl apply -f pvc-pod.yaml

# verify the volume is mounted
kubectl exec pvc-test -- df -h /usr/share/nginx/html
```

</p>
</details>

### List all StorageClasses and describe their provisioner and reclaim policy

> 🔗 [Concepts > Storage > Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/)

<details><summary>show</summary>
<p>

```bash
# list all StorageClasses (default SC will have "(default)" marker)
kubectl get sc

# show provisioner and reclaimPolicy for each SC using jsonpath
kubectl get sc -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.provisioner}{"\t"}{.reclaimPolicy}{"\t"}{.volumeBindingMode}{"\n"}{end}'

# describe a specific StorageClass for full details
kubectl describe sc <sc-name>

# key fields to understand:
# - provisioner: 负责创建 PV 的插件
# - reclaimPolicy: PVC 删除后 PV 的处理方式（Delete/Retain）
# - volumeBindingMode: PV 绑定时机（Immediate/WaitForFirstConsumer）
# - allowVolumeExpansion: 是否允许 PVC 扩容
```

</p>
</details>

---

## 2. Configure volume types, access modes and reclaim policies

> 📖
> [Concepts > Storage > Volumes](https://kubernetes.io/docs/concepts/storage/volumes/)
> [Concepts > Storage > Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)

### Create a pod with an emptyDir volume shared between two containers

> 🔗 [Concepts > Storage > Volumes: emptyDir](https://kubernetes.io/docs/concepts/storage/volumes/#emptydir)

<details><summary>show</summary>
<p>

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: shared-vol
spec:
  containers:
  - name: writer
    image: busybox
    command: ['sh', '-c', 'echo "hello from writer" > /data/message.txt && sleep 3600']
    volumeMounts:
    - name: shared
      mountPath: /data
  - name: reader
    image: busybox
    command: ['sh', '-c', 'sleep 10 && cat /data/message.txt && sleep 3600']
    volumeMounts:
    - name: shared
      mountPath: /data
  volumes:
  - name: shared
    emptyDir: {}
EOF

# wait for the pod to be running
kubectl wait --for=condition=Ready pod/shared-vol

# verify the reader container can see the writer's file
kubectl exec shared-vol -c reader -- cat /data/message.txt
# expected: hello from writer

# emptyDir 生命周期与 Pod 相同：Pod 删除时数据丢失
```

</p>
</details>

### Create a pod that mounts a hostPath volume

> 🔗 [Concepts > Storage > Volumes: hostPath](https://kubernetes.io/docs/concepts/storage/volumes/#hostpath)

> **Note:** hostPath 将节点文件系统挂载到 Pod 中，存在安全风险，生产环境应避免使用。CKA 考试中常用于 lab 环境模拟持久化存储。

<details><summary>show</summary>
<p>

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: hostpath-pod
spec:
  containers:
  - name: test
    image: busybox
    command: ['sh', '-c', 'echo "written on node" > /host-data/test.txt && sleep 3600']
    volumeMounts:
    - name: host-vol
      mountPath: /host-data
  volumes:
  - name: host-vol
    hostPath:
      path: /tmp/k8s-hostpath-test
      type: DirectoryOrCreate    # 目录不存在时自动创建
EOF

# verify the file was written
kubectl exec hostpath-pod -- cat /host-data/test.txt

# hostPath type 选项:
# - DirectoryOrCreate: 目录不存在则创建
# - Directory: 目录必须已存在
# - FileOrCreate: 文件不存在则创建
# - File: 文件必须已存在
```

</p>
</details>

### Create a PersistentVolume with ReadWriteOnce access mode and Retain reclaim policy

> 🔗 [Concepts > Storage > Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)

<details><summary>show</summary>
<p>

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-retain
spec:
  capacity:
    storage: 1Gi
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  hostPath:
    path: /tmp/pv-retain
EOF

# verify PV is created and Available
kubectl get pv pv-retain
# STATUS should be "Available"

# Access Modes（访问模式）:
# - ReadWriteOnce (RWO): 单节点读写
# - ReadOnlyMany  (ROX): 多节点只读
# - ReadWriteMany (RWX): 多节点读写

# Reclaim Policies（回收策略）:
# - Retain: PVC 删除后 PV 保留（数据不丢失，需手动清理）
# - Delete: PVC 删除后 PV 及底层存储一并删除
# - Recycle: 已废弃，不建议使用
```

</p>
</details>

### Demonstrate the difference between Retain and Delete reclaim policies

> 🔗 [Concepts > Storage > Persistent Volumes: Reclaiming](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#reclaiming)

<details><summary>show</summary>
<p>

```bash
# create two PVs with different reclaim policies
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-retain-demo
spec:
  capacity:
    storage: 500Mi
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Retain
  hostPath:
    path: /tmp/pv-retain-demo
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-delete-demo
spec:
  capacity:
    storage: 500Mi
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Delete
  hostPath:
    path: /tmp/pv-delete-demo
EOF

# create PVCs that bind to each PV
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-retain-demo
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 500Mi
  volumeName: pv-retain-demo
  storageClassName: ""
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pvc-delete-demo
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 500Mi
  volumeName: pv-delete-demo
  storageClassName: ""
EOF

# verify both are Bound
kubectl get pv,pvc

# delete both PVCs
kubectl delete pvc pvc-retain-demo pvc-delete-demo

# observe the difference
kubectl get pv
# pv-retain-demo → Released（数据保留，需手动处理）
# pv-delete-demo → 已被删除（或显示 Failed，取决于 provisioner）

# 将 Released PV 重新变为 Available（移除 claimRef）
kubectl patch pv pv-retain-demo --type=json -p='[{"op":"remove","path":"/spec/claimRef"}]'
kubectl get pv pv-retain-demo   # STATUS: Available
```

</p>
</details>

### Create a pod that uses a projected volume combining a ConfigMap and a Secret

> 🔗 [Concepts > Storage > Projected Volumes](https://kubernetes.io/docs/concepts/storage/projected-volumes/)

<details><summary>show</summary>
<p>

```bash
# create a ConfigMap and a Secret
kubectl create configmap app-config --from-literal=app.env=production --from-literal=app.debug=false
kubectl create secret generic app-secret --from-literal=db-password=s3cret

# create a pod with a projected volume
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: projected-pod
spec:
  containers:
  - name: app
    image: busybox
    command: ['sh', '-c', 'ls -la /etc/projected && cat /etc/projected/* && sleep 3600']
    volumeMounts:
    - name: all-config
      mountPath: /etc/projected
      readOnly: true
  volumes:
  - name: all-config
    projected:
      sources:
      - configMap:
          name: app-config
      - secret:
          name: app-secret
EOF

# verify all files are present at the same mount point
kubectl exec projected-pod -- ls /etc/projected
# expected: app.debug  app.env  db-password

kubectl exec projected-pod -- cat /etc/projected/db-password
# expected: s3cret
```

</p>
</details>

### [CKA Past Exam - 4 pts] Create PV "app-config" with 2Gi capacity, ReadWriteMany, hostPath /srv/app-config

> 🔗 [Concepts > Storage > Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)

**Task:**

Create a persistent volume with name `app-config`, of capacity `2Gi` and access mode `ReadWriteMany`. The type of volume is `hostPath` and its location is `/srv/app-config`.

<details><summary>show</summary>
<p>

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata:
  name: app-config
spec:
  capacity:
    storage: 2Gi
  accessModes:
    - ReadWriteMany
  hostPath:
    path: "/srv/app-config"
EOF

# 验证
kubectl get pv app-config
# NAME         CAPACITY   ACCESS MODES   STATUS
# app-config   2Gi        RWX            Available
```

</p>
</details>

---

## 3. Manage persistent volumes and persistent volume claims

> 📖
> [Concepts > Storage > Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
> [Tutorials > Configuration > Configure a Pod to Use a PersistentVolume for Storage](https://kubernetes.io/docs/tutorials/configuration/configure-persistent-volume-storage/)

### Create a PersistentVolume and PersistentVolumeClaim, then mount the PVC in a pod

> 🔗 [Tutorials > Configuration > Configure a Pod to Use a PersistentVolume for Storage](https://kubernetes.io/docs/tutorials/configuration/configure-persistent-volume-storage/)

<details><summary>show</summary>
<p>

```bash
# create a PV
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata:
  name: task-pv
spec:
  capacity:
    storage: 500Mi
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  hostPath:
    path: /tmp/task-pv
EOF

# create a PVC that binds to the PV
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: task-pvc
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 500Mi
  storageClassName: ""
EOF

# verify binding
kubectl get pv task-pv     # STATUS: Bound
kubectl get pvc task-pvc   # STATUS: Bound

# create a pod that mounts the PVC
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: pvc-pod
spec:
  containers:
  - name: app
    image: busybox
    command: ['sh', '-c', 'echo "persistent data" > /data/test.txt && sleep 3600']
    volumeMounts:
    - name: storage
      mountPath: /data
  volumes:
  - name: storage
    persistentVolumeClaim:
      claimName: task-pvc
EOF

# verify data is written
kubectl exec pvc-pod -- cat /data/test.txt

# delete the pod, recreate it, and verify data persists
kubectl delete pod pvc-pod
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: pvc-pod
spec:
  containers:
  - name: app
    image: busybox
    command: ['sh', '-c', 'cat /data/test.txt && sleep 3600']
    volumeMounts:
    - name: storage
      mountPath: /data
  volumes:
  - name: storage
    persistentVolumeClaim:
      claimName: task-pvc
EOF

kubectl exec pvc-pod -- cat /data/test.txt
# expected: persistent data
```

</p>
</details>

### Expand a PersistentVolumeClaim to request more storage

> 🔗 [Concepts > Storage > Persistent Volumes: Expanding Persistent Volumes Claims](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#expanding-persistent-volumes-claims)

> **Note:** PVC 扩容需要 StorageClass 设置 `allowVolumeExpansion: true`，且底层 provisioner 支持扩容。

<details><summary>show</summary>
<p>

```bash
# create a StorageClass that allows expansion
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: expandable-sc
provisioner: kubernetes.io/no-provisioner
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
EOF

# create a PV and PVC (for lab environments without dynamic provisioner)
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata:
  name: expand-pv
spec:
  capacity:
    storage: 2Gi
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: expandable-sc
  hostPath:
    path: /tmp/expand-pv
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: expand-pvc
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
  storageClassName: expandable-sc
EOF

# verify current size
kubectl get pvc expand-pvc

# expand the PVC to 2Gi
kubectl patch pvc expand-pvc -p '{"spec":{"resources":{"requests":{"storage":"2Gi"}}}}'

# verify the new requested size
kubectl get pvc expand-pvc
```

</p>
</details>

### Troubleshoot a PersistentVolumeClaim stuck in Pending state

> 🔗 [Concepts > Storage > Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)

*此为场景练习，无固定答案。关键排查步骤：*

```
1. kubectl get pvc — 确认 PVC 状态为 Pending
2. kubectl describe pvc <name> — 查看 Events 中的错误信息
3. 常见原因:
   - 没有匹配的 PV（capacity、accessModes、storageClassName 不匹配）
   - StorageClass 不存在或 provisioner 未安装
   - volumeBindingMode 为 WaitForFirstConsumer 但还没有 Pod 使用该 PVC
4. 修复: 创建匹配的 PV 或修正 PVC spec
5. kubectl get pv,pvc — 验证绑定成功
```

### Use a PersistentVolumeClaim in a Deployment and verify data survives pod restarts

> 🔗 [Tutorials > Configuration > Configure a Pod to Use a PersistentVolume for Storage](https://kubernetes.io/docs/tutorials/configuration/configure-persistent-volume-storage/)

<details><summary>show</summary>
<p>

```bash
# create PV and PVC (reuse existing or create new)
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata:
  name: deploy-pv
spec:
  capacity:
    storage: 500Mi
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Retain
  hostPath:
    path: /tmp/deploy-pv
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: deploy-pvc
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 500Mi
  storageClassName: ""
EOF

# create a Deployment that mounts the PVC
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pvc-deploy
spec:
  replicas: 1
  selector:
    matchLabels:
      app: pvc-deploy
  template:
    metadata:
      labels:
        app: pvc-deploy
    spec:
      containers:
      - name: app
        image: busybox
        command: ['sh', '-c', 'sleep 3600']
        volumeMounts:
        - name: data
          mountPath: /data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: deploy-pvc
EOF

# write data
POD=$(kubectl get pod -l app=pvc-deploy -o jsonpath='{.items[0].metadata.name}')
kubectl exec $POD -- sh -c 'echo "survive restart" > /data/test.txt'

# delete the pod (Deployment will recreate it)
kubectl delete pod $POD

# verify data in the new pod
POD=$(kubectl get pod -l app=pvc-deploy -o jsonpath='{.items[0].metadata.name}')
kubectl exec $POD -- cat /data/test.txt
# expected: survive restart

# 注意: RWO PVC 仅允许单节点挂载，replicas > 1 时可能因调度到不同节点而失败
```

</p>
</details>

### Configure a pod to use a PersistentVolumeClaim as a read-only volume

> 🔗 [Concepts > Storage > Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)

<details><summary>show</summary>
<p>

```bash
# assume a PVC "task-pvc" already exists and has data

# create a pod that mounts the PVC as read-only
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: readonly-pod
spec:
  containers:
  - name: reader
    image: busybox
    command: ['sh', '-c', 'cat /data/test.txt && sleep 3600']
    volumeMounts:
    - name: storage
      mountPath: /data
      readOnly: true           # 设置为只读挂载
  volumes:
  - name: storage
    persistentVolumeClaim:
      claimName: task-pvc
EOF

# verify read works
kubectl exec readonly-pod -- cat /data/test.txt

# verify write is rejected
kubectl exec readonly-pod -- sh -c 'echo "new data" > /data/write-test.txt'
# expected: Read-only file system

# 注意区分:
# - accessModes (RWO/ROX/RWX): 控制多节点访问行为
# - volumeMounts.readOnly: 控制单个 Pod 内的写权限
```

</p>
</details>

### [CKA Past Exam - 7 pts] Create PVC pv-volume (10Mi, csi-hostpath-sc), mount in web-server pod, then expand to 70Mi with --record

> 🔗 [Tutorials > Configuration > Configure a Pod to Use a PersistentVolume for Storage](https://kubernetes.io/docs/tutorials/configuration/configure-persistent-volume-storage/)

**Task:**

Create a new PersistentVolumeClaim:
- Name: `pv-volume`
- Class: `csi-hostpath-sc`
- Capacity: `10Mi`

Create a new Pod which mounts the PersistentVolumeClaim as a volume:
- Name: `web-server`
- Image: `nginx`
- Mount path: `/usr/share/nginx/html`

Configure the new Pod to have ReadWriteOnce access on the volume.
Finally, using `kubectl edit` or `kubectl patch`, expand the PersistentVolumeClaim to a capacity of `70Mi` and record that change.

<details><summary>show</summary>
<p>

```bash
# 1. 创建 PVC
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pv-volume
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 10Mi
  storageClassName: csi-hostpath-sc
EOF

# 验证 PVC 是否已 Bound（csi-hostpath-sc 一般是动态 provisioner，可立即 Bound）
kubectl get pvc pv-volume

# 2. 创建 Pod 挂载 PVC
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: web-server
spec:
  containers:
  - name: nginx
    image: nginx
    volumeMounts:
    - name: pv-volume
      mountPath: /usr/share/nginx/html
  volumes:
  - name: pv-volume
    persistentVolumeClaim:
      claimName: pv-volume
EOF

# 验证
kubectl get pod web-server
kubectl exec web-server -- df -h /usr/share/nginx/html

# 3. 扩容 PVC 到 70Mi（使用 --record 记录变更）
kubectl patch pvc pv-volume -p '{"spec":{"resources":{"requests":{"storage":"70Mi"}}}}' --record

# 验证扩容
kubectl get pvc pv-volume
# CAPACITY 应显示 70Mi

# 注: 扩容需要 StorageClass allowVolumeExpansion=true，csi-hostpath-sc 通常已支持
```

</p>
</details>

---

## Killer.sh Mock Exam Questions

> 📚 Source PDFs: [`assets/killer-sh/cka-simulator-a-k8s-1.35.pdf`](../assets/killer-sh/cka-simulator-a-k8s-1.35.pdf) | [`assets/killer-sh/cka-simulator-b-k8s-1.35.pdf`](../assets/killer-sh/cka-simulator-b-k8s-1.35.pdf)

### [Killer.sh A-Q6] PV/PVC: create + mount in Deployment
> 🔗 [Tutorials > Configuration > Configure a Pod to Use a PersistentVolume for Storage](https://kubernetes.io/docs/tutorials/configuration/configure-persistent-volume-storage/)
> [Concepts > Storage > Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)

> 🖥 Solve on: `ssh cka7968`

**Task:**

Create a new PersistentVolume named `safari-pv`. It should have a capacity of 2Gi, accessMode ReadWriteOnce, hostPath `/Volumes/Data` and no storageClassName defined.

Next create a new PersistentVolumeClaim in Namespace `project-t230` named `safari-pvc`. It should request 2Gi storage, accessMode ReadWriteOnce and should not define a storageClassName. The PVC should bound to the PV correctly.

Finally create a new Deployment `safari` in Namespace `project-t230` which mounts that volume at `/tmp/safari-data`. The Pods of that Deployment should be of image `httpd:2-alpine`.

**Lab context:**

- Hostname: `cka7968` (controlplane)
- Namespace `project-t230` already exists

<details><summary>show</summary>
<p>

```yaml
# safari-pv.yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: safari-pv
spec:
  capacity:
    storage: 2Gi
  accessModes: [ReadWriteOnce]
  hostPath:
    path: /Volumes/Data
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: safari-pvc
  namespace: project-t230
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 2Gi
  storageClassName: ""        # 留空，匹配无 SC 的 PV
```

```bash
k apply -f safari-pv.yaml
k -n project-t230 get pvc safari-pvc   # STATUS Bound

# generate deployment template, then add volume + volumeMount
k -n project-t230 create deploy safari --image=httpd:2-alpine --dry-run=client -o yaml > safari.yaml
```

```yaml
# safari.yaml — add to spec.template.spec:
      containers:
      - name: httpd
        image: httpd:2-alpine
        volumeMounts:
        - name: data
          mountPath: /tmp/safari-data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: safari-pvc
```

```bash
k apply -f safari.yaml
```

</p>
</details>

### [Killer.sh B-Q10] StorageClass: WaitForFirstConsumer + Retain, PVC in Job
> 🔗 [Concepts > Storage > Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/)
> [Concepts > Storage > Dynamic Volume Provisioning](https://kubernetes.io/docs/concepts/storage/dynamic-provisioning/)

> 🖥 Solve on: `ssh cka6016`

**Task:**

There is a backup Job which needs to be adjusted to use a PVC to store backups.

Create a StorageClass named `local-backup` which uses `provisioner: rancher.io/local-path` and `volumeBindingMode: WaitForFirstConsumer`. To prevent possible data loss the StorageClass should keep a PV retained even if a bound PVC is deleted.

Adjust the Job at `/opt/course/10/backup.yaml` to use a PVC which request 50Mi storage and uses the new StorageClass.

Deploy your changes, verify the Job completed once and the PVC was bound to a newly created PV.

> ℹ️ To re-run a Job, delete it and create it again

> ℹ️ The abbreviation PV stands for PersistentVolume and PVC for PersistentVolumeClaim

**Lab context:**

- Hostname: `cka6016` (controlplane)
- Local Path Provisioner is installed; default StorageClass `local-path` exists with `reclaimPolicy: Delete`, `volumeBindingMode: WaitForFirstConsumer`
- Existing `/opt/course/10/backup.yaml`:
  ```yaml
  apiVersion: batch/v1
  kind: Job
  metadata:
    name: backup
    namespace: project-bern
  spec:
    backoffLimit: 0
    template:
      spec:
        volumes:
          - name: backup
            emptyDir: {}
        containers:
          - name: bash
            image: bash:5
            command:
              - bash
              - -c
              - |
                set -x
                touch /backup/backup-$(date +%Y-%m-%d-%H-%M-%S).tar.gz
                sleep 15
            volumeMounts:
              - name: backup
                mountPath: /backup
        restartPolicy: Never
  ```

<details><summary>show</summary>
<p>

```yaml
# storage class
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-backup
provisioner: rancher.io/local-path
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
```

```yaml
# adjust /opt/course/10/backup.yaml — add PVC + replace emptyDir
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: backup-pvc
  namespace: project-bern
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 50Mi
  storageClassName: local-backup
---
# (existing Job, replace its emptyDir volume)
      volumes:
      - name: backup
        persistentVolumeClaim:
          claimName: backup-pvc
```

```bash
k apply -f local-backup-sc.yaml
k delete -f /opt/course/10/backup.yaml --ignore-not-found
k apply -f /opt/course/10/backup.yaml

# verify
k -n project-bern get job,pod
k -n project-bern get pvc,pv
# PVC: Bound; new PV auto-created via dynamic provisioning
```

</p>
</details>

## KillerCoda Mock Exam Questions

> 📚 Source PDF: [`assets/killercoda/d-storage.pdf`](../assets/killercoda/d-storage.pdf)

### [KillerCoda-Q1] named my-pvc-cka are available. Your task is to implement the following - 4 pts

> 🔗 [Concepts > Storage](https://kubernetes.io/docs/concepts/storage/)

**Task:**

- An existing nginx pod, my-pod-cka and Persistent Volume Claim (PVC)
       named my-pvc-cka are available. Your task is to implement the following
       modifications:
     - NOTE:- PVC to PV binding and my-pod-cka pods sometimes takes around
       2Mins to Up & Running So Please wait
     - Update the pod to include a sidecar container that uses the busybox image.
       Ensure that this sidecar container remains operational by including an
       appropriate command "tail -f /dev/null" .
     - Share the shared-storage volume between the main application and the
       sidecar container, mounting it at the path /var/www/shared . Additionally,
       ensure that the sidecar container has read-only access to this shared
       volume.

<details><summary>show</summary>
<p>

```bash
Step 1: run edit pod my-pod-cka command

kubectl edit po my-pod-cka

Step 2: Update sidecontainer and save it

  - name: sidecar-container
    image: busybox
    command: ["sh", "-c", "tail -f /dev/null"]
    volumeMounts:
     - name: shared-storage
       mountPath: /var/www/shared
       readOnly: true
Step 3: run kubectl replace command

kubectl replace -f /tmp/kubectl-edit-1047923679.yaml --force
```

</p>
</details>

### [KillerCoda-Q2] Modify the size of the existing Persistent Volume Claim (PVC) named - 2 pts

> 🔗 [Concepts > Storage](https://kubernetes.io/docs/concepts/storage/)

**Task:**

Modify the size of the existing Persistent Volume Claim (PVC) named
yellow-pvc-cka to request 60Mi of storage from the yellow-pv-cka volume. Ensure
that the PVC successfully resizes to the new size and remains in the Bound state.

<details><summary>show</summary>
<p>

```bash
Step 1: run edit pvc yellow-pvc-cka command

kubectl edit pvc yellow-pvc-cka

Step 2: replace from-

 resources:
   requests:
    storage: 40Mi
to-

 resources:
  requests:
   storage: 60Mi
```

</p>
</details>

### [KillerCoda-Q3] kubernetes.io/no-provisioner and a volumeBindingMode of Immediate  - 10 pts

> 🔗 [Concepts > Storage](https://kubernetes.io/docs/concepts/storage/)

**Task:**

- Create a Storage Class named fast-storage with a provisioner of
       kubernetes.io/no-provisioner and a volumeBindingMode of Immediate .
     - Create a Persistent Volume (PV) named fast-pv-cka with a storage
       capacity of 50Mi using the fast-storage Storage Class.
     - Create a Persistent Volume Claim (PVC) named fast-pvc-cka that
       requests 30Mi of storage from the fast-pv-cka PV.
     - Create a Pod named fast-pod-cka that uses the fast-pvc-cka PVC and
       mounts the volume at the path /app/data.

<details><summary>show</summary>
<p>

```bash
Step 1: create storage class

apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
 name: fast-storage
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: Immediate
Step 2: create pv

apiVersion: v1
kind: PersistentVolume
metadata:
 name: fast-pv-cka
spec:
 capacity:
  storage: 50Mi
 accessModes:
  - ReadWriteOnce
 storageClassName: fast-storage
 hostPath:
  path: /tmp/fast-data

Step 3: create pvc

apiVersion: v1
kind: PersistentVolumeClaim
metadata:
 name: fast-pvc-cka
spec:
 accessModes:
   - ReadWriteOnce
 storageClassName: fast-storage
 resources:
   requests:
     storage: 30Mi
Step 4: create pod

apiVersion: v1
kind: Pod
metadata:
 name: fast-pod-cka
spec:
 containers:
   - name: my-container
     image: nginx:latest
     volumeMounts:
      - name: shared-volume
        mountPath: /app/data
 volumes:
   - name: shared-volume
     persistentVolumeClaim:
      claimName: fast-pvc-cka

Step 5: kubectl apply -f file.yaml
```

</p>
</details>

### [KillerCoda-Q4] Your task involves setting up storage components in a Kubernetes cluster. Follow - 8 pts

> 🔗 [Concepts > Storage](https://kubernetes.io/docs/concepts/storage/)

**Task:**

Your task involves setting up storage components in a Kubernetes cluster. Follow
these steps:

Step 1: Create a Storage Class named blue-stc-cka with the following properties:

    - Provisioner: kubernetes.io/no-provisioner
    - Volume binding mode: WaitForFirstConsumer

Step 2: Create a Persistent Volume (PV) named blue-pv-cka with the following
properties:

    - Capacity: 100Mi
    - Access mode: ReadWriteOnce
    - Reclaim policy: Retain
    - Storage class: blue-stc-cka
    - Local path: /opt/blue-data-cka
    - Node affinity: Set node affinity to create this PV on controlplane .

Step 3: Create a Persistent Volume Claim (PVC) named blue-pvc-cka with the
following properties:

    - Access mode: ReadWriteOnce
    - Storage class: blue-stc-cka
    - Storage request: 50Mi
    - The volume should be bound to blue-pv-cka .

<details><summary>show</summary>
<p>

```bash
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: blue-stc-cka
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: blue-pv-cka
spec:
  capacity:
    storage: 100Mi
  accessModes:
    - ReadWriteOnce
  storageClassName: blue-stc-cka
  persistentVolumeReclaimPolicy: Retain
  local:
    path: /opt/blue-data-cka
  nodeAffinity:
    required:
      nodeSelectorTerms:
       - matchExpressions:
          - key: kubernetes.io/hostname
            operator: In
            values:
             - controlplane
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: blue-pvc-cka
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: blue-stc-cka
  resources:
    requests:
      storage: 50Mi
  volumeName: blue-pv-cka

kubectl apply -f <filename>.yaml
```

</p>
</details>

### [KillerCoda-Q5] A Kubernetes pod definition file named nginx-pod-cka.yaml is available. Your tas - 5 pts

> 🔗 [Concepts > Storage](https://kubernetes.io/docs/concepts/storage/)

**Task:**

A Kubernetes pod definition file named nginx-pod-cka.yaml is available. Your task
is to make the following modifications to the manifest file:

     - Create a Persistent Volume Claim (PVC) with the name nginx-pvc-cka .
       This PVC should request 80Mi of storage from an existing Persistent
       Volume (PV) named nginx-pv-cka and Storage Class namednginx-stc-cka
       . Use the access mode ReadWriteOnce .
     - Add the created nginx-pvc-cka PVC to the existing nginx-pod-cka POD
       definition.
     - Mount the volume claimed by nginx-pvc-cka at the path /var/www/html
       within the nginx-pod-cka POD.
     - Add tolerations with the key node-role.kubernetes.io/control-plane set to
       Exists and effect NoSchedule to the nginx-pod-cka Pod
     - Ensure that the peach-pod-cka05-str POD is running and that the
       Persistent Volume (PV) is successfully bound .

<details><summary>show</summary>
<p>

```bash
Step 1: create pvc

apiVersion: v1
kind: PersistentVolumeClaim
metadata:
 name: nginx-pvc-cka
spec:
 accessModes:
   - ReadWriteOnce
 storageClassName: nginx-stc-cka
 resources:
   requests:
     storage: 80Mi
 volumeName: nginx-pv-cka

Run kubectl apply -f <filename>.yaml

Step 2: edit nginx-pod-cka.yaml

apiVersion: v1
kind: Pod
metadata:
 name: nginx-pod-cka
spec:
 containers:
   - name: my-container
     image: nginx:latest
     volumeMounts:
      - name: shared-volume
        mountPath: /var/www/html
 volumes:
   - name: shared-volume
     persistentVolumeClaim:
      claimName: nginx-pvc-cka
 tolerations:
   - key: node-role.kubernetes.io/control-plane
     operator: Exists
     effect: NoSchedule

Run kubectl apply -f nginx-pod-cka.yaml
```

</p>
</details>

### [KillerCoda-Q6] A persistent volume named red-pv-cka is available. Your task is to create a - 4 pts

> 🔗 [Concepts > Storage](https://kubernetes.io/docs/concepts/storage/)

**Task:**

A persistent volume named red-pv-cka is available. Your task is to create a
PersistentVolumeClaim (PVC) named red-pvc-cka and request 30Mi of storage
from the red-pv-cka PersistentVolume (PV).

Ensure the following criteria are met:

     - Access mode: ReadWriteOnce
     - Storage class: manual

<details><summary>show</summary>
<p>

```bash
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
 name: red-pvc-cka
spec:
 accessModes:
   - ReadWriteOnce
 storageClassName: manual
 resources:
   requests:
     storage: 30Mi
 volumeName: red-pv-cka
And run kubectl apply -f <filename>.yaml
```

</p>
</details>

### [KillerCoda-Q7] Create a PersistentVolume (PV) named black-pv-cka with the following - 4 pts

> 🔗 [Concepts > Storage](https://kubernetes.io/docs/concepts/storage/)

**Task:**

Create a PersistentVolume (PV) named black-pv-cka with the following
specifications:

     - Volume Type: hostPath
     - Path: /opt/black-pv-cka
     - Capacity: 50Mi

<details><summary>show</summary>
<p>

```bash
apiVersion: v1
kind: PersistentVolume
metadata:
 name: black-pv-cka
spec:
 capacity:
   storage: 50Mi
 accessModes:
  - ReadWriteOnce
 hostPath:
  path: /opt/black-pv-cka

And run kubectl apply -f <filename>.yaml
```

</p>
</details>

### [KillerCoda-Q8] Create a PersistentVolume (PV) and a PersistentVolumeClaim (PVC) using an - 8 pts

> 🔗 [Concepts > Storage](https://kubernetes.io/docs/concepts/storage/)

**Task:**

Create a PersistentVolume (PV) and a PersistentVolumeClaim (PVC) using an
existing storage class named gold-stc-cka to meet the following requirements:

Step 1: Create a Persistent Volume (PV)

     - Name the PV as gold-pv-cka .
     - Set the capacity to 50Mi .
     - Use the volume type hostpath with the path /opt/gold-stc-cka .
     - Assign the storage class as gold-stc-cka .
     - Ensure that the PV is created on node01 , where the /opt/gold-stc-cka
       directory already exists.
     - Apply a label to the PV with key tier and value white .

Step 2: Create a Persistent Volume Claim (PVC)

     - Name the PVC as gold-pvc-cka .
     - Request 30Mi of storage from the PV gold-pv-cka using the matchLabels
       criterion.
     - Use the gold-stc-cka storage class.
     - Set the access mode to ReadWriteMany .

<details><summary>show</summary>
<p>

```bash
Step 1: Create PV

apiVersion: v1
kind: PersistentVolume
metadata:
 name: gold-pv-cka
 labels:
   tier: white
spec:
 capacity:
   storage: 50Mi
 volumeMode: Filesystem
 accessModes:
  - ReadWriteMany
 persistentVolumeReclaimPolicy: Retain
 storageClassName: gold-stc-cka
 hostPath:
  path: /opt/gold-stc-cka
 nodeAffinity:
  required:
    nodeSelectorTerms:
     - matchExpressions:
        - key: kubernetes.io/hostname
          operator: In
          values:
           - node01

And run kubectl apply -f <filename>.yaml

Step 2: Create PVC

apiVersion: v1
kind: PersistentVolumeClaim
metadata:
 name: gold-pvc-cka
spec:
 accessModes:
   - ReadWriteMany
 storageClassName: gold-stc-cka
 selector:
   matchLabels:
     tier: white
 volumeName: gold-pv-cka
 resources:
   requests:
     storage: 30Mi

And run kubectl apply -f <filename>.yaml
```

</p>
</details>

### [KillerCoda-Q9] Create a storage class called green-stc as per the properties given below - 2 pts

> 🔗 [Concepts > Storage](https://kubernetes.io/docs/concepts/storage/)

**Task:**

Create a storage class called green-stc as per the properties given below:

- Provisioner should be kubernetes.io/no-provisioner . - Volume binding mode
should be WaitForFirstConsumer .

     - Volume expansion should be enabled .

<details><summary>show</summary>
<p>

```bash
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
 name: green-stc
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
And run kubectl apply -f <filename>.yaml
```

</p>
</details>

### [KillerCoda-Q10] You are responsible for provisioning storage for a Kubernetes cluster. Your task - 2 pts

> 🔗 [Concepts > Storage](https://kubernetes.io/docs/concepts/storage/)

**Task:**

You are responsible for provisioning storage for a Kubernetes cluster. Your task is
to create a PersistentVolume (PV), a PersistentVolumeClaim (PVC), and deploy a
pod that uses the PVC for shared storage.

Here are the specific requirements:

     - Create a PersistentVolume (PV) named my-pv-cka with the following
       properties:
            - Storage capacity: 100Mi
            - Access mode: ReadWriteOnce
            - Host path: /mnt/data
            - Storage class: standard
     - Create a PersistentVolumeClaim (PVC) named my-pvc-cka to claim storage
       from the my-pv-cka PV, with the following properties:
            - Storage class: standard
     - Deploy a pod named my-pod-cka using the nginx container image.
     - Mount the PVC, my-pvc-cka , to the pod at the path /var/www/html . Ensure
       that the PV, PVC, and pod are successfully created, and the pod is in a
       Running state.

Note: Binding and Pod might take time to come up, please have patience

<details><summary>show</summary>
<p>

```bash
Step 1: Create PV

apiVersion: v1
kind: PersistentVolume
metadata:
 name: my-pv-cka
spec:
 capacity:
  storage: 100Mi
 accessModes:
  - ReadWriteOnce
 hostPath:
  path: /mnt/data
 storageClassName: standard

Step 2: Create PVC

apiVersion: v1
kind: PersistentVolumeClaim
metadata:
 name: my-pvc-cka
spec:
 accessModes:
   - ReadWriteOnce
 resources:
   requests:
     storage: 100Mi
 volumeName: my-pv-cka
 storageClassName: standard

Step 3: Create pod

apiVersion: v1
kind: Pod
metadata:
 name: my-pod-cka
spec:
 containers:
   - name: nginx-container
     image: nginx
     volumeMounts:
      - name: shared-storage
        mountPath: /var/www/html
 volumes:
   - name: shared-storage
     persistentVolumeClaim:
      claimName: my-pvc-cka
```

</p>
</details>

