# Troubleshooting (30%)

> CKA Curriculum v1.35 — [cncf/curriculum](https://github.com/cncf/curriculum)

## 考试大纲考点

- Troubleshoot clusters and nodes
- Troubleshoot cluster components
- Monitor cluster and application resource usage
- Manage and evaluate container output streams
- Troubleshoot services and networking

---

## 1. Troubleshoot clusters and nodes

> 📖
> [Tasks > Monitoring, Logging, and Debugging > Troubleshoot Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)
> [Tasks > Monitoring, Logging, and Debugging > Troubleshoot Applications](https://kubernetes.io/docs/tasks/debug/debug-application/)

### In cluster "ik8s", in a namespace named "db08328", create a deployment named "mysql" with the image "mysql:8". List the pods to see if the pod is running. If not, view the logs and fix the pod.

> 🔗 [Tasks > Monitoring, Logging, and Debugging > Troubleshoot Applications](https://kubernetes.io/docs/tasks/debug/debug-application/)

*此为场景练习，无固定答案。关键步骤：`kubectl logs`、`kubectl describe po`、检查环境变量 `MYSQL_ROOT_PASSWORD` 是否设置。*

### Run the command `k run testbox --image busybox --command 'sleep 3600'` to create a new pod named "testbox". See if the container is running or not. Go through the decision tree to find out why and fix the pod so that it's running.

> 🔗 [Tasks > Monitoring, Logging, and Debugging > Troubleshoot Applications](https://kubernetes.io/docs/tasks/debug/debug-application/)

*此为场景练习，无固定答案。关键步骤：`kubectl describe po`、`kubectl logs`、检查 command 语法。*

### Create a new container named "busybox2" that uses the image "busybox:1.35.0". Check if the container is in a running state. Find out why the container is failing and make the corrections to get it to a running state.

> 🔗 [Tasks > Monitoring, Logging, and Debugging > Troubleshoot Applications](https://kubernetes.io/docs/tasks/debug/debug-application/)

*此为场景练习，无固定答案。关键步骤：`kubectl describe po`、`kubectl logs`、确保容器有持续运行的 command。*

### Run the command to simulate a kubelet config break, then check the status of kubelet and troubleshoot to resolve the problem with the kubelet service.

> 🔗 [Tasks > Monitoring, Logging, and Debugging > Troubleshoot Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)

*此为场景练习，无固定答案。关键步骤：`systemctl status kubelet`、`journalctl -u kubelet`、检查 `/etc/systemd/system/kubelet.service.d/10-kubeadm.conf` 配置。*

### [CKA Past Exam - 13 pts] Restore wk8s-node-0 from NotReady status, ensure kubelet persists across reboot

> 🔗 [Tasks > Monitoring, Logging, and Debugging > Troubleshoot Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)

**Task:**

A Kubernetes worker node, named `wk8s-node-0`, is in state NotReady. Investigate why this is the case, and perform any appropriate steps to bring the node to a Ready state, ensuring that any changes are made permanent.

<details><summary>show</summary>
<p>

```bash
# 切换 context
kubectl config use-context wk8s

# 1. 查看节点状态
kubectl get nodes
# wk8s-node-0   NotReady   <none>   xxx

# 2. SSH 到故障节点
ssh wk8s-node-0
sudo -i

# 3. 检查 kubelet 状态
systemctl status kubelet
# 常见情况: kubelet 未运行 / 配置错误

# 4. 启动 kubelet 并设置开机自启（关键: enable 确保重启后仍生效）
systemctl start kubelet
systemctl enable kubelet

# 5. 验证 kubelet 运行
systemctl status kubelet
journalctl -u kubelet --since "5 minutes ago" -f   # 查看启动日志

# 6. 退出节点，从 master 验证
exit  # 退出 sudo
exit  # 退出 ssh
kubectl get nodes
# wk8s-node-0 应变为 Ready

# 其他可能原因（按需排查）:
# - 容器运行时未启动: systemctl status containerd
# - swap 未关闭: swapoff -a 并注释 /etc/fstab 中的 swap 行
# - 配置错误: /var/lib/kubelet/config.yaml 或 /etc/systemd/system/kubelet.service.d/10-kubeadm.conf
```

</p>
</details>

---

## 2. Troubleshoot cluster components

> 📖
> [Tasks > Monitoring, Logging, and Debugging > Troubleshoot Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)
> [Tasks > Monitoring, Logging, and Debugging > Debugging Kubernetes Nodes With Crictl](https://kubernetes.io/docs/tasks/debug/debug-cluster/crictl/)

### Simulate a kube-scheduler failure: create a deployment, then break the scheduler. Scale the deployment and fix the scheduler so pods can be scheduled again.

> 🔗 [Tasks > Monitoring, Logging, and Debugging > Troubleshoot Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)

*此为场景练习，无固定答案。关键步骤：检查 `/etc/kubernetes/manifests/kube-scheduler.yaml`、`kubectl get po -n kube-system`、`kubectl describe po kube-scheduler -n kube-system`。*

### Move kube-scheduler.yaml out of manifests directory. Create a pod and determine why it's not starting. Fix the scheduler to get the pod running.

> 🔗 [Tasks > Monitoring, Logging, and Debugging > Troubleshoot Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)

*此为场景练习，无固定答案。关键步骤：检查 `kubectl get events`、确认 `/etc/kubernetes/manifests/kube-scheduler.yaml` 是否存在、恢复该文件。*

### Insert a bug in the kube-proxy configmap, then fix the kube-proxy pod to get it back to a running state.

> 🔗 [Tasks > Monitoring, Logging, and Debugging > Troubleshoot Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)

*此为场景练习，无固定答案。关键步骤：`kubectl logs kube-proxy -n kube-system`、`kubectl edit cm kube-proxy -n kube-system`、`kubectl delete po kube-proxy -n kube-system`。*

---

## 3. Monitor cluster and application resource usage

> 📖
> [Tasks > Monitoring, Logging, and Debugging > Resource metrics pipeline](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/)
> [Tasks > Monitoring, Logging, and Debugging > Tools for Monitoring Resources](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-usage-monitoring/)

### Install the metrics server add-on and view resource usage by a pods and nodes in the cluster

> 🔗 [Tasks > Monitoring, Logging, and Debugging > Resource metrics pipeline](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/)

<details><summary>show</summary>
<p>

```bash
# install the metrics server
kubectl apply -f https://raw.githubusercontent.com/linuxacademy/content-cka-resources/master/metrics-server-components.yaml

# verify that the metrics server is responsive
kubectl get --raw /apis/metrics.k8s.io/

# create a file named my-pod.yml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
  labels:
    app: metrics-test
spec:
  containers:
  - name: busybox
    image: radial/busyboxplus:curl
    command: ['sh', '-c', 'while true; do sleep 3600; done']

# create a pod from the my-pod.yml file
kubectl apply -f my-pod.yml

# view resources usage by the pods in the cluster
kubectl top pod

# view resource usage by the nodes in the cluster
kubectl top node
```
</p>
</details>

### [CKA Past Exam - 5 pts] Find the pod with label name=cpu-user consuming the most CPU, write its name to a file

> 🔗 [Tasks > Monitoring, Logging, and Debugging > Resource metrics pipeline](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/)

**Task:**

From the pod label `name=cpu-user`, find pods running high CPU workloads and write the name of the pod consuming most CPU to the file `/opt/KUTR00401/KUTR00401.txt` (which already exists).

<details><summary>show</summary>
<p>

```bash
# 1. 列出所有命名空间中带 name=cpu-user 标签的 Pod 及其 CPU 使用
kubectl top pod -A -l name=cpu-user --sort-by=cpu

# 2. 第一个 Pod 就是 CPU 最高的，记录其名称
# 例如输出:
# NAMESPACE   NAME                CPU(cores)   MEMORY(bytes)
# default     cpu-stress-12345    250m         50Mi
# default     cpu-stress-67890    100m         30Mi

# 3. 将 Pod 名称写入指定文件（注意题目要求是覆盖写入，不是追加）
echo "cpu-stress-12345" > /opt/KUTR00401/KUTR00401.txt

# 验证
cat /opt/KUTR00401/KUTR00401.txt

# 一行命令方式（脚本化）:
kubectl top pod -A -l name=cpu-user --sort-by=cpu --no-headers | head -1 | awk '{print $2}' > /opt/KUTR00401/KUTR00401.txt
```

</p>
</details>

---

## 4. Manage and evaluate container output streams

> 📖
> [Concepts > Cluster Administration > Logging Architecture](https://kubernetes.io/docs/concepts/cluster-administration/logging/)
> [Reference > Command line tool (kubectl) > kubectl Quick Reference: Interacting with running Pods](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#interacting-with-running-pods)

### View logs of a running pod and follow the log output in real-time

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Interacting with running Pods](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#interacting-with-running-pods)

<details><summary>show</summary>
<p>

```bash
# create an nginx pod and generate some traffic
kubectl run web --image=nginx
kubectl wait --for=condition=Ready pod/web
kubectl run curl --rm -it --image=busybox -- wget -qO- http://$(kubectl get pod web -o jsonpath='{.status.podIP}')

# view existing logs
kubectl logs web

# follow (stream) logs in real-time
kubectl logs web -f

# show only the last 20 lines
kubectl logs web --tail=20

# show logs from the last 5 minutes
kubectl logs web --since=5m

# include timestamps in log output
kubectl logs web --timestamps
```

</p>
</details>

### View logs of a specific container in a multi-container pod

> 🔗 [Concepts > Cluster Administration > Logging Architecture](https://kubernetes.io/docs/concepts/cluster-administration/logging/)

<details><summary>show</summary>
<p>

```bash
# create a multi-container pod
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: multi-log
spec:
  containers:
  - name: app
    image: busybox
    command: ['sh', '-c', 'while true; do echo "[app] $(date)"; sleep 5; done']
  - name: sidecar
    image: busybox
    command: ['sh', '-c', 'while true; do echo "[sidecar] heartbeat"; sleep 10; done']
EOF

kubectl wait --for=condition=Ready pod/multi-log

# view logs for a specific container
kubectl logs multi-log -c app
kubectl logs multi-log -c sidecar

# view logs from all containers at once
kubectl logs multi-log --all-containers=true

# follow all containers with prefix (显示 pod/container 前缀以区分来源)
kubectl logs multi-log --all-containers=true -f --prefix
```

</p>
</details>

### View logs of a previously crashed container using the --previous flag

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Interacting with running Pods](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#interacting-with-running-pods)

<details><summary>show</summary>
<p>

```bash
# create a pod that will crash and enter CrashLoopBackOff
kubectl run crasher --image=busybox -- sh -c 'echo "starting up..." && echo "fatal error!" && exit 1'

# wait for it to crash and restart
kubectl get pod crasher -w
# STATUS will show CrashLoopBackOff after a few restarts

# current container may have no output yet — use --previous to see the crashed instance
kubectl logs crasher --previous
# expected:
# starting up...
# fatal error!

# --previous 对排查 CrashLoopBackOff 至关重要：
# 当前容器可能刚启动还没有日志，上一个实例的日志才包含错误信息
```

</p>
</details>

### Redirect pod logs to a file and examine container stdout/stderr

> 🔗 [Concepts > Cluster Administration > Logging Architecture](https://kubernetes.io/docs/concepts/cluster-administration/logging/)

<details><summary>show</summary>
<p>

```bash
# create a pod that writes to both stdout and stderr
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: dual-output
spec:
  containers:
  - name: app
    image: busybox
    command: ['sh', '-c', 'echo "info: started" && echo "error: something wrong" >&2 && sleep 3600']
EOF

kubectl wait --for=condition=Ready pod/dual-output

# save logs to a file (kubectl logs captures both stdout and stderr)
kubectl logs dual-output > /tmp/pod-logs.txt
cat /tmp/pod-logs.txt

# Kubernetes 日志架构:
# - 容器应将日志输出到 stdout/stderr
# - kubelet 捕获这些输出并保存到节点上的日志文件
# - kubectl logs 读取的就是 kubelet 保存的这些日志
# - 节点日志路径: /var/log/pods/<namespace>_<pod>_<uid>/<container>/
```

</p>
</details>

### Use label selectors to stream logs from multiple pods simultaneously

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Interacting with running Pods](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#interacting-with-running-pods)

<details><summary>show</summary>
<p>

```bash
# create a deployment with 3 replicas
kubectl create deploy log-test --image=busybox --replicas=3 -- sh -c 'while true; do echo "$(hostname): $(date)"; sleep 5; done'

# wait for all pods to be ready
kubectl rollout status deploy log-test

# view logs from all pods matching a label selector
kubectl logs -l app=log-test

# follow logs from multiple pods (需要增大 max-log-requests)
kubectl logs -l app=log-test -f --max-log-requests=10

# use --prefix to show pod name before each log line
kubectl logs -l app=log-test --prefix

# shorthand: view logs from a deployment's pods
kubectl logs deploy/log-test
```

</p>
</details>

### [CKA Past Exam - 5 pts] Filter foobar pod logs for "unable-access-website" and write matching lines to file

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Interacting with running Pods](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#interacting-with-running-pods)

**Task:**

Monitor the logs of pod `foobar` and:
- Extract log lines corresponding to error `unable-access-website`
- Write them to `/opt/KUTR00101/foobar`

<details><summary>show</summary>
<p>

```bash
# 切换 context
kubectl config use-context k8s

# 过滤包含 "unable-access-website" 的日志行，写入文件
# 注意：题目要求"写入"，使用 > 而不是 >>（避免追加重复内容）
kubectl logs foobar | grep "unable-access-website" > /opt/KUTR00101/foobar

# 验证
cat /opt/KUTR00101/foobar

# 如果 Pod 已重启过，需要包含之前实例的日志:
# kubectl logs foobar --previous | grep "unable-access-website" >> /opt/KUTR00101/foobar
```

</p>
</details>

---

## 5. Troubleshoot services and networking

> 📖
> [Tasks > Monitoring, Logging, and Debugging > Debug Services](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/)
> [Tasks > Administer a Cluster > Debugging DNS Resolution](https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/)

### Create a container named "curlpod2" using "nicolaka/netshoot" image with a shell. Run nslookup on the kubernetes service. Exit, then fix the container so it continues to run.

> 🔗 [Tasks > Administer a Cluster > Debugging DNS Resolution](https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/)

*此为场景练习，无固定答案。关键步骤：`kubectl run curlpod2 --image nicolaka/netshoot -it -- sh`、`nslookup kubernetes`、确保容器有持续运行的 command。*

### Create a deployment and service in namespace "kb6656". Try to reach the nginx application via curl. Find out why the service is not reachable and fix it.

> 🔗 [Tasks > Monitoring, Logging, and Debugging > Debug Services](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/)

*此为场景练习，无固定答案。关键步骤：`kubectl get svc -n kb6656`、`kubectl get endpoints -n kb6656`、检查 service selector 是否匹配 pod labels、检查 targetPort。*

---

## Killer.sh Mock Exam Questions

> 📚 Source PDFs: [`assets/killer-sh/cka-simulator-a-k8s-1.35.pdf`](../assets/killer-sh/cka-simulator-a-k8s-1.35.pdf) | [`assets/killer-sh/cka-simulator-b-k8s-1.35.pdf`](../assets/killer-sh/cka-simulator-b-k8s-1.35.pdf)

### [Killer.sh A-Q7] kubectl top: scripts for node + pod resource usage
> 🔗 [Tasks > Monitoring, Logging, and Debugging > Resource metrics pipeline](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/)
> [Tasks > Monitoring, Logging, and Debugging > Tools for Monitoring Resources](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-usage-monitoring/)
> [Reference > Command line tool (kubectl) > kubectl Quick Reference](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

> 🖥 Solve on: `ssh cka5774`

**Task:**

The metrics-server has been installed in the cluster. Write two bash scripts which use `kubectl`:

1. Script `/opt/course/7/node.sh` should show resource usage of nodes
2. Script `/opt/course/7/pod.sh` should show resource usage of Pods and their containers

**Lab context:**

- Hostname: `cka5774` (controlplane)
- metrics-server is already running so `kubectl top` works
- Target directory `/opt/course/7/` already exists

<details><summary>show</summary>
<p>

```bash
cat > /opt/course/7/node.sh <<EOF
#!/bin/bash
kubectl top node
EOF

cat > /opt/course/7/pod.sh <<EOF
#!/bin/bash
kubectl top pod --containers=true
EOF

chmod +x /opt/course/7/node.sh /opt/course/7/pod.sh

# test
/opt/course/7/node.sh
/opt/course/7/pod.sh
```

</p>
</details>

### [Killer.sh A-Q17] crictl: find Pod's container, dump info + logs
> 🔗 [Tasks > Monitoring, Logging, and Debugging > Debugging Kubernetes Nodes With Crictl](https://kubernetes.io/docs/tasks/debug/debug-cluster/crictl/)

> 🖥 Solve on: `ssh cka2556`

**Task:**

In Namespace `project-tiger` create a Pod named `tigers-reunite` of image `httpd:2-alpine` with labels `pod=container` and `container=pod`. Find out on which node the Pod is scheduled. Ssh into that node and find the containerd container belonging to that Pod.

Using command `crictl`:

1. Write the ID of the container and the `info.runtimeType` into `/opt/course/17/pod-container.txt`
2. Write the logs of the container into `/opt/course/17/pod-container.log`

> ℹ️ You can connect to a worker node using `ssh cka2556-node1` or `ssh cka2556-node2` from `cka2556`

**Lab context:**

- Hostname: `cka2556` (controlplane) — connect to workers via `ssh cka2556-node1` or `ssh cka2556-node2`
- Namespace `project-tiger` already exists
- Target directory `/opt/course/17/` already exists on `cka2556`

<details><summary>show</summary>
<p>

```bash
k -n project-tiger run tigers-reunite --image=httpd:2-alpine \
  --labels="pod=container,container=pod"

k -n project-tiger get pod -o wide
# find NODE column

ssh <node>
sudo -i

# find container ID
crictl ps | grep tigers-reunite
# e.g.  a1b2c3d4...   httpd:2-alpine  ...

# get runtimeType from inspect
crictl inspect <id> | grep runtimeType
# "runtimeType": "io.containerd.runc.v2"

# write to file
echo "<id> io.containerd.runc.v2" > /opt/course/17/pod-container.txt

# logs
crictl logs <id> > /opt/course/17/pod-container.log
```

</p>
</details>

### [Killer.sh B-Q5] kubectl sort: by creationTimestamp and uid
> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Formatting output](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#formatting-output)
> [Reference > Command line tool (kubectl) > kubectl Quick Reference](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

> 🖥 Solve on: `ssh cka8448`

**Task:**

Create two bash script files which use kubectl sorting to:

1. Write a command into `/opt/course/5/find_pods.sh` which lists all Pods in all Namespaces sorted by their AGE (`metadata.creationTimestamp`)
2. Write a command into `/opt/course/5/find_pods_uid.sh` which lists all Pods in all Namespaces sorted by field `metadata.uid`

**Lab context:**

- Hostname: `cka8448` (controlplane)
- Target directory `/opt/course/5/` already exists

<details><summary>show</summary>
<p>

```bash
cat > /opt/course/5/find_pods.sh <<EOF
#!/bin/bash
kubectl get pod -A --sort-by=.metadata.creationTimestamp
EOF

cat > /opt/course/5/find_pods_uid.sh <<EOF
#!/bin/bash
kubectl get pod -A --sort-by=.metadata.uid
EOF

chmod +x /opt/course/5/find_pods.sh /opt/course/5/find_pods_uid.sh
```

</p>
</details>

### [Killer.sh B-Q6] Kubelet: fix broken ExecStart path, then create Pod
> 🔗 [Tasks > Monitoring, Logging, and Debugging > Troubleshoot Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)
> [Setup > Production environment > Bootstrapping clusters with kubeadm > Troubleshooting kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/troubleshooting-kubeadm/)

> 🖥 Solve on: `ssh cka1024`

**Task:**

There seems to be an issue with the kubelet on controlplane node `cka1024`, it's not running.

Fix the kubelet and confirm that the node is available in Ready state.
Create a Pod called `success` in `default` Namespace of image `nginx:1-alpine`.

> ℹ️ The node has no taints and can schedule Pods without additional tolerations

**Lab context:**

- Hostname: `cka1024` (controlplane, single-node cluster) — kube-apiserver is currently unreachable
- `kubelet` is installed at `/usr/bin/kubelet`; systemd unit drop-in at `/usr/lib/systemd/system/kubelet.service.d/10-kubeadm.conf` currently references the wrong binary path `/usr/local/bin/kubelet`

<details><summary>show</summary>
<p>

```bash
ssh cka1024
sudo -i

service kubelet status
# Active: inactive  (or failing)
# ExecStart=/usr/local/bin/kubelet ...   → No such file

# find actual kubelet binary
whereis kubelet
# kubelet: /usr/bin/kubelet

# fix ExecStart path
vi /usr/lib/systemd/system/kubelet.service.d/10-kubeadm.conf
# change: ExecStart=/usr/local/bin/kubelet $KUBELET_KUBECONFIG_ARGS ...
# to:     ExecStart=/usr/bin/kubelet       $KUBELET_KUBECONFIG_ARGS ...

systemctl daemon-reload
systemctl restart kubelet
systemctl status kubelet     # active (running)

exit; exit

k get node                    # cka1024 → Ready
k run success --image=nginx:1-alpine
```

</p>
</details>

### [Killer.sh B-Q9] Scheduler: disable + manually schedule a Pod + restore
> 🔗 [Concepts > Scheduling, Preemption and Eviction > Kubernetes Scheduler](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/)
> [Concepts > Scheduling, Preemption and Eviction > Assigning Pods to Nodes](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/)

> 🖥 Solve on: `ssh cka5248`

**Task:**

Temporarily stop the kube-scheduler, this means in a way that you can start it again afterwards.

Create a single Pod named `manual-schedule` of image `httpd:2-alpine`, confirm it's created but not scheduled on any node.

Now you're the scheduler and have all its power, manually schedule that Pod on node `cka5248`. Make sure it's running.

Start the kube-scheduler again and confirm it's running correctly by creating a second Pod named `manual-schedule2` of image `httpd:2-alpine` and check if it's running on `cka5248-node1`.

**Lab context:**

- Hostname: `cka5248` (controlplane); cluster has nodes `cka5248` (controlplane) and `cka5248-node1` (worker)
- kube-scheduler runs as a static Pod (manifest at `/etc/kubernetes/manifests/kube-scheduler.yaml`)

<details><summary>show</summary>
<p>

```bash
ssh cka5248
sudo -i

# stop scheduler by moving its static pod manifest
cd /etc/kubernetes/manifests/
mv kube-scheduler.yaml ..

exit; exit

# create Pod → stays Pending (no scheduler)
k run manual-schedule --image=httpd:2-alpine
k get pod manual-schedule    # STATUS Pending

# manually schedule by setting spec.nodeName
k get pod manual-schedule -o yaml > 9.yaml
# add to spec:
#   nodeName: cka5248

k replace -f 9.yaml --force
k get pod manual-schedule -o wide   # Running on cka5248

# restore scheduler
ssh cka5248 'sudo mv /etc/kubernetes/kube-scheduler.yaml /etc/kubernetes/manifests/'

# verify scheduler restored
k run manual-schedule2 --image=httpd:2-alpine
k get pod manual-schedule2 -o wide
```

</p>
</details>

### [Killer.sh B-Q15] Events: log script + diff pod-kill vs container-kill
> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)
> [Tasks > Monitoring, Logging, and Debugging > Debugging Kubernetes Nodes With Crictl](https://kubernetes.io/docs/tasks/debug/debug-cluster/crictl/)
> [Reference > Command line tool (kubectl) > kubectl Quick Reference](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

> 🖥 Solve on: `ssh cka6016`

**Task:**

1. Write a kubectl command into `/opt/course/15/cluster_events.sh` which shows the latest events in the whole cluster, ordered by time (`metadata.creationTimestamp`)
2. Delete the kube-proxy Pod and write the events this caused into `/opt/course/15/pod_kill.log` on `cka6016`
3. Manually kill the containerd container of the kube-proxy Pod and write the events into `/opt/course/15/container_kill.log`

**Lab context:**

- Hostname: `cka6016` (controlplane, single-node cluster) — the kube-proxy Pod also runs on this node
- `crictl` is available for container management
- Target directory `/opt/course/15/` already exists

<details><summary>show</summary>
<p>

```bash
cat > /opt/course/15/cluster_events.sh <<EOF
#!/bin/bash
kubectl get events -A --sort-by=.metadata.creationTimestamp
EOF
chmod +x /opt/course/15/cluster_events.sh

# Part 2: delete kube-proxy pod and capture events
POD=$(k -n kube-system get pod -l k8s-app=kube-proxy -o jsonpath='{.items[0].metadata.name}')
NODE=$(k -n kube-system get pod $POD -o jsonpath='{.spec.nodeName}')
k -n kube-system delete pod $POD
sleep 5
/opt/course/15/cluster_events.sh | grep kube-proxy > /opt/course/15/pod_kill.log

# Part 3: manually kill containerd container
POD=$(k -n kube-system get pod -l k8s-app=kube-proxy -o jsonpath='{.items[0].metadata.name}')
ssh $NODE 'sudo crictl ps | grep kube-proxy'
ssh $NODE 'sudo crictl rm --force <container-id>'
sleep 5
/opt/course/15/cluster_events.sh | grep kube-proxy > /opt/course/15/container_kill.log

# difference: deleting Pod → Killing/Scheduling events
#             killing container → BackOff/Started events (Pod stays)
```

</p>
</details>

## KillerCoda Mock Exam Questions

> 📚 Source PDF: [`assets/killercoda/e-troubleshooting.pdf`](../assets/killercoda/e-troubleshooting.pdf)

### [KillerCoda-Q1] nginx-deployment deployment pod not running, fix that issue - 4 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

nginx-deployment deployment pod not running, fix that issue

<details><summary>show</summary>
<p>

```bash
Step 1: edit deployment

kubectl edit deploy nginx-deployment
Step 2: Update From-

      initContainers:
      - command:
        - shell
        - echo 'Welcome To KillerCoda!'
To-

   initContainers:
   - command:
     - sh
     - -c
     - echo 'Welcome To KillerCoda!'
Step 3: Update From-

      volumes:
       - name: nginx-config
         configMap:
          name: nginx-configuration

To-

      volumes:
       - name: nginx-config
         configMap:
          name: nginx-configmap
```

</p>
</details>

### [KillerCoda-Q2] hello-kubernetes pod not running, fix that issue - 2 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

hello-kubernetes pod not running, fix that issue

<details><summary>show</summary>
<p>

```bash
Step 1: edit pod

kubectl edit pod hello-kubernetes
Step 2: Update From-

 containers:
 - command:
   - shell
   - -c
   - while true; do echo 'Hello Kubernetes'; sleep 5; done

To-

 containers:
 - command:
   - sh
   - -c
   - while true; do echo 'Hello Kubernetes'; sleep 5; done
     initContainers:
Step 3: recreate new pod

kubectl replace -f /tmp/kubectl-edit-2019355827.yaml --force
```

</p>
</details>

### [KillerCoda-Q3] nginx-pod pod not running, fix that issue - 2 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

nginx-pod pod not running, fix that issue

<details><summary>show</summary>
<p>

```bash
Step 1: edit pod

kubectl edit pod nginx-pod
Step 2: Update From-

 - image: nginx:ltest

To-

 - image: nginx:latest
```

</p>
</details>

### [KillerCoda-Q4] redis-pod pod not running, fix that issue - 8 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

redis-pod pod not running, fix that issue

<details><summary>show</summary>
<p>

```bash
Step 1: describe pod

kubectl describe pod redis-pod
o/p:- Events:

  Warning FailedScheduling 16s default-scheduler 0/2 nodes are available: persistentvolumeclaim
"pvc-redis" not found. preemption: 0/2 nodes are available: 2 No preemption victims found for
incoming pod..
"pvc-redis" not found so check the correct name of pvc
Step 2: kubectl get pvc

o/p:- NAME       STATUS      VOLUME CAPACITY ACCESS MODES STORAGECLASS AGE

redis-pvc Pending                           manually     23s

"redis-pvc" is correct name so update pod
Step 3: kubectl edit pod redis-pod From-      claimName: pvc-redis To-    claimName: redis-pvc

And kubectl replace -f /tmp/kubectl-edit-2970798863.yaml --force

Still the pod is in pending state

Step 4: describe pod

kubectl describe pod redis-pod
o/p:- Events:

 Warning FailedScheduling 13s default-scheduler 0/2 nodes are available: pod has unbound
immediate PersistentVolumeClaims. preemption: 0/2 nodes are available: 2 No preemption victims
found for incoming pod..

Check why "redis-pvc" is is unbound state
Step 5: describe pvc

kubectl describe pvc redis-pvc
o/p:- Events:

 Warning ProvisioningFailed 14s (x12 over 2m58s) persistentvolume-controller
storageclass.storage.k8s.io "manually" not found

We can observe here, given storage class name is “manually” instead of “manual” so update pvc
Step 6: kubectl edit pvc redis-pvc

From-       storageClassName: manually To-          storageClassName: manual

kubectl replace -f /tmp/kubectl-edit-2018407739.yaml --force

Check pvc status now, kubectl get pvc

o/p:- NAME       STATUS VOLUME          CAPACITY ACCESS MODES STORAGECLASS AGE

redis-pvc Bound      redis-pv 100Mi     RWO            manual    3s

Now it’s in Bound state, and check pod status now
Step 7: still pod is in pending state

kubectl describe pod redis-pod
o/p:- Events:

 Warning Failed         14s            kubelet         Failed to pull image "redis:latested": rpc error:
code = NotFound desc = failed to pull and unpack image "docker.io/library/redis:latested": failed to
resolve reference "docker.io/library/redis:latested": docker.io/library/redis:latested: not found

We can observe here image name “redis:latested” instead “redis:latest”, so edit pod again

Step 8: kubectl edit pod redis-pod

From- image: redis:latested To- image: redis:latest

Step 9: Check the pod status now kubectl get pod, TADA Now it’s Running
```

</p>
</details>

### [KillerCoda-Q5] frontend pod is in Pending state, not running, fix that issue - 4 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

frontend pod is in Pending state, not running, fix that issue

Note: Don't remove any specification in frontend pod

<details><summary>show</summary>
<p>

```bash
Step 1: Let check why pod is in Pending state

kubectl describe pod frontend

o/p:- Events:

 Warning FailedScheduling 18s default-scheduler 0/2 nodes are available: 1 node(s) didn't match
Pod's node affinity/selector, 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }.
preemption: 0/2 nodes are available: 2 Preemption is not helpful for scheduling..

Looks like node affinity or toleration configured on nodes, let’s check pod yaml

Step 2: kubectl get pod frontend -o yaml

Here, observer node affinity

 affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
       - matchExpressions:
           - key: NodeName
          operator: In
          values:
           - frontend
Step 3: now check node labels, kubectl get nodes –show-labels

O/p: - observe, labels NodeName=frontendnodes configured on node01 but in pod we saw key-value
NodeName is frontend ,not frontendnodes so let’s update pod

kubectl edit pod redis-pod

From-      - frontend To-       - frontendnodes

kubectl replace -f /tmp/kubectl-edit-2018407739.yaml --force

Check pod status now kubectl get pod now it’s Running
```

</p>
</details>

### [KillerCoda-Q6] postgres-pod.yaml is there, currently not able to deploy pod. check and fix that - 4 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

postgres-pod.yaml is there, currently not able to deploy pod. check and fix that
issue

Note: Don't remove any specification in postgres-pod

<details><summary>show</summary>
<p>

```bash
Step 1: replace From-

       tcpSocket:
         command:
          arg: 5432
To-

       tcpSocket:
         port: 5432
AND

      readinessProbe:
       exec:
        cmd:
To-

    readinessProbe:
     exec:
      command:
```

</p>
</details>

### [KillerCoda-Q7] something wrong in redis-pod.yaml pod template, fix that issue - 5 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

something wrong in redis-pod.yaml pod template, fix that issue

Note: Don't remove any specification

<details><summary>show</summary>
<p>

```bash
Step 1: replace From-

      resources:
       requests:
         memory: "150Mi"
         cpu: "15m"
       limits:
         memory: "100Mi"
         cpu: "10m"

To-

      resources:
       requests:
         memory: "100Mi"
         cpu: "10m"
       limits:
         memory: "100Mi"
         cpu: "10m"

Run kubectl apply -f redis-pod.yaml
```

</p>
</details>

### [KillerCoda-Q8] my-pod-cka pod is stuck in a Pending state, Fix this issue - 4 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

my-pod-cka pod is stuck in a Pending state, Fix this issue

Note: Don't remove any specification

<details><summary>show</summary>
<p>

```bash
Step 1: Check why Pod is in Pending state

kubectl describe po my-pod-cka
O/p:- Events:
 Warning FailedScheduling 111s default-scheduler 0/2 nodes are available: pod has unbound
immediate PersistentVolumeClaims. preemption: 0/2 nodes are available: 2 No preemption victims
found for incoming pod..

Looks like pvc is in unbound state,

Step 2: Let’s check pv and pvc

kubectl get pv,pvc
kubectl describe pv,pvc
pv is in ReadWriteOnce mode and pvc is in ReadWriteMany mode

Step 3: Let’s edit pvc kubectl edit pvc my-pvc-cka

Replace From- - ReadWriteMany To- - ReadWriteOnce

And run kubectl replace -f /tmp/kubectl-edit-283826204.yaml --force
```

</p>
</details>

### [KillerCoda-Q9] just tainted node node01 , update tolerations in this application-deployment.yam - 4 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

just tainted node node01 , update tolerations in this application-deployment.yaml
pod template and create pod object

Note: Don't remove any specification

<details><summary>show</summary>
<p>

```bash
Step 1: Check taint on node01

kubectl describe node node01 | grep -i taint
Step 2: Update tolerations in application-deployment.yaml

 tolerations:
  - key: "nodeName"
    operator: "Equal"
    value: "workerNode01"
    effect: "NoSchedule"
Run kubectl apply -f application-deployment.yaml

Check pod status kubectl get pod
```

</p>
</details>

### [KillerCoda-Q10] some issue on the controlplane unable to run kubectl commands (EX: kubectl get - 2 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

some issue on the controlplane unable to run kubectl commands (EX: kubectl get
node)

<details><summary>show</summary>
<p>

```bash
Let’s try once kubectl get node

Threw:- Unable to connect to the server: dial tcp: address 644333: invalid portbect

Looks like wrong port given in kubernetes config file, let edit

vi .kube/config

Replace From- https://172.30.1.2:644333 To- https://172.30.1.2:6443

try again kubectl get node
```

</p>
</details>

### [KillerCoda-Q12] nginx-pod exposed to service nginx-service  - 4 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

nginx-pod exposed to service nginx-service ,

when port-forwarded kubectl port-forward svc/nginx-service 8080:80 it is stuck, so
unable to access application curl http://localhost:8080

fix this issue

<details><summary>show</summary>
<p>

```bash
labels not set to pod so add labels which is used in service app: nginx-pod

kubectl edit po nginx-pod

Add

   labels:

   app: nginx-pod
And try now kubectl port-forward svc/nginx-service 8080:80 and curl http://localhost:8080
```

</p>
</details>

### [KillerCoda-Q13] In controlplane node, something problem with kubelet configuration files, fix th - 4 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

In controlplane node, something problem with kubelet configuration files, fix that
issue

You can ssh controlplane

<details><summary>show</summary>
<p>

```bash
Step 1: Check kubelet service running or not

systemctl status kubelet.service
It not running, looks like problem with configuration file only as mentioned in question

Step 2: Check /var/lib/kubelet/config.yaml
looks like problem with this

clientCAFile: /etc/kubernetes/pki/CA.CERTIFICATE
Change it to clientCAFile: /etc/kubernetes/pki/ca.crt

Step 3: Check /etc/kubernetes/kubelet.conf

Change it from server: https://172.30.1.2:64433333 to server: https://172.30.1.2:6443

Step 4: Use the following command to reload the kubelet service:

systemctl daemon-reload
Step 5: Restart the kubelet service: To ensure that the updated configurations take effect, restart the
kubelet service:

systemctl restart kubelet.service

Check kubelet service status again

systemctl status kubelet.service
```

</p>
</details>

### [KillerCoda-Q14] stream-deployment deployment is not up to date. observed 0 under the - 2 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

stream-deployment deployment is not up to date. observed 0 under the
UP-TO-DATE it should be 1 , Troubleshoot, fix the issue and make sure
deployment is up to date.

<details><summary>show</summary>
<p>

```bash
Step 1: Check deployment kubectl get deploy

Looks like scaled down to 0

Step 1: scale up to 1 kubectl scale deploy stream-deployment --replicas=1
```

</p>
</details>

### [KillerCoda-Q15] database-deployment deployment pods are not running, fix that issue - 8 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

database-deployment deployment pods are not running, fix that issue

<details><summary>show</summary>
<p>

```bash
Step 1: describe deployment pods to check reason kubectl describe pod
database-deployment-69799d647c-hsnsx

O/p:- Events:

  Warning FailedScheduling 73s default-scheduler 0/2 nodes are available: persistentvolumeclaim
"postgres-db-pvc" not found. preemption: 0/2 nodes are available: 2 No preemption victims found for
incoming pod..

Looks like “postgres-db-pvc” not there, check pvc kubectl get pvc

O/p:- NAME             STATUS   VOLUME CAPACITY ACCESS MODES STORAGECLASS AGE

postgres-pvc Pending                            local-path   4m12s

now we got correct pvc name “postgres-pvc” and we also observed it is in Pending state

Step 2: describe pvc to check reason kubectl describe pvc postgres-pvc

O/p:- Normal WaitForFirstConsumer 5s (x24 over 5m50s) persistentvolume-controller waiting for
first consumer to be created before binding

Step 3: something problem with pvc, dig more get yaml of both pv and pvc

kubectl get pv postgres-pv -o yaml

kubectl get pvc postgres-pvc -o yaml

Yes, we got it in pv

 accessModes:
 - ReadWriteOnce
 capacity:
   storage: 100Mi
But in pvc

 accessModes:
 - ReadWriteMany
 resources:
   requests:
    storage: 150Mi
Step 3: lets correct pvc kubectl edit pvc postgres-pvc

From- - ReadWriteMany To- - ReadWriteOnce

From-      storage: 150Mi To-     storage: 100Mi

And run kubectl replace -f /tmp/kubectl-edit-2231088049.yaml --force

And now check pvc status kubectl get pvc its in Bound state

Step 4: lets edit deployment now From- claimName: postgres-db-pvc To- claimName: postgres-pvc

Check the pod status again kubectl get pod now it’s Running
Weight : 6

16) For this question, please set this context (In exam, diff cluster name)

kubectl config use-context kubernetes-admin@kubernetes

video-app deployment replicas 0. fix this issue

expected: 2 replicas

Solution:- Step 1: check pod kubectl get pod no pods. check deployment kubectl get deploy

Step 2: let’s describe deploy kubectl describe deploy video-app

O/p: Events:             <none>

Step 3: looks like something problem with control plane components

kubectl get pods -A

kube-controller-manager-controlplane pod is in CrashLoopBackOff state lets dig more

kubectl describe pod kube-controller-manager-controlplane -n kube-system

O/p:- Warning Failed 21s (x4 over 79s) kubelet Error: failed to create containerd task: failed to
create shim task: OCI runtime create failed: runc create failed: unable to start container process:
exec: "kube-controller-manegaar": executable file not found in $PATH: unknown

Observered error:- exec: "kube-controller-manegaar" , it should be "kube-controller-manager"

Step 4: let’s edit "kube-controller-manager" static pod yaml file

vi /etc/kubernetes/manifests/kube-controller-manager.yaml
Step 5: let’s wait for some time both "kube-controller-manager" static pod and “video-app” deployment
pods will come up
```

</p>
</details>

### [KillerCoda-Q17] red-pod , green-pod , blue-pod pods are running, and red-pod exposed within the - 4 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

red-pod , green-pod , blue-pod pods are running, and red-pod exposed within the cluster using
red-service service. and network policy applied on red-pod pod. problem is now the pod
red-pod is accessible from both green-pod and blue-pod pods. fix the issue that green-pod only
can able access red-pod pod.

<details><summary>show</summary>
<p>

```bash
Step 1: check network policy yaml kubectl get netpol allow-green-and-blue -o yaml

 spec:
  ingress:
  - from:
    - podSelector:
       matchLabels:
        run: green-pod
    - podSelector:
       matchLabels:
        run: blue-pod
Here, we can observe, this allowed traffic from both green-pod and blue-pod.

As per the question request, we need to remove traffic from blue-pod, remove below piece of code by
running kubectl edit netpol allow-green-and-blue

   - podSelector:
      matchLabels:
        run: blue-pod
```

</p>
</details>

### [KillerCoda-Q18] kubelet service not running in controlplane , it will cause the controlplane in - 4 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

kubelet service not running in controlplane , it will cause the controlplane in
NotReady state, so fix this issue

<details><summary>show</summary>
<p>

```bash
let’s start the kubelet service: systemctl start kubelet.service

Check status now systemctl status kubelet.service
```

</p>
</details>

### [KillerCoda-Q19] when you run kubectl get nodes OR kubectl get pod -A threw :- The connection - 5 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

when you run kubectl get nodes OR kubectl get pod -A threw :- The connection
to the server 172.30.1.2:6443 was refused - did you specify the right host or
port?

     - need to wait for few seconds to make above command work again but
       above error will come again after few second

Expectation: kube-apiserver-controlplane pods running in kube-system
namespace

You can ssh controlplane

<details><summary>show</summary>
<p>

```bash
Step 1: Let’s try to run kubectl get nodes

O/p: The connection to the server 172.30.1.2:6443 was refused - did you specify the right host or
port?

We know api server used to communication with cluster so something problem in API

Step 2: Let’s check api static pod status kubectl describe po kube-apiserver-controlplane -n
kube-system

O/p: Warning Unhealthy 3m45s (x55 over 13m) kubelet Startup probe failed: Get
"https://172.30.1.2:6433/livez": dial tcp 172.30.1.2:6433: connect: connection refused

Observe here, probe port is not correct 6433, it should be 6443

Step 3: Let’s update probe port in api static pod yaml vi
/etc/kubernetes/manifests/kube-apiserver.yaml

  livenessProbe:
    failureThreshold: 8
    httpGet:
      host: 172.30.1.2
      path: /livez
      port: 6443
      scheme: HTTPS
    initialDelaySeconds: 10
    periodSeconds: 10
    timeoutSeconds: 15
  name: kube-apiserver
  readinessProbe:
    failureThreshold: 3
    httpGet:
      host: 172.30.1.2
      path: /readyz
      port: 6443
      scheme: HTTPS
    periodSeconds: 1
    timeoutSeconds: 15
  startupProbe:
    failureThreshold: 24
    httpGet:
      host: 172.30.1.2
      path: /livez
      port: 6443
      scheme: HTTPS
    initialDelaySeconds: 10
    periodSeconds: 10
    timeoutSeconds: 15

Step 4: wait for sometime(sometime more time), pod will come up
Weight : 4

20) For this question, please set this context (In exam, diff cluster name)

kubectl config use-context kubernetes-admin@kubernetes

postgres-deployment deployment pods are not running, fix that issue

Solution:-

Step 1: describe deployment pods to check reason kubectl describe pod
postgres-deployment-6cc57cb67b-lqg9d

O/p:- Events:

 Warning Failed               4s          kubelet        Error: configmap "postgres-db-config" not
found

Looks like “postgres-db-config” not there, check configmap kubectl get cm

O/p:- NAME              DATA AGE

kube-root-ca.crt 1      17d

postgres-config   2     2m34s

now we got correct configmap name “postgres-config”

Step 2: edit deployment kubectl edit deploy postgres-deployment

To-

      - name: POSTGRES_DB

      valueFrom:
       configMapKeyRef:
        key: POSTGRES_DB
        name: postgres-config
    - name: POSTGRES_USER
      valueFrom:
       configMapKeyRef:
        key: POSTGRES_USER
        name: postgres-config
check deployment new pod again kubectl get pods

Looks like still not coming up, dig more kubectl describe po postgres-deployment-54dc976c54-56lxv

O/p:- Events:

 Warning Failed       7s (x7 over 101s) kubelet       Error: secret "postgres-db-secret" not found

Looks like “postgres-db-secret” not there, check secret kubectl get secret

O/p:- NAME             TYPE     DATA AGE
postgres-secret Opaque 1                  8m27s

now we got correct configmap name “postgres-secret”

Step 3: again edit deployment kubectl edit deploy postgres-deployment

Check pod status now kubectl get pods , Yes Running now
```

</p>
</details>

### [KillerCoda-Q21] frontend-deployment.yaml deployment template is there, try to deploy, if there i - 2 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

frontend-deployment.yaml deployment template is there, try to deploy, if there is any issue fix
that

<details><summary>show</summary>
<p>

```bash
yaml looks fine let’s try to apply

kubectl apply -f frontend-deployment.yaml

O/p:- Error from server (NotFound): error when creating "frontend-deployment.yaml": namespaces
"nginx-ns" not found

Looks like there;s no nginx-ns namespace, let create kubectl create ns nginx-ns

Try again kubectl apply -f frontend-deployment.yaml

Check pods status kubectl get po -n nginx-ns , Yes Running now
```

</p>
</details>

### [KillerCoda-Q22] my-pvc Persistent Volume Claim is stuck in a Pending state, fix this issue, make - 4 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

my-pvc Persistent Volume Claim is stuck in a Pending state, fix this issue, make
sure it is in Bound state

<details><summary>show</summary>
<p>

```bash
let’s check pv and pvc yaml

Step 1: let’s check pv and pvc yam

kubectl get pv my-pv -o yaml

kubectl get pvc my-pvc -o yaml

Yes, we got it in pv

   accessModes:
   - ReadWriteOnce
   capacity:
     storage: 100Mi

But in pvc

  accessModes:
  - ReadWriteMany
  resources:
    requests:
     storage: 150Mi
Step 2: lets correct pvc kubectl edit pvc my-pvc

From- - ReadWriteMany To- - ReadWriteOnce

From-        storage: 150Mi To-            storage: 100Mi

And run kubectl replace -f /tmp/kubectl-edit-3333632057.yaml --force

check pvc status now kubectl get pvc , Yes its Bound now
```

</p>
</details>

### [KillerCoda-Q23] cka-pod pod exposed internally within the service name cka-service and for - 6 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

cka-pod pod exposed internally within the service name cka-service and for
cka-pod monitor(access through svc) purpose deployed cka-cronjob cronjob that
run every minute .

Now cka-cronjob cronjob not working as expected, fix that issue

<details><summary>show</summary>
<p>

```bash
Step 1: first check whether svc accessing pod or not

kubectl port-forward service/cka-service 8080:80

Looks like stuck

Step 2: first check pod and service yaml

kubectl get pod cka-pod -o yaml

kubectl get svc cka-service -o yaml

Observe, label not added to pod that’s why port-forward stuck, let update pod

kubectl edit pod cka-pod
Add this under metadata

 labels:
   app: cka-pod
Try again kubectl port-forward service/cka-service 8080:80

Yes its working now

Step 3: let’s check cronjob yaml why its failing to monitor and it should run every minute

kubectl get cronjobs cka-cronjob -o yaml

schedule: '* * * * *' wrong schedule

Observe, accessing pod instead service

      containers:
      - command:
        - curl
        - cka-pod
Step 4: lets edit kubectl edit cronjobs cka-cronjob

To-

schedule: '*/1 * * * *' and

      containers:
      - command:
        - curl
        - cka-service
```

</p>
</details>

### [KillerCoda-Q24] You have a service account named dev-sa , a Role named dev-role-cka , and a - 4 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

You have a service account named dev-sa , a Role named dev-role-cka , and a
RoleBinding named dev-role-binding-cka . we are trying to create list and get
the pods and services . However, using dev-sa service account is not able to
perform these operations. fix this issue.

<details><summary>show</summary>
<p>

```bash
Step 1: check role yaml kubectl get role dev-role-cka -o yaml

Now permission given to

  resources:
  - secrets
  verbs:
  - get
Update to- kubectl edit role dev-role-cka
 resources:
 - pods
 - services
 verbs:
 - get
 - create
 - list
```

</p>
</details>

### [KillerCoda-Q25] You have a service account named prod-sa , a Role named prod-role-cka , and a - 4 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

You have a service account named prod-sa , a Role named prod-role-cka , and a
RoleBinding named prod-role-binding-cka . we are trying to create list and get
the services . However, using prod-sa service account is not able to perform
these operations. fix this issue.

<details><summary>show</summary>
<p>

```bash
Step 1: check role yaml kubectl get role prod-role-cka -o yaml

Now permission given to

  resources:
  - pods
  verbs:
  - list
Update to- kubectl edit role prod-role-cka

 resources:
 - services
 verbs:
 - get
 - create
 - list
```

</p>
</details>

### [KillerCoda-Q26] cache-daemonset DaemonSet deployed, now it's not creating any pod on the - 5 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

cache-daemonset DaemonSet deployed, now it's not creating any pod on the
controlplane node. fix this issue and make sure the pods are getting created on
all nodes including the controlplane node as well.

<details><summary>show</summary>
<p>

```bash
Step 1: check pods are assigned which node

kubectl get po -o wide | grep cache-daemonset

O/p:- cache-daemonset-fhdmq 1/1                   Running 0               52s 192.168.1.3 node01 <none>
<none>

Pods in only node01

Step 2: let get taint on controlplane node and add toleration to daemonset

kubectl describe node controlplane | grep -i taint

Step 3: let edit daemonset kubectl edit ds cache-daemonset

Add this under container section

   tolerations:
    - key: node-role.kubernetes.io/control-plane
      effect: NoSchedule
Check pod again kubectl get pods -o wide
```

</p>
</details>

### [KillerCoda-Q27] something is not working at the moment on controlplane node(Cause NotReady - 5 pts

> 🔗 [Tasks > Monitoring, Logging, and Debugging](https://kubernetes.io/docs/tasks/debug/)

**Task:**

something is not working at the moment on controlplane node(Cause NotReady
state), check that and etcd-controlplane pod is running in kube-system
environment, take backup and store it in /opt/cluster_backup.db file, and also
store backup console output store it in backup.txt

ssh controlplane

<details><summary>show</summary>
<p>

```bash
Step 1: check kubelet service status systemctl status kubelet.service

Not running so systemctl start kubelet.service

Step 1: Take backup

etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt
--cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key snapshot save
/opt/cluster_backup.db
Step 2: Save console o/p in a file backup.txt
```

</p>
</details>

