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

> 📖 [Troubleshooting Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/) · [Troubleshooting Applications](https://kubernetes.io/docs/tasks/debug/debug-application/)

### In cluster "ik8s", in a namespace named "db08328", create a deployment named "mysql" with the image "mysql:8". List the pods to see if the pod is running. If not, view the logs and fix the pod.

> 🔗 [Troubleshooting Applications](https://kubernetes.io/docs/tasks/debug/debug-application/)

*此为场景练习，无固定答案。关键步骤：`kubectl logs`、`kubectl describe po`、检查环境变量 `MYSQL_ROOT_PASSWORD` 是否设置。*

### Run the command `k run testbox --image busybox --command 'sleep 3600'` to create a new pod named "testbox". See if the container is running or not. Go through the decision tree to find out why and fix the pod so that it's running.

> 🔗 [Troubleshooting Applications](https://kubernetes.io/docs/tasks/debug/debug-application/)

*此为场景练习，无固定答案。关键步骤：`kubectl describe po`、`kubectl logs`、检查 command 语法。*

### Create a new container named "busybox2" that uses the image "busybox:1.35.0". Check if the container is in a running state. Find out why the container is failing and make the corrections to get it to a running state.

> 🔗 [Troubleshooting Applications](https://kubernetes.io/docs/tasks/debug/debug-application/)

*此为场景练习，无固定答案。关键步骤：`kubectl describe po`、`kubectl logs`、确保容器有持续运行的 command。*

### Run the command to simulate a kubelet config break, then check the status of kubelet and troubleshoot to resolve the problem with the kubelet service.

> 🔗 [Troubleshooting Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)

*此为场景练习，无固定答案。关键步骤：`systemctl status kubelet`、`journalctl -u kubelet`、检查 `/etc/systemd/system/kubelet.service.d/10-kubeadm.conf` 配置。*

---

## 2. Troubleshoot cluster components

> 📖 [Troubleshooting Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/) · [Debugging Kubernetes Nodes With Crictl](https://kubernetes.io/docs/tasks/debug/debug-cluster/crictl/)

### Simulate a kube-scheduler failure: create a deployment, then break the scheduler. Scale the deployment and fix the scheduler so pods can be scheduled again.

> 🔗 [Troubleshooting Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)

*此为场景练习，无固定答案。关键步骤：检查 `/etc/kubernetes/manifests/kube-scheduler.yaml`、`kubectl get po -n kube-system`、`kubectl describe po kube-scheduler -n kube-system`。*

### Move kube-scheduler.yaml out of manifests directory. Create a pod and determine why it's not starting. Fix the scheduler to get the pod running.

> 🔗 [Troubleshooting Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)

*此为场景练习，无固定答案。关键步骤：检查 `kubectl get events`、确认 `/etc/kubernetes/manifests/kube-scheduler.yaml` 是否存在、恢复该文件。*

### Insert a bug in the kube-proxy configmap, then fix the kube-proxy pod to get it back to a running state.

> 🔗 [Troubleshooting Clusters](https://kubernetes.io/docs/tasks/debug/debug-cluster/)

*此为场景练习，无固定答案。关键步骤：`kubectl logs kube-proxy -n kube-system`、`kubectl edit cm kube-proxy -n kube-system`、`kubectl delete po kube-proxy -n kube-system`。*

---

## 3. Monitor cluster and application resource usage

> 📖 [Resource metrics pipeline](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/) · [Tools for Monitoring Resources](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-usage-monitoring/)

### Install the metrics server add-on and view resource usage by a pods and nodes in the cluster

> 🔗 [Resource metrics pipeline](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/)

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

---

## 4. Manage and evaluate container output streams

> 📖 [Logging Architecture](https://kubernetes.io/docs/concepts/cluster-administration/logging/) · [kubectl Cheat Sheet - Interacting with running Pods](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#interacting-with-running-pods)

*原文档暂无此考点的练习。*

---

## 5. Troubleshoot services and networking

> 📖 [Debug Services](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/) · [Debugging DNS Resolution](https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/)

### Create a container named "curlpod2" using "nicolaka/netshoot" image with a shell. Run nslookup on the kubernetes service. Exit, then fix the container so it continues to run.

> 🔗 [Debugging DNS Resolution](https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/)

*此为场景练习，无固定答案。关键步骤：`kubectl run curlpod2 --image nicolaka/netshoot -it -- sh`、`nslookup kubernetes`、确保容器有持续运行的 command。*

### Create a deployment and service in namespace "kb6656". Try to reach the nginx application via curl. Find out why the service is not reachable and fix it.

> 🔗 [Debug Services](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/)

*此为场景练习，无固定答案。关键步骤：`kubectl get svc -n kb6656`、`kubectl get endpoints -n kb6656`、检查 service selector 是否匹配 pod labels、检查 targetPort。*
