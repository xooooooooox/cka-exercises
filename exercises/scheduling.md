# Workloads & Scheduling (15%)

> CKA Curriculum v1.35 — [cncf/curriculum](https://github.com/cncf/curriculum)

## 考试大纲考点

- Understand application deployments and how to perform rolling update and rollbacks
- Use ConfigMaps and Secrets to configure applications
- Configure workload autoscaling
- Understand the primitives used to create robust, self-healing, application deployments
- Configure Pod admission and scheduling (limits, node affinity, etc.)

---

## 1. Understand application deployments and how to perform rolling update and rollbacks

> 📖
> [Concepts > Workloads > Workload Management > Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
> [Reference > Command line tool (kubectl) > kubectl Quick Reference](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

### Create a deployment from a YAML file named deploy.yml

> 🔗 [Concepts > Workloads > Workload Management > Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)

<details><summary>show</summary>
<p>

```bash
# create the yaml file
kubectl create deploy my-deployment --image nginx --dry-run=client -o yaml > deploy.yml

# create the resource from the yaml spec
kubectl apply -f deploy.yml
```

</p>
</details>

### Describe a pod named nginx

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
# create a pod named nginx
k run nginx --image nginx

# describe the pod
k describe po nginx
```

</p>
</details>

### Delete a pod named nginx

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Deleting resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#deleting-resources)

<details><summary>show</summary>
<p>

```bash
kubectl delete po nginx
```

</p>
</details>

### Create a deployment named nginx and use the image nginx

> 🔗 [Concepts > Workloads > Workload Management > Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)

<details><summary>show</summary>
<p>

```bash
kubectl create deploy nginx --image=nginx
```

</p>
</details>

### Create the YAML specification for a deployment named nginx, outputting to a file named deploy.yml

> 🔗
> [Concepts > Workloads > Workload Management > Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
> [Reference > Command line tool (kubectl) > kubectl Usage Conventions](https://kubernetes.io/docs/reference/kubectl/conventions/)

<details><summary>show</summary>
<p>

```bash
kubectl create deployment nginx --image=nginx --dry-run -o yaml > deploy.yml
```

</p>
</details>

### Update the `nginx` deployment to use at new image tag `1.27.4-alpine-slim`

> 🔗 [Concepts > Workloads > Workload Management > Deployments: Updating a Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#updating-a-deployment)

<details><summary>show</summary>
<p>

```bash
# list the deployments
k get deploy

# patch the deployment
kubectl set image deploy nginx nginx=nginx:1.27.4-alpine-slim

# verify that the new image is set
k get deploy nginx -o yaml | grep image:
```

</p>
</details>

### [CKA 真题 - 4分] Scale the existing loadbalancer deployment to 6 replicas

> 🔗 [Concepts > Workloads > Workload Management > Deployments: Scaling a Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#scaling-a-deployment)

**题目:**
Scale the deployment `loadbalancer` to 6 pods.

<details><summary>show</summary>
<p>

```bash
# 切换 context
kubectl config use-context k8s

# 列出当前 deployment 状态
kubectl get deploy loadbalancer

# 缩放到 6 个副本
kubectl scale deploy loadbalancer --replicas=6

# 验证
kubectl get deploy loadbalancer
# READY 应为 6/6
kubectl get pods -l app=loadbalancer
```

</p>
</details>

---

## 2. Use ConfigMaps and Secrets to configure applications

> 📖
> [Concepts > Configuration > ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
> [Concepts > Configuration > Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)

### Create a configmap named `my-configmap` with two values, one single line and one multi-line

> 🔗 [Concepts > Configuration > ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)

<details><summary>show</summary>
<p>

```bash
# create a configmap with a siingle line and a multi-line
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-configmap
data:
  single: "This is a single line value"
  multi: |
    This is a multi-line value.
    It spans multiple lines.
    You can include as many lines as needed.
EOF

# view the configmap data in the cluster
kubectl describe cm my-configmap


```

</p>
</details>

### Use the configMap `my-configmap` in a deployment named `my-nginx-deployment` that uses the image `nginx:latest` mounting the configMap as a volume

> 🔗 [Concepts > Configuration > ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)

<details><summary>show</summary>
<p>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-nginx-deployment
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:latest
        volumeMounts:
        - name: config-volume
          mountPath: /etc/config
          readOnly: true
      volumes:
      - name: config-volume
        configMap:
          name: my-configmap
```

</p>
</details>

### Use the configMap `my-configmap` as an environment variable in a deployment named `mynginx-deploy` that uses the image `nginx-latest`, passing in the single line value as an environment variable named `SINGLE_VALUE` and the multi-line value as `MULTI_VALUE`

> 🔗 [Concepts > Configuration > ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)

<details><summary>show</summary>
<p>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mynginx-deploy
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:latest
        env:
        - name: SINGLE_VALUE
          valueFrom:
            configMapKeyRef:
              name: my-configmap
              key: single
        - name: MULTI_VALUE
          valueFrom:
            configMapKeyRef:
              name: my-configmap
              key: multi

```

</p>
</details>

### Create a secret via yaml that contains two base64 encoded values

> 🔗 [Concepts > Configuration > Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)

<details><summary>show</summary>
<p>

```bash
# create two base64 encoded strings
echo -n 'secret' | base64

echo -n 'anothersecret' | base64

# create a file named secret.yml
apiVersion: v1
kind: Secret
metadata:
  name: my-secret
type: Opaque
data:
  secretkey1: <base64 String 1>
  secretkey2: <base64 String 2>

# create a secret
kubectl create -f secretl.yml
```

</p>
</details>

### Using kubectl, create a secret named `admin-pass` from the string `SuperSecureP@ssw0rd`

> 🔗 [Concepts > Configuration > Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)

<details><summary>show</summary>
<p>

```bash
# create a secret from the string `SuperSecureP@ssw0rd`
kubectl create secret generic admin-pass --from-literal=password=SuperSecureP@ssw0rd
```

</p>
</details>

### Inject the secret `admin-pass` into a deployment named `admin-deploy` as an environment variable named `PASSWORD`

> 🔗 [Concepts > Configuration > Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)

<details><summary>show</summary>
<p>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: admin-deploy
spec:
  replicas: 1
  selector:
    matchLabels:
      app: secret-app
  template:
    metadata:
      labels:
        app: secret-app
    spec:
      containers:
        - name: my-container
          image: nginx
          env:
            - name: PASSWORD
              valueFrom:
                secretKeyRef:
                  name: my-secret
                  key: password
```

</p>
</details>

### Use the secret `admin-pass` inside a deployment named `secret-deploy` mounting the secret inside the pod at `/etc/secret/password`

> 🔗 [Concepts > Configuration > Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)

<details><summary>show</summary>
<p>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: secret-deploy
spec:
  replicas: 1
  selector:
    matchLabels:
      app: secret-app
  template:
    metadata:
      labels:
        app: secret-app
    spec:
      containers:
        - name: my-container
          image: nginx
          volumeMounts:
            - name: secret-volume
              mountPath: "/etc/secret"
              readOnly: true
      volumes:
        - name: secret-volume
          secret:
            secretName: my-secret
```

</p>
</details>

---

## 3. Configure workload autoscaling

> 📖
> [Tasks > Run Applications > Horizontal Pod Autoscaling](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
> [Concepts > Workloads > Autoscaling Workloads](https://kubernetes.io/docs/concepts/workloads/autoscaling/)

### Create an HPA that scales a deployment based on CPU utilization

> 🔗 [Tasks > Run Applications > Horizontal Pod Autoscaling](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)

> **Note:** HPA 需要 Metrics Server 已安装。

<details><summary>show</summary>
<p>

```bash
# create a deployment with CPU resource requests (HPA 必须有 requests 才能计算利用率)
kubectl create deploy php-apache --image=registry.k8s.io/hpa-example
kubectl set resources deploy php-apache --requests=cpu=200m
kubectl expose deploy php-apache --port=80

# create an HPA: min 1 replica, max 10 replicas, target 50% CPU
kubectl autoscale deploy php-apache --min=1 --max=10 --cpu-percent=50

# verify the HPA
kubectl get hpa

# generate load to trigger scaling
kubectl run load-gen --rm -it --image=busybox -- sh -c "while true; do wget -q -O- http://php-apache; done"

# in another terminal, watch the HPA scale up
kubectl get hpa -w

# stop the load generator (Ctrl+C), watch scale down
kubectl get hpa -w
```

</p>
</details>

### Create an HPA from a YAML manifest with both CPU and memory targets

> 🔗 [Tasks > Run Applications > Horizontal Pod Autoscaling: API Object](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/#api-object)

<details><summary>show</summary>
<p>

```bash
# ensure the deployment has both cpu and memory requests
kubectl set resources deploy php-apache --requests=cpu=200m,memory=128Mi

# create HPA v2 with multiple metrics
cat <<EOF | kubectl apply -f -
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: php-apache-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: php-apache
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300    # 缩容稳定窗口，防止频繁缩容
EOF

# verify
kubectl get hpa php-apache-hpa
kubectl describe hpa php-apache-hpa
```

</p>
</details>

### Manually scale a deployment managed by an HPA and observe the HPA override

> 🔗 [Concepts > Workloads > Autoscaling Workloads](https://kubernetes.io/docs/concepts/workloads/autoscaling/)

<details><summary>show</summary>
<p>

```bash
# check current HPA state
kubectl get hpa php-apache-hpa

# manually scale the deployment
kubectl scale deploy php-apache --replicas=5

# observe: HPA will eventually override manual scaling based on actual metrics
kubectl get hpa -w

# 结论: 当 HPA 处于活动状态时，手动 scale 只是临时的，HPA 会根据指标重新调整
# 如需永久更改，应修改 HPA 的 minReplicas/maxReplicas
kubectl patch hpa php-apache-hpa -p '{"spec":{"minReplicas":5}}'
```

</p>
</details>

### Delete an HPA and verify the deployment replica count is preserved

> 🔗 [Tasks > Run Applications > Horizontal Pod Autoscaling](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)

<details><summary>show</summary>
<p>

```bash
# check current replica count
kubectl get deploy php-apache

# delete the HPA
kubectl delete hpa php-apache-hpa

# verify: deployment keeps its current replica count (HPA 不会在删除时改变副本数)
kubectl get deploy php-apache

# re-create the HPA if needed
kubectl autoscale deploy php-apache --min=1 --max=10 --cpu-percent=50
```

</p>
</details>

---

## 4. Understand the primitives used to create robust, self-healing, application deployments

> 📖
> [Concepts > Workloads > Workload Management > ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)
> [Concepts > Workloads > Workload Management > Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
> [Concepts > Workloads > Workload Management > DaemonSets](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/)

### Create a ReplicaSet and observe self-healing behavior when a pod is deleted

> 🔗 [Concepts > Workloads > Workload Management > ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)

<details><summary>show</summary>
<p>

```bash
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: nginx-rs
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx-rs
  template:
    metadata:
      labels:
        app: nginx-rs
    spec:
      containers:
      - name: nginx
        image: nginx
EOF

# verify 3 pods are running
kubectl get rs nginx-rs
kubectl get pods -l app=nginx-rs

# delete one pod
POD=$(kubectl get pods -l app=nginx-rs -o jsonpath='{.items[0].metadata.name}')
kubectl delete pod $POD

# observe the ReplicaSet immediately creates a replacement
kubectl get pods -l app=nginx-rs
# should still show 3 pods (new pod with different name)

# 注意: 生产环境中应使用 Deployment 而不是直接使用 ReplicaSet
# Deployment 管理 ReplicaSet，并提供滚动更新和回滚能力
```

</p>
</details>

### Perform a rolling update on a Deployment, then roll back to the previous revision

> 🔗 [Concepts > Workloads > Workload Management > Deployments: Rolling Back a Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-back-a-deployment)

<details><summary>show</summary>
<p>

```bash
# create a deployment with nginx:1.25
kubectl create deploy web --image=nginx:1.25 --replicas=3

# record the rollout history
kubectl rollout history deploy web

# update the image to nginx:1.27
kubectl set image deploy web nginx=nginx:1.27

# watch the rollout
kubectl rollout status deploy web

# verify the new image
kubectl get deploy web -o jsonpath='{.spec.template.spec.containers[0].image}'
# expected: nginx:1.27

# check rollout history (shows revisions)
kubectl rollout history deploy web

# roll back to the previous revision
kubectl rollout undo deploy web

# verify it reverted to nginx:1.25
kubectl get deploy web -o jsonpath='{.spec.template.spec.containers[0].image}'

# roll back to a specific revision
kubectl rollout undo deploy web --to-revision=2
```

</p>
</details>

### Create a DaemonSet that runs a logging agent on every node

> 🔗 [Concepts > Workloads > Workload Management > DaemonSet](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/)

<details><summary>show</summary>
<p>

```bash
# kubectl 没有 "create daemonset" 命令，可以从 deployment 生成 YAML 再修改
kubectl create deploy logger --image=busybox --dry-run=client -o yaml > ds.yaml
```

```yaml
# ds.yaml — 修改 kind 为 DaemonSet，删除 replicas 字段
apiVersion: apps/v1
kind: DaemonSet            # 改为 DaemonSet
metadata:
  name: logger
spec:
  # replicas: 已删除（DaemonSet 不需要 replicas 字段）
  selector:
    matchLabels:
      app: logger
  template:
    metadata:
      labels:
        app: logger
    spec:
      containers:
      - name: busybox
        image: busybox
        command: ['sh', '-c', 'while true; do echo "$(date) - node log"; sleep 60; done']
```

```bash
kubectl apply -f ds.yaml

# verify: each node should have exactly one pod
kubectl get ds logger
kubectl get pods -l app=logger -o wide
# READY 数量应等于节点数（不含有 NoSchedule taint 的节点）
```

</p>
</details>

### Configure a Deployment with a rolling update strategy setting maxSurge and maxUnavailable

> 🔗 [Concepts > Workloads > Workload Management > Deployments: Strategy](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#strategy)

<details><summary>show</summary>
<p>

```bash
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rolling-demo
spec:
  replicas: 4
  selector:
    matchLabels:
      app: rolling-demo
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1            # 更新时最多多出 1 个 Pod
      maxUnavailable: 0      # 更新时不允许有不可用的 Pod（零停机）
  template:
    metadata:
      labels:
        app: rolling-demo
    spec:
      containers:
      - name: nginx
        image: nginx:1.25
EOF

# trigger a rolling update
kubectl set image deploy rolling-demo nginx=nginx:1.27

# watch the rollout (notice: at least 4 pods are always Running)
kubectl rollout status deploy rolling-demo
kubectl get pods -l app=rolling-demo -w

# 对比另一种策略: maxSurge=0, maxUnavailable=1（节省资源，但有短暂不可用）
# kubectl patch deploy rolling-demo -p '{"spec":{"strategy":{"rollingUpdate":{"maxSurge":0,"maxUnavailable":1}}}}'
```

</p>
</details>

### Add liveness and readiness probes to a Deployment to enable self-healing

> 🔗 [Tasks > Configure Pods and Containers > Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)

<details><summary>show</summary>
<p>

```bash
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: probed-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: probed-app
  template:
    metadata:
      labels:
        app: probed-app
    spec:
      containers:
      - name: nginx
        image: nginx
        ports:
        - containerPort: 80
        livenessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 3
          periodSeconds: 5
EOF

# verify probes are configured
kubectl describe deploy probed-app | grep -A5 "Liveness\|Readiness"

# simulate a liveness failure: delete the default page
POD=$(kubectl get pod -l app=probed-app -o jsonpath='{.items[0].metadata.name}')
kubectl exec $POD -- rm /usr/share/nginx/html/index.html

# watch the pod restart (liveness probe fails → kubelet restarts container)
kubectl get pods -l app=probed-app -w

# livenessProbe 失败 → 容器重启（自愈）
# readinessProbe 失败 → 从 Service endpoints 中移除（流量保护）
```

</p>
</details>

### [CKA 真题 - 4分] Create a Pod "kucc1" with four containers: nginx, redis, memcached, consul

> 🔗 [Concepts > Workloads > Pods](https://kubernetes.io/docs/concepts/workloads/pods/)

**题目:**
Create a Pod named `kucc1` running the following 4 images. Use the latest tag for each.
- nginx
- redis
- memcached
- consul

<details><summary>show</summary>
<p>

```bash
# 先用 dry-run 生成单容器 YAML 作为基础
kubectl run kucc1 --image=nginx --dry-run=client -o yaml > kucc1.yaml
```

```yaml
# kucc1.yaml — 编辑为多容器 Pod
apiVersion: v1
kind: Pod
metadata:
  name: kucc1
spec:
  containers:
  - name: nginx
    image: nginx
  - name: redis
    image: redis
  - name: memcached
    image: memcached
  - name: consul
    image: consul
```

```bash
kubectl apply -f kucc1.yaml

# 验证: 4 个容器全部 Running
kubectl get pod kucc1
# READY 应为 4/4
kubectl describe pod kucc1 | grep -A2 "Image:"
```

</p>
</details>

### [CKA 真题 - 7分] Add busybox sidecar container to legacy-app pod sharing /var/log via emptyDir

> 🔗 [Concepts > Workloads > Pods > Sidecar Containers](https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/)

**题目:**
Without changing its existing containers, an existing Pod needs to be integrated into Kubernetes' built-in logging architecture (e.g. kubectl logs). Adding a streaming sidecar container is a good and common way to accomplish this requirement.
Add a `busybox` sidecar container to the existing Pod `legacy-app`. The new sidecar container has to run the following command:
`/bin/sh, -c, tail -n+1 -f /var/log/legacy-app.log`
Use a Volume mounted at `/var/log` to make the log file `legacy-app.log` available to the sidecar container.

> **Note:** 不能直接修改运行中的 Pod 容器列表，需要先导出 YAML、编辑、重建。

<details><summary>show</summary>
<p>

```bash
# 1. 导出现有 Pod 配置
kubectl get pod legacy-app -o yaml > legacy-app.yaml

# 2. 编辑 YAML：
#    - 添加 emptyDir 卷 "logs"
#    - 给原容器添加 volumeMount 到 /var/log
#    - 添加 busybox sidecar 容器
vi legacy-app.yaml
```

```yaml
# 关键修改部分（保留原 Pod 的其他配置）
apiVersion: v1
kind: Pod
metadata:
  name: legacy-app
spec:
  containers:
  - name: count            # 原始容器
    image: busybox
    args:
    - /bin/sh
    - -c
    - >
      i=0;
      while true;
      do
        echo "$i: $(date)" >> /var/log/legacy-app.log;
        i=$((i+1));
        sleep 1;
      done
    volumeMounts:           # 新增 volumeMount
    - name: logs
      mountPath: /var/log
  - name: sidecar           # 新增 sidecar 容器
    image: busybox
    args: [/bin/sh, -c, 'tail -n+1 -f /var/log/legacy-app.log']
    volumeMounts:
    - name: logs
      mountPath: /var/log
  volumes:                  # 新增共享卷
  - name: logs
    emptyDir: {}
```

```bash
# 3. 删除原 Pod 并重新创建
kubectl delete pod legacy-app
kubectl apply -f legacy-app.yaml

# 4. 验证 sidecar 可读取日志
kubectl logs legacy-app -c sidecar
# 应输出递增的日志行
```

</p>
</details>

---

## 5. Configure Pod admission and scheduling (limits, node affinity, etc.)

> 📖
> [Concepts > Scheduling, Preemption and Eviction > Assigning Pods to Nodes](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/)
> [Concepts > Configuration > Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)

### Apply the label "disk=ssd" to a node. Create a pod named "fast" using the nginx image and make sure that it selects a node based on the label "disk=ssd"

> 🔗 [Concepts > Scheduling, Preemption and Eviction > Assigning Pods to Nodes](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/)

<details><summary>show</summary>
<p>

```bash
# label the node named 'node01'
kubectl label no node01 "disk=ssd"

# create the pod YAML for pod named 'fast'
kubectl run fast --image nginx --dry-run=client -o yaml > fast.yaml
```

```yaml
# fast.yaml
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    run: fast
  name: fast
spec:
  nodeSelector: ### ADD THIS LINE
    disk: ssd   ### ADD THIS LINE
  containers:
  - image: nginx
    name: fast
```

</p>
</details>


### Edit the "fast" pod (created above), changing the node selector to "disk=slow." Notice that the pod cannot be changed, and the YAML was saved to a temporary location. Take the YAML in /tmp/ and apply it by force to delete and recreate the pod using a single imperative command

> 🔗 [Concepts > Scheduling, Preemption and Eviction > Assigning Pods to Nodes](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/)

<details><summary>show</summary>
<p>

```bash
# edit the pod
kubectl edit po fast
```

```yaml
# edit fast pod
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    run: fast
  name: fast
spec:
  nodeSelector:
    disk: slow  ### CHANGE THIS LINE
  containers:
  - image: nginx
    name: fast
```

```bash
# output will look similar to the following:
# :error: pods "fast" is invalid
# A copy of your changes has been stored to "/tmp/kubectl-edit-136974717.yaml"
# error: Edit cancelled, no valid changes were saved.

# replace and recreate the pod
k replace -f /tmp/kubectl-edit-136974717.yaml --force
```

</p>
</details>

### Create a new pod named "ssd-pod" using the nginx image. Use node affinity to select nodes based on a weight of 1 to nodes labeled "disk=ssd". If the selection criteria don't match, it can also choose nodes that have the label "kubernetes.io/os=linux"

> 🔗 [Concepts > Scheduling, Preemption and Eviction > Assigning Pods to Nodes: Node affinity](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/#node-affinity)

<details><summary>show command</summary>
<p>

```bash
# create the YAML for a pod named 'ssd-pod'
kubectl run ssd-pod --image nginx --dry-run=client -o yaml > pod.yaml
```

</p>
</details>

<details><summary>show pod YAML</summary>
<p>

```yaml
# pod.yaml file
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    run: ssd-pod
  name: ssd-pod
spec:
############## START HERE ############################
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchExpressions:
          - key: kubernetes.io/os
            operator: In
            values:
            - linux
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 1
        preference:
          matchExpressions:
          - key: disk
            operator: In
            values:
            - ssd
############## END HERE ############################
  containers:
  - image: nginx
    name: ssd-pod
```

</p>
</details>

### Create a pod named "limited" with the image "httpd" and set the resource requests to 1 CPU and "100Mi" for memory

> 🔗 [Concepts > Configuration > Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)

<details><summary>show</summary>
<p>

```bash
# create the yaml for a pod
k run limited --image httpd --dry-run=client -o yaml > pod.yaml
```

Add the YAML for resources requests to the YAML file. Here is the complete file.
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: limited
spec:
  containers:
  - name: httpd
    image: httpd
    resources:
      requests:
        cpu: "500m"
        memory: "100Mi"
```

Create the pod from the YAML file
```bash
# create the pod from `pod.yaml` file
k create -f pod.yaml

# list the pods to see the pod is now running
k get po

```

</p>
</details>

### [CKA 真题 - 4分] Schedule Pod nginx-kusc00401 to nodes labeled disk=spinning using nodeSelector

> 🔗 [Concepts > Scheduling, Preemption and Eviction > Assigning Pods to Nodes](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/)

**题目:**
Schedule a Pod as follows:
- Name: `nginx-kusc00401`
- Image: `nginx`
- Node selector: `disk=spinning`

<details><summary>show</summary>
<p>

```bash
# 验证至少有一个节点带 disk=spinning 标签
kubectl get nodes --show-labels | grep "disk=spinning"
# 如果没有，则需先打标签（考试环境通常已配置好）

# 生成基础 YAML
kubectl run nginx-kusc00401 --image=nginx --dry-run=client -o yaml > pod.yaml
```

```yaml
# pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-kusc00401
spec:
  nodeSelector:        # 添加 nodeSelector
    disk: spinning
  containers:
  - image: nginx
    name: nginx-kusc00401
```

```bash
kubectl apply -f pod.yaml

# 验证 Pod 调度到带 disk=spinning 的节点
kubectl get pod nginx-kusc00401 -o wide
```

</p>
</details>

---

## Killer.sh Mock Exam Questions

> 📚 Source PDFs: [`assets/CKA Simulator A Kubernetes 1.35 - Killer Shell.pdf`](../assets/CKA%20Simulator%20A%20Kubernetes%201.35%20-%20Killer%20Shell.pdf) | [`assets/CKA Simulator B Kubernetes 1.35 - Killer Shell.pdf`](../assets/CKA%20Simulator%20B%20Kubernetes%201.35%20-%20Killer%20Shell.pdf)
>
> CKA 报名后 killer.sh 提供两次模拟考试（Simulator A & B），各 17 题。下文整理了与本章节（工作负载与调度）相关的题目。

### [Killer.sh A-Q3] Scale down a StatefulSet

> 🔗 [Concepts > Workloads > Workload Management > StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)

**Task:** In namespace `project-h800` there are two Pods `o3db-*`. Scale them down to a single replica to save resources.

<details><summary>show</summary>
<p>

```bash
# determine the controller type
k -n project-h800 get deploy,sts,ds | grep o3db
# statefulset.apps/o3db   2/2

k -n project-h800 scale sts o3db --replicas=1

# verify
k -n project-h800 get pod -l app=o3db
```

</p>
</details>

### [Killer.sh A-Q4] Find Pods most likely to be evicted first under pressure (QoS)

> 🔗 [Tasks > Configure Pods and Containers > Configure Quality of Service for Pods](https://kubernetes.io/docs/tasks/configure-pod-container/quality-service-pod/)

**Task:** Check all Pods in namespace `project-c13` and find those that would be terminated first under CPU/memory pressure. Write their names to `/opt/course/4/pods-terminated-first.txt`.

<details><summary>show</summary>
<p>

```bash
# QoS class determines eviction order: BestEffort → Burstable → Guaranteed
k -n project-c13 get pod -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.qosClass}{"\n"}{end}'

# list BestEffort pods (evicted first)
k -n project-c13 get pod -o jsonpath='{range .items[?(@.status.qosClass=="BestEffort")]}{.metadata.name}{"\n"}{end}' \
  > /opt/course/4/pods-terminated-first.txt

cat /opt/course/4/pods-terminated-first.txt
```

</p>
</details>

### [Killer.sh A-Q5] Configure HPA via Kustomize, override maxReplicas in prod overlay

> 🔗 [Tasks > Run Applications > Horizontal Pod Autoscaling](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)

**Task:** Replace an external autoscaler with an HPA via Kustomize at `/opt/course/5/api-gateway`. (1) Remove ConfigMap `horizontal-scaling-config` from base & overlays; (2) Add HPA `api-gateway` for Deployment `api-gateway` with min=2, max=4, target avg CPU 50%; (3) In prod overlay override `maxReplicas: 6`; (4) Apply both overlays.

<details><summary>show</summary>
<p>

```yaml
# /opt/course/5/api-gateway/base/api-gateway.yaml — add HPA
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 2
  maxReplicas: 4
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
```

```yaml
# /opt/course/5/api-gateway/prod/api-gateway.yaml — patch maxReplicas to 6
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway
spec:
  maxReplicas: 6
```

```bash
# remove ConfigMap references from base & overlays first
# then apply
k kustomize /opt/course/5/api-gateway/staging | k apply -f -
k kustomize /opt/course/5/api-gateway/prod | k apply -f -

# Kustomize doesn't prune — delete leftover ConfigMap manually
k -n api-gateway-staging delete cm horizontal-scaling-config
k -n api-gateway-prod delete cm horizontal-scaling-config
```

</p>
</details>

### [Killer.sh A-Q11] Create a DaemonSet that runs on all nodes including controlplane

> 🔗 [Concepts > Workloads > Workload Management > DaemonSet](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/)

**Task:** In namespace `project-tiger` create DaemonSet `ds-important` (image `httpd:2-alpine`) with labels `id=ds-important` and `uuid=18426a0b-5f59-4e10-923f-c0e078e82462`. Pods request 10m CPU and 10Mi memory; run on all nodes including controlplane.

<details><summary>show</summary>
<p>

```bash
# use deployment dry-run as template
k -n project-tiger create deploy ds-important --image=httpd:2-alpine --dry-run=client -o yaml > ds.yaml
```

```yaml
# ds.yaml — change kind to DaemonSet, remove replicas/strategy/status
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: ds-important
  namespace: project-tiger
  labels:
    id: ds-important
    uuid: 18426a0b-5f59-4e10-923f-c0e078e82462
spec:
  selector:
    matchLabels:
      id: ds-important
      uuid: 18426a0b-5f59-4e10-923f-c0e078e82462
  template:
    metadata:
      labels:
        id: ds-important
        uuid: 18426a0b-5f59-4e10-923f-c0e078e82462
    spec:
      tolerations:                          # 允许在 controlplane 调度
      - key: node-role.kubernetes.io/control-plane
        effect: NoSchedule
      containers:
      - name: ds-important
        image: httpd:2-alpine
        resources:
          requests:
            cpu: 10m
            memory: 10Mi
```

```bash
k apply -f ds.yaml
k -n project-tiger get ds,pod -o wide   # one pod per node
```

</p>
</details>

### [Killer.sh A-Q12] Deployment with multi-container Pods + podAntiAffinity to spread one per node

> 🔗 [Concepts > Scheduling, Preemption and Eviction > Assigning Pods to Nodes: Inter-pod affinity and anti-affinity](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/#inter-pod-affinity-and-anti-affinity)

**Task:** In namespace `project-tiger` create Deployment `deploy-important` (3 replicas, label `id=very-important`) with two containers: `container1` (image `nginx:1-alpine`) and `container2` (image `registry.k8s.io/pause:3.10`). Only one Pod per worker node — use `topologyKey: kubernetes.io/hostname`.

<details><summary>show</summary>
<p>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: deploy-important
  namespace: project-tiger
  labels:
    id: very-important
spec:
  replicas: 3
  selector:
    matchLabels:
      id: very-important
  template:
    metadata:
      labels:
        id: very-important
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
              - key: id
                operator: In
                values: [very-important]
            topologyKey: kubernetes.io/hostname
      containers:
      - name: container1
        image: nginx:1-alpine
      - name: container2
        image: registry.k8s.io/pause:3.10
```

</p>
</details>

### [Killer.sh B-Q4] Pod becomes Ready only when an upstream Service is reachable

> 🔗 [Tasks > Configure Pods and Containers > Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)

**Task:** Create Pod `ready-if-service-ready` (`nginx:1-alpine`) with livenessProbe `true` and a readinessProbe that performs `wget -T2 -O- http://service-am-i-ready:80`. Then create Pod `am-i-ready` (`nginx:1-alpine`, label `id=cross-server-ready`) so existing Service `service-am-i-ready` has an endpoint and the first Pod transitions to Ready.

<details><summary>show</summary>
<p>

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: ready-if-service-ready
spec:
  containers:
  - name: nginx
    image: nginx:1-alpine
    livenessProbe:
      exec:
        command: ["true"]
    readinessProbe:
      exec:
        command: ["sh", "-c", "wget -T2 -O- http://service-am-i-ready:80"]
```

```bash
k apply -f ready-if-service-ready.yaml
# initially NOT READY since service has no endpoints

# create the endpoint Pod
k run am-i-ready --image=nginx:1-alpine --labels="id=cross-server-ready"

# wait, then verify
k get pod ready-if-service-ready    # should become READY 1/1
```

</p>
</details>

### [Killer.sh B-Q11] Create namespace, mount Secret as file + env vars

> 🔗 [Concepts > Configuration > Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)

**Task:** Create namespace `secret`. In it: (1) Pod `secret-pod` (`busybox:1`, `sleep 1d`); (2) Apply existing Secret `/opt/course/11/secret1.yaml` (after fixing namespace) and mount read-only at `/tmp/secret1`; (3) Create Secret `secret2` with `user=user1` and `pass=1234` exposed as env vars `APP_USER` and `APP_PASS`.

<details><summary>show</summary>
<p>

```bash
k create ns secret

# fix namespace in secret1.yaml then apply
sed -i 's/namespace: .*/namespace: secret/' /opt/course/11/secret1.yaml
k apply -f /opt/course/11/secret1.yaml

# create secret2
k -n secret create secret generic secret2 --from-literal=user=user1 --from-literal=pass=1234
```

```yaml
# secret-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: secret-pod
  namespace: secret
spec:
  containers:
  - name: busybox
    image: busybox:1
    command: ["sh", "-c", "sleep 1d"]
    env:
    - name: APP_USER
      valueFrom:
        secretKeyRef: {name: secret2, key: user}
    - name: APP_PASS
      valueFrom:
        secretKeyRef: {name: secret2, key: pass}
    volumeMounts:
    - name: secret1-vol
      mountPath: /tmp/secret1
      readOnly: true
  volumes:
  - name: secret1-vol
    secret:
      secretName: secret1
```

</p>
</details>

### [Killer.sh B-Q12] Schedule Pod only on controlplane nodes (no new labels)

> 🔗 [Concepts > Scheduling, Preemption and Eviction > Taints and Tolerations](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/)

**Task:** In `default` create Pod `pod1` (image `httpd:2-alpine`, container `pod1-container`) that runs only on controlplane nodes. Do not add new labels.

<details><summary>show</summary>
<p>

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pod1
spec:
  tolerations:
  - key: node-role.kubernetes.io/control-plane
    effect: NoSchedule
  nodeSelector:
    node-role.kubernetes.io/control-plane: ""
  containers:
  - name: pod1-container
    image: httpd:2-alpine
```

```bash
k apply -f pod1.yaml
k get pod pod1 -o wide   # should land on controlplane
```

</p>
</details>

### [Killer.sh B-Q13] Multi-container Pod sharing emptyDir volume with downward API env

> 🔗 [Tasks > Inject Data Into Applications > Expose Pod Information to Containers Through Environment Variables](https://kubernetes.io/docs/tasks/inject-data-application/environment-variable-expose-pod-information/)

**Task:** Create Pod `multi-container-playground` in `default` with a shared non-persistent volume and three containers:
- c1 (`nginx:1-alpine`): expose env `MY_NODE_NAME` from `spec.nodeName`
- c2 (`busybox:1`): write `date` to `date.log` every second
- c3 (`busybox:1`): `tail -f date.log`

Verify by checking c3's logs.

<details><summary>show</summary>
<p>

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: multi-container-playground
spec:
  volumes:
  - name: vol
    emptyDir: {}
  containers:
  - name: c1
    image: nginx:1-alpine
    env:
    - name: MY_NODE_NAME
      valueFrom:
        fieldRef:
          fieldPath: spec.nodeName
    volumeMounts:
    - name: vol
      mountPath: /vol
  - name: c2
    image: busybox:1
    command: ["sh", "-c", "while true; do date >> /vol/date.log; sleep 1; done"]
    volumeMounts:
    - name: vol
      mountPath: /vol
  - name: c3
    image: busybox:1
    command: ["sh", "-c", "tail -f /vol/date.log"]
    volumeMounts:
    - name: vol
      mountPath: /vol
```

```bash
k apply -f multi-container-playground.yaml
k logs multi-container-playground -c c3
k exec multi-container-playground -c c1 -- printenv MY_NODE_NAME
```

</p>
</details>
