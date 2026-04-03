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

*原文档暂无此考点的练习。*

---

## 4. Understand the primitives used to create robust, self-healing, application deployments

> 📖
> [Concepts > Workloads > Workload Management > ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)
> [Concepts > Workloads > Workload Management > Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
> [Concepts > Workloads > Workload Management > DaemonSets](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/)

*原文档暂无此考点的练习。*

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
