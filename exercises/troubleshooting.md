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

### [CKA 真题 - 13分] Restore wk8s-node-0 from NotReady status, ensure kubelet persists across reboot

> 🔗 [Tasks > Monitoring, Logging, and Debugging > Troubleshoot Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)

**题目:**
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

### [CKA 真题 - 5分] Find the pod with label name=cpu-user consuming the most CPU, write its name to a file

> 🔗 [Tasks > Monitoring, Logging, and Debugging > Resource metrics pipeline](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/)

**题目:**
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

### [CKA 真题 - 5分] Filter foobar pod logs for "unable-access-website" and write matching lines to file

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Interacting with running Pods](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#interacting-with-running-pods)

**题目:**
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

> 📚 Source PDFs: [`assets/CKA Simulator A Kubernetes 1.35 - Killer Shell.pdf`](../assets/CKA%20Simulator%20A%20Kubernetes%201.35%20-%20Killer%20Shell.pdf) | [`assets/CKA Simulator B Kubernetes 1.35 - Killer Shell.pdf`](../assets/CKA%20Simulator%20B%20Kubernetes%201.35%20-%20Killer%20Shell.pdf)

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
