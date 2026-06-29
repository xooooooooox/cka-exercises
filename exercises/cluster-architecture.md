# Cluster Architecture, Installation and Configuration (25%)

> CKA Curriculum v1.35 — [cncf/curriculum](https://github.com/cncf/curriculum)

## Key points of this chapter

- Manage role based access control (RBAC)
- Prepare underlying infrastructure for installing a Kubernetes cluster
- Create and manage Kubernetes clusters using kubeadm
- Manage the lifecycle of Kubernetes clusters
- Implement and configure a highly-available control plane
- Use Helm and Kustomize to install cluster components
- Understand extension interfaces (CNI, CSI, CRI, etc.)
- Understand CRDs, install and configure operators

---

## 1. Manage role based access control (RBAC)

> 📖  
> [Reference > API Access Control > Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)  
> [Reference > API Access Control > Certificate Signing Requests](https://kubernetes.io/docs/reference/access-authn-authz/certificate-signing-requests/)  
> [Tasks > Access Application in a Cluster > Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)  
> [Tasks > Configure Pods and Containers > Configure Service Accounts for Pods](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/)

### View the client certificate that the kubelet uses to authenticate to the Kubernetes API

> 🔗
> [Getting started > Best practices > PKI certificates and requirements](https://kubernetes.io/docs/setup/best-practices/certificates/)
> [Reference > API Access Control > TLS bootstrapping](https://kubernetes.io/docs/reference/access-authn-authz/kubelet-tls-bootstrapping/)

<details><summary>show</summary>
<p>

```bash
# The kubelet's client certificate is named `kubelet-client-current.pem` and is stored locally on the control plane node
# on the cka exam, make sure to ssh to the control plane node first
ls /var/lib/kubelet/pki/

# view the certificate file `kubelet-client-current.pem` with openssl CLI
openssl x509 -in /var/lib/kubelet/pki/kubelet-client-current.pem -text -noout
```

</p>
</details>

### Create a new user named "Sandra", first creating the private key, then the certificate signing request, then using the CSR resource in Kubernetes to generate the client certificate.

> 🔗 [Reference > API Access Control > Certificates and Certificate Signing Requests](https://kubernetes.io/docs/reference/access-authn-authz/certificate-signing-requests/)
> 🔗 [Reference > API Access Control > Authentication](https://kubernetes.io/docs/reference/access-authn-authz/authentication/)

<details><summary>show</summary>
<p>

```bash
# create a private key using openssl with 2048-bit encryption
openssl genrsa -out sandra.key 2048

# create a certificate signing request to give to the Kubernetes API
openssl req -new -key sandra.key -subj "/CN=sandra" -out sandra.csr

# store the file `sandra.csr` in an environment variable named "REQUEST"
export REQUEST=$(cat sandra.csr | base64)

# create the CSR as a Kubernetes resource
cat <<EOF | kubectl apply -f -
apiVersion: certificates.k8s.io/v1
kind: CertificateSigningRequest
metadata:
  name: sandra
spec:
  request: $REQUEST
  signerName: kubernetes.io/kube-apiserver-client
  usages:
  - client auth
EOF

# approve the csr resource
k certificate approve sandra

# extract the client certificate from the approved csr
k get csr sandra -o jsonpath='{.status.certificate}' | base64 -d > sandra.crt

```

> 💡 **Verify (optional)**:
```bash
# list the requests in the Kubernetes cluster
k get csr
```

[Try this in Killercoda's Kubernetes Lab Environment](https://killercoda.com/chadmcrowell/course/cka/kubernetes-create-user)

</p>
</details>

### Add that new user `sandra` to your local kubeconfig using the kubectl config command

> 🔗 [Tasks > Access Application in a Cluster > Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)

<details><summary>show</summary>
<p>

```bash
# set the credentials in your existing kubeconfig (~.kube/config)
k config set-credentials carlton --client-key=sandra.key --client-certificate=sandra.crt --embed-certs

# view the kubeconfig to see sandra added
k config view

# get your current context
k config get-contexts

# set the context for sandra
k config set-context sandra --user=sandra --cluster=kubernetes

# switch to using the `sandra` context
kubectl config use-context sandra
```

</p>
</details>

### Create a role the will allow users to get, watch, and list pods and container logs

> 🔗 [Reference > API Access Control > Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

<details><summary>show</summary>
<p>

Create a role just using the kubectl command line

```bash
# create a role using `kubectl create role -h` for help
kubectl create role pod-reader --verb=get,watch,list --resource=pods,pods/log
```

Create a role from a YAML file named `role.yaml`

```bash
# create a file named role.yml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: default
  name: pod-reader
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log"]
  verbs: ["get", "watch", "list"]

# create the role
kubectl apply -f role.yml

# EXTRA CREDIT: After you've created the role binding, use `kubectl auth can-i..` to test the role

```

</p>
</details>

### Create a role binding that binds to a role named pod-reader, applies to a user named `dev`

> 🔗 [Reference > API Access Control > Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

<details><summary>show</summary>
<p>

```bash
# create a file named role-binding.yml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-reader
  namespace: default
subjects:
- kind: User
  name: dev
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io

# create the role binding from YAML
kubectl create -f role-binding.yaml
```

Test the role binding using `kubectl auth can-i`

```bash
# see if the user "dev" can list pods
kubectl auth can-i get pods --namespace=default --as=dev

# see if the user "dev" can view pod logs
kubectl auth can-i get pods/log --namespace=default --as=dev

# check that the user "dev" cannot create pods
kubectl auth can-i create pods --namespace=default --as=dev

```

</p>
</details>

### Create a new role named `sa-creator` that will allow creating service accounts.

> 🔗 [Reference > API Access Control > Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

<details><summary>show</summary>
<p>

```bash
# use kubectl to create the role, with the help of `kubectl create role -h`
kubectl create role sa-creator --verb=create --resource=sa
```

</p>
</details>

### Create a role binding that is associated with the previous `sa-creator` role, named `sa-creator-binding` that will bind to the user `sandra`

> 🔗 [Reference > API Access Control > Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

<details><summary>show</summary>
<p>

```bash
# use kubectl to create the role binding, with the help of `kubectl create rolebinding -h`
kubectl create rolebinding sa-creator-binding --role=sa-creator --user=sandra
```

> 💡 **Verify (optional)**:
```bash
# use `kubectl auth can-i` to verify sandra can create service accounts
kubectl auth can-i create sa --as sandra
```

</p>
</details>
### Create a role named `deployment-reader` in the `cka-20834` namespace, and allow it to get and list deployments.

> 🔗 [Reference > API Access Control > Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

<details><summary>show</summary>
<p>

```bash
# create the namespace `cka-20834`
k create ns cka-20834

# create the role in the `cka-20834` namespace with the help of `kubectl create role -h`
k -n cka-20834 create role deployment-reader --verb=get,list --resource=deploy --api-group=apps
```

</p>
</details>

### Create a role binding named `deployment-reader-binding` in the `cka-20834` namespace that will bind the `deployment-reader` role to the service account `demo-sa`

> 🔗 [Reference > API Access Control > Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

<details><summary>show</summary>
<p>

```bash
# create a service account named `demo-sa` in the `cka-20834` namespace
k -n cka-20834 create sa demo-sa

# create the role binding with the help of `kubectl create rolebinding -h`
k -n cka-20834 create rolebinding deployment-reader-binding --role=deployment-reader --serviceaccount=cka-20834:demo-sa

# verify the permission with `kubectl auth can-i`
kubectl auth can-i get deployments --as=system:serviceaccount:cka-20834:demo-sa -n cka-20834
kubectl auth can-i list deployments --as=system:serviceaccount:cka-20834:demo-sa -n cka-20834

```

</p>
</details>

### Create a service account and pod that does NOT mount the service account token

> 🔗 [Tasks > Configure Pods and Containers > Configure Service Accounts for Pods](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/)

<details><summary>show</summary>
<p>

Create the service account

```bash
# create the YAML for a service account named 'secure-sa' with the '--dry-run=client' option, saving it to a file named 'sa.yaml'
kubectl -n default create sa secure-sa --dry-run=client -o yaml > sa.yaml

# add the automountServiceAccountToken: false to the end of the file 'sa.yaml'
echo "automountServiceAccountToken: false" >> sa.yaml

# create the service account from the file 'sa.yaml'
kubectl create -f sa.yaml

# list the newly created service account
kubectl -n default get sa
```

Creat a pod that uses the service account

```bash
# create the YAML for a pod named 'secure-pod' by using kubectl with the '--dry-run=client' option, output to YAML and saved to a file 'pod.yaml'
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
spec:
  serviceAccountName: secure-sa
  containers:
  - image: nginx
    name: secure-pod
EOF

# watch the 'secure-pod' pod waiting until the pod is running before proceeding
kubectl get po -w
```

Ensure the service account token was not mounted

```bash
# get a shell to the pod and try to list the contents of the token
kubectl exec secure-pod -- cat /var/run/secrets/kubernetes.io/serviceaccount/token
```

You should get the following, indicating that the token was not mounted

```bash
cat: /var/run/secrets/kubernetes.io/serviceaccount/token: No such file or directory
```

[Try this in Killercoda's Kubernetes Lab Environment](https://killercoda.com/chadmcrowell/course/cka/create-sa-for-pod)

</p>
</details>

### [CKA Past Exam - 4 pts] Create deployment-clusterrole, ServiceAccount cicd-token in app-team1, and bind them

> 🔗 [Reference > Access Authn Authz > Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

**Task:**

Create a new ClusterRole named `deployment-clusterrole` which only allows to create the following resource types: Deployment, StatefulSet, DaemonSet. Create a new ServiceAccount named `cicd-token` in the existing namespace `app-team1`. Bind the new ClusterRole `deployment-clusterrole` to the new ServiceAccount `cicd-token`, limited to the namespace `app-team1`.

<details><summary>show</summary>
<p>

```bash
# 切换 context（考试中务必先执行）
kubectl config use-context k8s

# 1. 创建 ClusterRole（仅允许 create 操作）
kubectl create clusterrole deployment-clusterrole \
  --verb=create \
  --resource=deployments,statefulsets,daemonsets

# 2. 在 app-team1 namespace 中创建 ServiceAccount
kubectl create serviceaccount cicd-token -n app-team1

# 3. 创建 RoleBinding（限制在 app-team1 namespace 内生效）
# 注意：使用 rolebinding 而不是 clusterrolebinding，因为题目要求"limited to the namespace"
kubectl create rolebinding cicd-token-binding \
  --clusterrole=deployment-clusterrole \
  --serviceaccount=app-team1:cicd-token \
  -n app-team1

# 验证
kubectl auth can-i create deployment --as=system:serviceaccount:app-team1:cicd-token -n app-team1
# yes
kubectl auth can-i create deployment --as=system:serviceaccount:app-team1:cicd-token -n default
# no
```

</p>
</details>

---

## 2. Prepare underlying infrastructure for installing a Kubernetes cluster

> 📖
>- [Getting started > Production environment > Container Runtimes](https://kubernetes.io/docs/setup/production-environment/container-runtimes/)
>- [Getting started > Best practices > PKI certificates and requirements](https://kubernetes.io/docs/setup/best-practices/certificates/)
>- [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Configuring each kubelet in your cluster using kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/kubelet-integration/)
>- [Reference > API Overview > Kubernetes API health endpoints](https://kubernetes.io/docs/reference/using-api/health-checks/)

### Install and configure containerd as the container runtime

> 🔗
> [Getting started > Production environment > Container Runtimes](https://kubernetes.io/docs/setup/production-environment/container-runtimes/)
> [containerd > Getting started](https://github.com/containerd/containerd/blob/main/docs/getting-started.md)

> **Note:** CKA 考试中 CRI 通常已预装，但理解安装过程有助于排查问题。必须使用 systemd cgroup driver（与 kubelet 一致）。

<details><summary>show</summary>
<p>

```bash
# === Step 1: Enable IPv4 forwarding (required by Kubernetes) ===
# ref: https://kubernetes.io/docs/setup/production-environment/container-runtimes/#prerequisite-ipv4-forwarding-optional

cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.ipv4.ip_forward = 1
EOF

sudo sysctl --system

# verify
sysctl net.ipv4.ip_forward

# Note: overlay 和 br_netfilter 内核模块、bridge-nf-call-iptables 等设置
# 取决于所使用的 CNI 插件，请参考对应 CNI 文档（如 Calico、Flannel）
# 部分 CNI 插件会自动配置这些参数

# === Step 2: Install containerd ===
# ref: https://github.com/containerd/containerd/blob/main/docs/getting-started.md

sudo apt-get update
sudo apt-get install -y containerd

# === Step 3: Configure containerd to use systemd cgroup driver ===
# ref: https://kubernetes.io/docs/setup/production-environment/container-runtimes/#containerd-systemd

sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml

# set SystemdCgroup = true (must match kubelet's cgroup driver)
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml

sudo systemctl restart containerd
sudo systemctl enable containerd

# === Verify ===

sudo systemctl status containerd
```

</p>
</details>

### List the services on your Linux operating system that are associated with Kubernetes

> 🔗 [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Configuring each kubelet in your cluster using kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/kubelet-integration/)

<details><summary>show</summary>
<p>

```bash
systemctl list-unit-files --type service --all | grep kube
```

</p>
</details>

### List the status of the kubelet service running on the Kubernetes node

> 🔗 [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Configuring each kubelet in your cluster using kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/kubelet-integration/)

<details><summary>show</summary>
<p>

```bash
systemctl status kubelet
```

</p>
</details>

### Get the status of the control plane components (cluster health)

> 🔗 [Reference > API Overview > Kubernetes API health endpoints](https://kubernetes.io/docs/reference/using-api/health-checks/)

Query all three Kubernetes API health endpoints — `/livez`, `/readyz`, and `/healthz` — using `curl -k` against the API server (port 6443) or `kubectl get --raw`. Add `?verbose` for the per-component breakdown.

> ℹ️ Modern Kubernetes (≥ v1.16) splits health into `/livez` (liveness — is the API server up?) and `/readyz` (readiness — is it serving traffic, are dependencies healthy?). `/healthz` is the legacy single-endpoint form kept for backwards compatibility. Querying any one of them is enough to confirm the API server responds; this exercise asks for all three so you've seen the full picture.

<details><summary>show</summary>
<p>

```bash
# check the livez endpoint
curl -k https://localhost:6443/livez?verbose

# or

kubectl get --raw='/livez?verbose'

# check the readyz endpoint
curl -k https://localhost:6443/readyz?verbose

# or

kubectl get --raw='/readyz?verbose'

# check the healthz endpoint
curl -k https://localhost:6443/healthz?verbose

# or

kubectl get --raw='/healthz?verbose'
```

</p>
</details>

### Perform the command to list all API resources in your Kubernetes cluster

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl api-resources
```

</p>
</details>

### Restart kubelet on the node

> 🔗 [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Configuring each kubelet in your cluster using kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/kubelet-integration/)

<details><summary>show</summary>
<p>

```bash
sudo systemctl daemon-reload

sudo systemctl restart kubelet
```

</p>
</details>

---

## 3. Create and manage Kubernetes clusters using kubeadm

> 📖
> [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Installing kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/install-kubeadm/)
> [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Creating a cluster with kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/)
> [Tasks > Administer a Cluster > Administration with kubeadm > Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)
> [Tasks > Administer a Cluster > Administration with kubeadm > Changing The Kubernetes Package Repository](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/change-package-repository/)
> [Releases > Version Skew Policy](https://kubernetes.io/releases/version-skew-policy/)

> **Note:**
> - **不能跳 minor version**: *"Skipping MINOR versions when upgrading is unsupported."* — [Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)
> - **可以跳 patch version**: *"Upgrade components to the most recent patch version of the target minor version."* — [Version Skew Policy](https://kubernetes.io/releases/version-skew-policy/)。例如 1.34.2 可以直接升到 1.35.3，无需先经过 1.35.0
> - **Minor version upgrade** (e.g. 1.34 → 1.35): 必须更换 apt 源到新版本的 channel
> - **Patch version upgrade** (e.g. 1.35.3 → 1.35.5): 不需要更换 apt 源，直接安装新版本即可
> - 升级顺序: 先升级 kubeadm → 再 `kubeadm upgrade apply` → 最后升级 kubelet 和 kubectl
> - 必须先升级 control plane，再升级 worker nodes

### Install kubeadm, kubelet, and kubectl packages

> 🔗 [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Installing kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/install-kubeadm/)

<details><summary>show</summary>
<p>

```bash
# install prerequisites
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl gpg

# add the Kubernetes apt repository signing key
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.35/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

# add the Kubernetes apt repository
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.35/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list

# install kubeadm, kubelet, kubectl
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl

# hold packages to prevent unintended upgrades
sudo apt-mark hold kubelet kubeadm kubectl

# enable kubelet (it will restart in a crash loop until kubeadm init is run)
sudo systemctl enable --now kubelet
```

</p>
</details>

### Initialize a Kubernetes control plane with kubeadm

> 🔗 [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Creating a cluster with kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/)

<details><summary>show</summary>
<p>

```bash
# === Prerequisites (on all nodes) ===
# - CRI installed and running (containerd — see Section 2 exercise)
# - kubeadm, kubelet, kubectl installed (see exercise above)
# - swap disabled: sudo swapoff -a

# === On the control plane node ===

# initialize the cluster
# --apiserver-advertise-address: API server 监听的 IP（多网卡环境必须指定，否则自动选择默认网关接口）
# --pod-network-cidr: CNI 插件使用的 pod 网段（需与后续安装的 CNI 配置匹配）
sudo kubeadm init \
  --apiserver-advertise-address=<cp-node-ip> \
  --pod-network-cidr=10.244.0.0/16

# set up kubeconfig for the current user (follow the output instructions)
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# verify the control plane components
kubectl get nodes           # should show NotReady (no CNI yet)
kubectl get pods -n kube-system

# install a CNI plugin (e.g., Calico — see Section 7 exercises for details)
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.29.3/manifests/calico.yaml

# verify node is now Ready
kubectl get nodes
```

</p>
</details>

### Join a worker node to the cluster using kubeadm

> 🔗 [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Creating a cluster with kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/)

<details><summary>show</summary>
<p>

```bash
# === On the control plane: generate a join command ===

kubeadm token create --print-join-command

# === On the worker node (as root) ===
# Prerequisites: CRI, kubeadm, kubelet installed; swap disabled

# run the join command from above
sudo kubeadm join <cp-endpoint>:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash>

# === On the control plane: verify ===

kubectl get nodes       # new worker node should appear and become Ready
```

</p>
</details>

### Upgrade the control plane node from v1.34.x to v1.35.3 (minor version upgrade)

> 🔗 
> [Tasks > Administer a Cluster > Administration with kubeadm > Changing The Kubernetes Package Repository](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/change-package-repository/#switching-to-another-kubernetes-package-repository)
> [Tasks > Administer a Cluster > Administration with kubeadm > Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)

<details><summary>show</summary>
<p>

```bash
# === Step 1: Upgrade kubeadm ===

# For a minor version upgrade, edit the apt source to point to the new version channel:
# Change v1.34 to v1.35 in /etc/apt/sources.list.d/kubernetes.list
# From: deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.34/deb/ /
# To:   deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.35/deb/ /
sudo sed -i 's/v1\.34/v1.35/g' /etc/apt/sources.list.d/kubernetes.list

# Determine which version to upgrade to
sudo apt-get update
sudo apt-cache madison kubeadm

# Install kubeadm v1.35.3
sudo apt-mark unhold kubeadm
sudo apt-get install -y kubeadm='1.35.3-*'
sudo apt-mark hold kubeadm

# Verify
kubeadm version

# === Step 2: Plan and apply the upgrade ===

sudo kubeadm upgrade plan

sudo kubeadm upgrade apply v1.35.3

# === Step 3: Drain the control plane node ===

kubectl drain <cp-node> --ignore-daemonsets

# === Step 4: Upgrade kubelet and kubectl ===

sudo apt-mark unhold kubelet kubectl
sudo apt-get update
sudo apt-get install -y kubelet='1.35.3-*' kubectl='1.35.3-*'
sudo apt-mark hold kubelet kubectl

# === Step 5: Restart kubelet ===

sudo systemctl daemon-reload
sudo systemctl restart kubelet

# === Step 6: Uncordon the node ===

kubectl uncordon <cp-node>

# === Verify ===

kubectl get nodes
```

</p>
</details>

### Upgrade a worker node from v1.34.x to v1.35.3 (minor version upgrade)

> 🔗
> [Tasks > Administer a Cluster > Administration with kubeadm > Changing The Kubernetes Package Repository](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/change-package-repository/#switching-to-another-kubernetes-package-repository)
> [Tasks > Administer a Cluster > Administration with kubeadm > Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)

<details><summary>show</summary>
<p>

```bash
# === On the worker node ===

# Step 1: Update apt repo and upgrade kubeadm (same as control plane)
sudo sed -i 's/v1\.34/v1.35/g' /etc/apt/sources.list.d/kubernetes.list

sudo apt-mark unhold kubeadm
sudo apt-get update
sudo apt-get install -y kubeadm='1.35.3-*'
sudo apt-mark hold kubeadm

# Step 2: Upgrade the local kubelet configuration
sudo kubeadm upgrade node

# === On the control plane node ===

# Step 3: Drain the worker node
kubectl drain <worker-node> --ignore-daemonsets

# === Back on the worker node ===

# Step 4: Upgrade kubelet and kubectl
sudo apt-mark unhold kubelet kubectl
sudo apt-get update
sudo apt-get install -y kubelet='1.35.3-*' kubectl='1.35.3-*'
sudo apt-mark hold kubelet kubectl

# Step 5: Restart kubelet
sudo systemctl daemon-reload
sudo systemctl restart kubelet

# === On the control plane node ===

# Step 6: Uncordon the worker node
kubectl uncordon <worker-node>

# Verify
kubectl get nodes
```

</p>
</details>

### Upgrade the control plane node from v1.35.3 to v1.35.5 (patch version upgrade)

> 🔗 [Tasks > Administer a Cluster > Administration with kubeadm > Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)

<details><summary>show</summary>
<p>

```bash
# For a patch version upgrade, no need to change the apt repository

# Step 1: Upgrade kubeadm
sudo apt-mark unhold kubeadm
sudo apt-get update
sudo apt-get install -y kubeadm='1.35.5-*'
sudo apt-mark hold kubeadm

# Step 2: Plan and apply
sudo kubeadm upgrade plan
sudo kubeadm upgrade apply v1.35.5

# Step 3: Drain the control plane node
kubectl drain <cp-node> --ignore-daemonsets

# Step 4: Upgrade kubelet and kubectl
sudo apt-mark unhold kubelet kubectl
sudo apt-get update
sudo apt-get install -y kubelet='1.35.5-*' kubectl='1.35.5-*'
sudo apt-mark hold kubelet kubectl

# Step 5: Restart kubelet
sudo systemctl daemon-reload
sudo systemctl restart kubelet

# Step 6: Uncordon
kubectl uncordon <cp-node>

# Verify
kubectl get nodes
```

</p>
</details>

### Upgrade a worker node from v1.35.3 to v1.35.5 (patch version upgrade)

> 🔗 [Tasks > Administer a Cluster > Administration with kubeadm > Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)

<details><summary>show</summary>
<p>

```bash
# === On the worker node ===

# Step 1: Upgrade kubeadm (no apt repo change needed for patch version)
sudo apt-mark unhold kubeadm
sudo apt-get update
sudo apt-get install -y kubeadm='1.35.5-*'
sudo apt-mark hold kubeadm

# Step 2: Upgrade the local kubelet configuration
sudo kubeadm upgrade node

# === On the control plane node ===

# Step 3: Drain the worker node
kubectl drain <worker-node> --ignore-daemonsets

# === Back on the worker node ===

# Step 4: Upgrade kubelet and kubectl
sudo apt-mark unhold kubelet kubectl
sudo apt-get update
sudo apt-get install -y kubelet='1.35.5-*' kubectl='1.35.5-*'
sudo apt-mark hold kubelet kubectl

# Step 5: Restart kubelet
sudo systemctl daemon-reload
sudo systemctl restart kubelet

# === On the control plane node ===

# Step 6: Uncordon the worker node
kubectl uncordon <worker-node>

# Verify
kubectl get nodes
```

</p>
</details>

### [CKA Past Exam - 7 pts] Upgrade only the master node from v1.x.x to v1.(x+1).x, skipping etcd upgrade

> 🔗 [Tasks > Administer a Cluster > Administration with kubeadm > Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)

**Task:**

Given an existing Kubernetes cluster running version 1.x.x, upgrade all of the Kubernetes control plane and node components on the master node only to the version v1.(x+1).x. You are also expected to upgrade kubelet and kubectl on the master node. Be sure to drain the master node before upgrading it and uncordon it after the upgrade. **Do not upgrade the worker nodes, etcd, the container manager, the CNI plugin, the DNS service or any other addons.**

<details><summary>show</summary>
<p>

```bash
# 切换 context
kubectl config use-context mk8s

# 1. 在 master 节点上 cordon + drain（从 control-plane 节点视角操作）
kubectl cordon master01
kubectl drain master01 --delete-emptydir-data --ignore-daemonsets --force

# 2. SSH 到 master 节点
ssh master01
sudo -i

# 3. 升级 kubeadm
apt-mark unhold kubeadm
apt-get update && apt-get install -y kubeadm=1.x+1.x-00
apt-mark hold kubeadm

# 验证版本
kubeadm version

# 4. 查看升级计划
kubeadm upgrade plan

# 5. 应用升级（关键: --etcd-upgrade=false 跳过 etcd 升级）
kubeadm upgrade apply v1.x+1.x --etcd-upgrade=false

# 6. 升级 kubelet 和 kubectl
apt-mark unhold kubelet kubectl
apt-get install -y kubelet=1.x+1.x-00 kubectl=1.x+1.x-00
apt-mark hold kubelet kubectl

# 7. 重启 kubelet
systemctl daemon-reload
systemctl restart kubelet

# 8. 退出 master 节点，uncordon
exit  # 退出 sudo
exit  # 退出 ssh
kubectl uncordon master01

# 验证
kubectl get nodes
```

</p>
</details>

---

## 4. Manage the lifecycle of Kubernetes clusters

> 📖
> [Tasks > Administer a Cluster > Administration with kubeadm > Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)
> [Tasks > Access Applications in a Cluster > Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)
> [Reference > Command line tool (kubectl) > kubectl Quick Reference](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

### Setup autocomplete for k8s commands

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: kubectl autocomplete](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#kubectl-autocomplete)

<details><summary>show</summary>
<p>

```bash
source <(kubectl completion bash)
echo "source <(kubectl completion bash)" >> ~/.bashrc
```

</p>
</details>

### Setup alias for kubectl

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: kubectl autocomplete](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#kubectl-autocomplete)

<details><summary>show</summary>
<p>

```bash
alias k=kubectl
# have this persist beyond the current shell
echo 'alias k=kubectl' >> ~/.bashrc
source ~/.bashrc
```

</p>
</details>

### Show kubeconfig settings

> 🔗 [Tasks > Access Applications in a Cluster > Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)

<details><summary>show</summary>
<p>

```bash
kubectl config view
```

</p>
</details>

### Use multiple kubeconfig files at the same time

> 🔗 [Tasks > Access Applications in a Cluster > Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)

<details><summary>show</summary>
<p>

```bash
KUBECONFIG=~/.kube/config:~/.kube/kubconfig2
```

</p>
</details>

### Permanently save the namespace `ggcka-s2` for all subsequent kubectl commands in that context.

> 🔗
> [Tasks > Access Applications in a Cluster > Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)
> [Reference > Command line tool (kubectl) > kubectl Quick Reference: kubectl context and configuration](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#kubectl-context-and-configuration)

<details><summary>show</summary>
<p>

```bash
kubectl config set-context --current --namespace=ggcka-s2
```

</p>
</details>

### Set a context utilizing a specific `cluster-admin` user in `default` namespace

> 🔗 [Tasks > Access Applications in a Cluster > Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)

<details><summary>show</summary>
<p>

```bash
# set context gce to user "admin" in the namespace "default"
kubectl config set-context gce --user=cluster-admin --namespace=default \

# use the context
kubectl config use-context gce
```

</p>
</details>

### List all nodes in the cluster

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl get nodes
# or, get more information about the nodes
kubectl get nodes -o wide
```

</p>
</details>

### Describe nodes with verbose output

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl describe nodes
```

</p>
</details>

### Get the internal IP of all nodes

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

> **Note:** `ExternalIP` 仅在云托管集群 (GKE, EKS, AKS) 中存在。kubeadm 集群（包括 CKA 考试环境）的 `status.addresses` 通常只有 `InternalIP` 和 `Hostname`。

<details><summary>show</summary>
<p>

```bash
kubectl get nodes -o jsonpath='{.items[*].status.addresses[?(@.type=="InternalIP")].address}'

# or, using yq
kubectl get nodes -o yaml | yq '.items[].status.addresses[] | select(.type == "InternalIP") | .address'
```

</p>
</details>

### Create a new namespace

> 🔗 [Tasks > Administer a Cluster > Share a Cluster with Namespaces > Namespaces Walkthrough](https://kubernetes.io/docs/tasks/administer-cluster/namespaces-walkthrough/)

<details><summary>show</summary>
<p>

```bash
kubectl create namespace web
```

</p>
</details>

### List all the namespaces that exist in the cluster

> 🔗 [Concepts > Overview > Working with Kubernetes Objects > Namespaces](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/)

<details><summary>show</summary>
<p>

```bash
kubectl get namespaces
```

</p>
</details>

### List all services in the kube-system namespace

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl get svc -n kube-system
```

</p>
</details>

### List the pods in all namespaces

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl get po --all-namespaces
# or
k get po -A
```

</p>
</details>

### List all pods in the `default` namespace, with more details

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl -n default get pods -o wide
```

</p>
</details>

### List all pods in the default namespace

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl -n default get pods
# or
k -n default get po
```

</p>
</details>

### List a deployment named `nginx-deployment`

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl get deployment nginx-deployment
# or
kubectl -n default get deploy nginx-deployment
```

</p>
</details>

### Get the pod YAML from a pod named `nginx`

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl get po nginx -o yaml
# or
k -n default get po -o yaml
```

</p>
</details>

### Get information about the pod, including details about potential issues (e.g. pod hasn't started)

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl describe po nginx
```

</p>
</details>

### Get pod logs from a pod named `nginx`

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Interacting with running Pods](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#interacting-with-running-pods)

<details><summary>show</summary>
<p>

```bash
kubectl logs nginx
```

</p>
</details>

### Output a pod's YAML without cluster specific information

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl get pod my-pod -o yaml
```

</p>
</details>

### List services in the default namespace, sorted by name

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl -n default get services --sort.by=.metadata.name
# or
k -n default get svc --sort.by=.metadata.name
```

</p>
</details>

### List all the services created in your Kubernetes cluster, across all namespaces

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl get svc -A
```

</p>
</details>

### Create a pod which runs an nginx container

> 🔗
> [Concepts > Workloads > Pods](https://kubernetes.io/docs/concepts/workloads/pods/)
> [Reference > Command line tool (kubectl) > kubectl Quick Reference: Creating objects](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#creating-objects)

<details><summary>show</summary>
<p>

```bash
kubectl run nginx --image=nginx
# or
kubectl run nginx2 --image=nginx --restart=Never --dry-run -o yaml | kubectl create -f -
```

</p>
</details>

### Delete a pod

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Deleting resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#deleting-resources)

<details><summary>show</summary>
<p>

```bash
kubectl delete po nginx
```

</p>
</details>

### Use the imperative command to create a pod named nginx-pod with the image nginx, but save it to a YAML file named pod.yaml instead of creating it

> 🔗
> [Reference > Command line tool (kubectl) > kubectl Usage Conventions](https://kubernetes.io/docs/reference/kubectl/conventions/)
> [Reference > Command line tool (kubectl) > kubectl Quick Reference: Creating objects](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#creating-objects)

<details><summary>show</summary>
<p>

```bash
kubectl run nginx --image nginx-pod --dry-run=client -o yaml > pod.yaml
```

</p>
</details>

### Create a deployment with two replica pods from YAML

> 🔗 [Concepts > Workloads > Workload Management > Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)

<details><summary>show</summary>
<p>

```YAML
# create a deployment object using this YAML template with the following command
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  creationTimestamp: null
  labels:
    run: nginx
  name: nginx
spec:
  replicas: 2
  selector:
    matchLabels:
      run: nginx
  strategy: {}
  template:
    metadata:
      creationTimestamp: null
      labels:
        run: nginx
    spec:
      containers:
      - image: nginx
        name: nginx
        resources: {}
status: {}
EOF
```

```bash
# create the file deploy.yaml with the content above
vim deploy.yaml
# create the deployment
kubectl apply -f deploy.yaml
# get verbose output of deployment YAML
kubectl get deploy nginx-deployment -o yaml
# add an annotation to the deployment
kubectl annotate deploy nginx mycompany.com/someannotation="chad"
# delete the deployment
kubectl delete deploy nginx
```

</p>
</details>

### Add an annotation to a deployment

> 🔗 [Concepts > Overview > Working with Kubernetes Objects > Annotations](https://kubernetes.io/docs/concepts/overview/working-with-objects/annotations/)

<details><summary>show</summary>
<p>

```bash
kubectl annotate deploy nginx mycompany.com/someannotation="chad"
```

</p>
</details>

### Add a label to a pod

> 🔗 [Concepts > Overview > Working with Kubernetes Objects > Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)

<details><summary>show</summary>
<p>

```bash
kubectl label pods nginx env=prod
```

</p>
</details>

### Show labels for all pods in the cluster

> 🔗 [Concepts > Overview > Working with Kubernetes Objects > Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)

<details><summary>show</summary>
<p>

```bash
kubectl get pods --show-labels
# or get pods with the env label
kubectl get po -L env
```

</p>
</details>

### List all pods that are in the running state using field selectors

> 🔗 [Concepts > Overview > Working with Kubernetes Objects > Field Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/field-selectors/)

<details><summary>show</summary>
<p>

```bash
kubectl get po --field-selector status.phase=Running
```

</p>
</details>

### List all services in the default namespace using field selectors

> 🔗 [Concepts > Overview > Working with Kubernetes Objects > Field Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/field-selectors/)

<details><summary>show</summary>
<p>

```bash
kubectl get svc --field-selector metadata.namespace=default
```

</p>
</details>

### List all API resources in your Kubernetes cluster

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl api-resources
```

</p>
</details>

### Drain a node for maintenance named `node1.mylabserver.com`

> 🔗 [Tasks > Administer a Cluster > Safely Drain a Node](https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/)

<details><summary>show</summary>
<p>

```bash
kubectl drain node1.mylabserver.com --ignore-daemonsets --force
```

</p>
</details>

### Put the node `node1.mylabserver.com` back into service, so pods can be scheduled to it

> 🔗 [Tasks > Administer a Cluster > Safely Drain a Node](https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/)

<details><summary>show</summary>
<p>

```bash
kubectl uncordon node1.mylabserver.com
```

</p>
</details>

### Backup etcd

> 🔗 [Tasks > Administer a Cluster > Operating etcd clusters for Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/)

> **Note:** 在 kubeadm 集群中，etcd 以 **static pod** 运行（非 systemd service）。证书路径可从 etcd pod spec 或 manifest 中获取。

<details><summary>show</summary>
<p>

```bash
# find cert paths from the etcd static pod manifest
cat /etc/kubernetes/manifests/etcd.yaml | grep -E "cert-file|key-file|trusted-ca"

# or from the running pod
kubectl -n kube-system describe pod etcd-<cp-node> | grep -A 20 "Command"

# backup etcd
ETCDCTL_API=3 etcdctl snapshot save /opt/etcd_backup.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# verify the snapshot
ETCDCTL_API=3 etcdctl snapshot status /opt/etcd_backup.db --write-table
```

</p>
</details>

### Reset etcd and remove all data

> 🔗 [Tasks > Administer a Cluster > Operating etcd clusters for Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/)

<details><summary>show</summary>
<p>

```bash
# stop kube-apiserver and etcd by moving their static pod manifests out
sudo mv /etc/kubernetes/manifests/kube-apiserver.yaml /etc/kubernetes/manifests/etcd.yaml /tmp/

# wait for pods to terminate
sudo crictl ps | grep -E "etcd|kube-apiserver"

# remove the etcd data directory
sudo rm -rf /var/lib/etcd
```

</p>
</details>

### Restore an etcd store from backup

> 🔗 [Tasks > Administer a Cluster > Operating etcd clusters for Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/)

> **Note:** etcd 3.5+ 中 `etcdctl snapshot restore` 已废弃，应使用 `etcdutl snapshot restore`。

<details><summary>show</summary>
<p>

```bash
# === Step 1: Stop kube-apiserver and etcd ===

sudo mv /etc/kubernetes/manifests/kube-apiserver.yaml /etc/kubernetes/manifests/etcd.yaml /tmp/

# wait for pods to terminate
sudo crictl ps | grep -E "etcd|kube-apiserver"

# === Step 2: Restore the snapshot ===

sudo etcdutl snapshot restore /opt/etcd_backup.db \
  --data-dir /var/lib/etcd-restored

# === Step 3: Replace the data directory ===

sudo rm -rf /var/lib/etcd
sudo mv /var/lib/etcd-restored /var/lib/etcd

# === Step 4: Move manifests back to restart static pods ===

sudo mv /tmp/kube-apiserver.yaml /tmp/etcd.yaml /etc/kubernetes/manifests/

# === Step 5: Verify ===

# wait for pods to come back
kubectl get pods -n kube-system -w

# verify etcd is healthy
ETCDCTL_API=3 etcdctl endpoint health \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
```

</p>
</details>

### [CKA Past Exam - 4 pts] Drain node ek8s-node-1 so all pods are evicted

> 🔗 [Tasks > Administer a Cluster > Safely Drain a Node](https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/)

**Task:**

Set the node named `ek8s-node-1` as unavailable and reschedule all the pods running on it.

<details><summary>show</summary>
<p>

```bash
# 切换 context
kubectl config use-context ek8s

# 1. cordon: 标记节点为不可调度
kubectl cordon ek8s-node-1

# 2. drain: 驱逐节点上的所有 Pod
# --delete-emptydir-data: 允许删除使用 emptyDir 的 Pod
# --ignore-daemonsets: 忽略 DaemonSet 管理的 Pod（无法驱逐）
# --force: 强制驱逐裸 Pod（非 controller 管理的）
kubectl drain ek8s-node-1 \
  --delete-emptydir-data \
  --ignore-daemonsets \
  --force

# 验证: 节点状态应为 SchedulingDisabled，且无业务 Pod
kubectl get nodes
kubectl get pods -A -o wide --field-selector spec.nodeName=ek8s-node-1
```

</p>
</details>

### [CKA Past Exam - 7 pts] Backup etcd to /srv/data/etcd-snapshot.db and restore from /var/lib/backup/etcd-snapshot-previous.db

> 🔗 [Tasks > Administer a Cluster > Operating etcd clusters for Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/)

**Task:**

First, create a snapshot of the existing etcd instance running at `https://127.0.0.1:2379`, saving the snapshot to `/srv/data/etcd-snapshot.db`. Next, restore an existing, previous snapshot located at `/var/lib/backup/etcd-snapshot-previous.db`.
The following TLS certificates/key are supplied for connecting to the server with etcdctl:
- CA certificate: `/opt/KUIN000601/ca.crt`
- Client certificate: `/opt/KUIN000601/etcd-client.crt`
- Client key: `/opt/KUIN000601/etcd-client.key`

<details><summary>show</summary>
<p>

```bash
# === Part 1: 备份 ===
export ETCDCTL_API=3
etcdctl snapshot save /srv/data/etcd-snapshot.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/opt/KUIN000601/ca.crt \
  --cert=/opt/KUIN000601/etcd-client.crt \
  --key=/opt/KUIN000601/etcd-client.key

# 验证快照
etcdctl snapshot status /srv/data/etcd-snapshot.db --write-out=table

# === Part 2: 恢复 ===
# 注意: 考试中如果是 static pod 部署的 etcd，需要先停止 kube-apiserver 和 etcd
# 方法1: 移走 static pod manifest 文件
sudo mv /etc/kubernetes/manifests/etcd.yaml /tmp/
sudo mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/

# 执行恢复（恢复到新的数据目录）
sudo ETCDCTL_API=3 etcdctl snapshot restore \
  /var/lib/backup/etcd-snapshot-previous.db \
  --data-dir=/var/lib/etcd-restore

# 修改 etcd manifest 指向新数据目录
sudo vi /tmp/etcd.yaml
# 修改 hostPath:
#   - hostPath:
#       path: /var/lib/etcd-restore   # 原为 /var/lib/etcd
#     name: etcd-data

# 移回 manifest 触发 kubelet 启动
sudo mv /tmp/etcd.yaml /etc/kubernetes/manifests/
sudo mv /tmp/kube-apiserver.yaml /etc/kubernetes/manifests/

# 验证
kubectl get pods -n kube-system | grep etcd
kubectl get nodes
```

</p>
</details>

### [CKA Past Exam - 4 pts] Count Ready nodes excluding those with NoSchedule taints, write count to file

> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

**Task:**

Check how many nodes are ready (not including nodes tainted with NoSchedule), and write the number to `/opt/KUSC00402/kusc00402.txt`.

<details><summary>show</summary>
<p>

```bash
# 切换 context
kubectl config use-context k8s

# 方法 1: 命令组合
# 总 Ready 节点数
READY=$(kubectl get nodes | grep -w "Ready" | wc -l)

# 带 NoSchedule 污点的节点数（包括 master 默认的 NoSchedule）
NOSCHED=$(kubectl describe nodes | grep -i taint | grep -i NoSchedule | wc -l)

# 计算差值并写入文件
echo $((READY - NOSCHED)) > /opt/KUSC00402/kusc00402.txt

# 验证
cat /opt/KUSC00402/kusc00402.txt

# 方法 2: 使用 jsonpath 更精确
kubectl get nodes -o jsonpath='{range .items[?(@.status.conditions[-1].status=="True")]}{.metadata.name}{"\t"}{.spec.taints[*].effect}{"\n"}{end}' \
  | grep -v NoSchedule | wc -l > /opt/KUSC00402/kusc00402.txt
```

</p>
</details>

---

## 5. Implement and configure a highly-available control plane

> 📖
> [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Options for Highly Available Topology](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/ha-topology/)
> [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Creating Highly Available Clusters with kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/high-availability/)

### Describe the two HA topology options for kubeadm clusters and their trade-offs

> 🔗 [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Options for Highly Available Topology](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/ha-topology/)

<details><summary>show</summary>
<p>

```bash
# HA 拓扑方式一: Stacked etcd（堆叠式）
# - etcd 与控制平面组件运行在同一节点
# - 最少 3 个控制平面节点
# - 优点: 节省资源，部署简单
# - 缺点: 控制平面节点故障会同时丢失一个 etcd 成员

# HA 拓扑方式二: External etcd（外部 etcd）
# - etcd 运行在独立的专用节点上
# - 最少 3 个控制平面节点 + 3 个 etcd 节点
# - 优点: 故障域隔离，etcd 和控制平面互不影响
# - 缺点: 需要更多节点

# 判断当前集群使用哪种拓扑
# 如果 etcd 以 static pod 运行 → stacked
kubectl get pods -n kube-system -l component=etcd

# 查看 API server 连接的 etcd endpoints
kubectl -n kube-system describe pod kube-apiserver-<cp-node> | grep etcd
# --etcd-servers=https://127.0.0.1:2379 → stacked
# --etcd-servers=https://<external-ip>:2379 → external

# 检查所有控制平面节点
kubectl get nodes -l node-role.kubernetes.io/control-plane
```

</p>
</details>

### Initialize an HA cluster with kubeadm using a load balancer endpoint

> 🔗 [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Creating Highly Available Clusters with kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/high-availability/)

<details><summary>show</summary>
<p>

```bash
# === 前提条件 ===
# - 至少 3 个节点用作控制平面
# - 一个负载均衡器（如 HAProxy、Nginx）将流量分发到所有 API server
# - 负载均衡器地址: LOAD_BALANCER_DNS:6443

# === 在第一个控制平面节点初始化 ===
sudo kubeadm init \
  --control-plane-endpoint "LOAD_BALANCER_DNS:6443" \
  --upload-certs \
  --pod-network-cidr=10.244.0.0/16

# --control-plane-endpoint: 所有 API server 共享的负载均衡器地址
# --upload-certs: 将控制平面证书上传到 kubeadm-certs Secret，其他 CP 节点可下载

# 输出会包含两个 join 命令:
# 1. 控制平面节点 join（包含 --control-plane 和 --certificate-key）
# 2. 工作节点 join（普通 join）

# set up kubeconfig
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# install CNI plugin
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.29.3/manifests/calico.yaml
```

</p>
</details>

### Join an additional control plane node to an existing HA cluster

> 🔗 [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Creating Highly Available Clusters with kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/high-availability/)

<details><summary>show</summary>
<p>

```bash
# === 在新的控制平面节点上运行 join 命令 ===
sudo kubeadm join LOAD_BALANCER_DNS:6443 \
  --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash> \
  --control-plane \
  --certificate-key <certificate-key>

# 如果 certificate-key 已过期（默认 2 小时），在第一个 CP 节点重新生成:
sudo kubeadm init phase upload-certs --upload-certs
# 输出新的 certificate-key

# 如果 token 已过期，在第一个 CP 节点重新生成:
kubeadm token create --print-join-command

# 验证新节点已加入
kubectl get nodes
# 新节点应显示 control-plane role

# 验证 etcd 成员已添加
kubectl -n kube-system exec etcd-<node> -- etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/peer.crt \
  --key=/etc/kubernetes/pki/etcd/peer.key \
  member list
```

</p>
</details>

### Verify the health of an HA control plane by checking API server and etcd endpoints

> 🔗 [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Creating Highly Available Clusters with kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/high-availability/)

<details><summary>show</summary>
<p>

```bash
# check all control plane pods
kubectl get pods -n kube-system -l tier=control-plane

# check API server health on each control plane node
curl -k https://<cp-node-1-ip>:6443/healthz
curl -k https://<cp-node-2-ip>:6443/healthz
curl -k https://<cp-node-3-ip>:6443/healthz
# expected: ok

# check etcd cluster health
kubectl -n kube-system exec etcd-<cp-node> -- etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/peer.crt \
  --key=/etc/kubernetes/pki/etcd/peer.key \
  endpoint health

# check etcd member list and leader
kubectl -n kube-system exec etcd-<cp-node> -- etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/peer.crt \
  --key=/etc/kubernetes/pki/etcd/peer.key \
  endpoint status --write-table

# verify all control plane components are healthy
kubectl get componentstatuses    # 注意: 此命令在新版本中可能已弃用
kubectl get --raw='/readyz?verbose'
```

</p>
</details>

---

## 6. Use Helm and Kustomize to install cluster components

> 📖
> [Tasks > Manage Kubernetes Objects > Managing Kubernetes Objects Using Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/)
> [Helm Documentation](https://helm.sh/docs/)

### Install a Helm chart, list releases, and inspect the installed resources

> 🔗 [Helm Documentation: Using Helm](https://helm.sh/docs/intro/using_helm/)

> **Note:** CKA 考试环境通常已预装 Helm。

<details><summary>show</summary>
<p>

```bash
# add a Helm chart repository
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# search for available charts
helm search repo bitnami/nginx

# install a chart
helm install my-nginx bitnami/nginx

# list installed releases
helm list

# check release status
helm status my-nginx

# view the Kubernetes resources created by the release
kubectl get all -l app.kubernetes.io/instance=my-nginx

# view the generated manifest (useful for debugging)
helm get manifest my-nginx

# uninstall the release
helm uninstall my-nginx
```

</p>
</details>

### Upgrade a Helm release with custom values, then roll back to a previous revision

> 🔗 [Helm Documentation: Helm Upgrade](https://helm.sh/docs/helm/helm_upgrade/)

<details><summary>show</summary>
<p>

```bash
# install a chart
helm install my-nginx bitnami/nginx

# upgrade with custom values
helm upgrade my-nginx bitnami/nginx --set replicaCount=3

# view revision history
helm history my-nginx

# view current custom values
helm get values my-nginx

# roll back to revision 1
helm rollback my-nginx 1

# verify the rollback
helm history my-nginx
kubectl get deploy -l app.kubernetes.io/instance=my-nginx

# upgrade using a values file
cat <<EOF > values.yaml
replicaCount: 2
service:
  type: ClusterIP
EOF
helm upgrade my-nginx bitnami/nginx -f values.yaml

# clean up
helm uninstall my-nginx
```

</p>
</details>

### Use Kustomize to deploy an application with environment-specific overlays

> 🔗 [Tasks > Manage Kubernetes Objects > Managing Kubernetes Objects Using Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/)

<details><summary>show</summary>
<p>

```bash
# create the directory structure
mkdir -p kustomize-demo/base kustomize-demo/overlays/prod
```

```yaml
# kustomize-demo/base/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: nginx
        image: nginx
        ports:
        - containerPort: 80
```

```yaml
# kustomize-demo/base/kustomization.yaml
resources:
- deployment.yaml
```

```yaml
# kustomize-demo/overlays/prod/kustomization.yaml
resources:
- ../../base
namePrefix: prod-
commonLabels:
  env: production
replicas:
- name: web
  count: 3
```

```bash
# preview the generated output
kubectl kustomize kustomize-demo/overlays/prod

# apply the overlay
kubectl apply -k kustomize-demo/overlays/prod

# verify: deployment name has "prod-" prefix, labels include "env: production", 3 replicas
kubectl get deploy prod-web --show-labels
```

</p>
</details>

### Use Kustomize to patch a Deployment and add resource limits via a strategic merge patch

> 🔗 [Tasks > Manage Kubernetes Objects > Managing Kubernetes Objects Using Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/)

<details><summary>show</summary>
<p>

```bash
mkdir -p kustomize-patch
```

```yaml
# kustomize-patch/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: app
        image: nginx
```

```yaml
# kustomize-patch/resource-patch.yaml — strategic merge patch to add resource limits
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      containers:
      - name: app
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 256Mi
```

```yaml
# kustomize-patch/kustomization.yaml
resources:
- deployment.yaml
patches:
- path: resource-patch.yaml
```

```bash
# preview the merged output
kubectl kustomize kustomize-patch

# apply
kubectl apply -k kustomize-patch

# verify resource limits are applied
kubectl get deploy app -o jsonpath='{.spec.template.spec.containers[0].resources}'
```

</p>
</details>

### Use Kustomize configMapGenerator to create a ConfigMap and reference it in a Deployment

> 🔗 [Tasks > Manage Kubernetes Objects > Managing Kubernetes Objects Using Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/)

<details><summary>show</summary>
<p>

```bash
mkdir -p kustomize-cm
```

```bash
# create a config file
cat > kustomize-cm/app.properties <<EOF
database.host=db.example.com
database.port=5432
log.level=info
EOF
```

```yaml
# kustomize-cm/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: app
        image: nginx
        volumeMounts:
        - name: config
          mountPath: /etc/config
      volumes:
      - name: config
        configMap:
          name: app-config
```

```yaml
# kustomize-cm/kustomization.yaml
resources:
- deployment.yaml
configMapGenerator:
- name: app-config
  files:
  - app.properties
```

```bash
# preview: notice Kustomize appends a hash suffix to the ConfigMap name
kubectl kustomize kustomize-cm
# ConfigMap name will be something like: app-config-7g9f6h2d8k
# Deployment's volume reference is automatically updated to match

# apply
kubectl apply -k kustomize-cm

# verify
kubectl get cm | grep app-config
# hash 后缀确保 ConfigMap 更新时会触发 Deployment 滚动更新（immutable rollout）
```

</p>
</details>

---

## 7. Understand extension interfaces (CNI, CSI, CRI, etc.)

> 📖
> [Concepts > Extending Kubernetes > Compute, Storage, and Networking Extensions > Network Plugins](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/)
> [Concepts > Containers > Container Runtime Interface (CRI)](https://kubernetes.io/docs/concepts/containers/cri/)
> [Container Storage Interface (CSI)](https://kubernetes-csi.github.io/docs/)

### Identify the container runtime and CRI endpoint on a node

> 🔗 [Concepts > Containers > Container Runtime Interface (CRI)](https://kubernetes.io/docs/concepts/containers/cri/)

<details><summary>show</summary>
<p>

```bash
# check the CONTAINER-RUNTIME column
kubectl get nodes -o wide

# view the runtime endpoint from kubelet arguments
ps aux | grep kubelet | grep container-runtime-endpoint

# or check the kubelet config
cat /var/lib/kubelet/config.yaml | grep containerRuntimeEndpoint

# if crictl is available, check runtime info
sudo crictl info | head -20
```

</p>
</details>

### Inspect CNI plugin configuration on a node

> 🔗 [Concepts > Extending Kubernetes > Compute, Storage, and Networking Extensions > Network Plugins](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/)

<details><summary>show</summary>
<p>

```bash
# list CNI configuration files
ls /etc/cni/net.d/

# view the CNI config
cat /etc/cni/net.d/*.conflist

# list installed CNI binaries
ls /opt/cni/bin/

# identify the CNI plugin pods in kube-system namespace
kubectl get pods -n kube-system | grep -iE "calico|flannel|cilium|weave"

# or check the CNI plugin daemonset
kubectl get ds -n kube-system
```

</p>
</details>

### Install a CNI plugin on a cluster where networking is not yet configured

> 🔗 [Concepts > Extending Kubernetes > Compute, Storage, and Networking Extensions > Network Plugins](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/)

> **Note:** `kubeadm init` 完成后，节点状态为 `NotReady`，CoreDNS pods 为 `Pending`，因为尚未安装 CNI 插件。CKA 考试中通常会指定使用哪个 CNI 插件及其 manifest URL。常见选项：Calico、Flannel、Cilium。

<details><summary>show</summary>
<p>

```bash
# check node status — should be NotReady without CNI
kubectl get nodes

# check CoreDNS pods — should be Pending (waiting for CNI)
kubectl get pods -n kube-system -l k8s-app=kube-dns

# install Calico CNI (use the URL specified in the exam question)
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.29.3/manifests/calico.yaml

# wait for Calico pods to be running
kubectl get pods -n kube-system -l k8s-app=calico-node -w

# verify nodes are now Ready
kubectl get nodes

# verify CoreDNS pods are now Running
kubectl get pods -n kube-system -l k8s-app=kube-dns
```

</p>
</details>

### Install Calico CNI and customize the pod CIDR to match the cluster configuration

> 🔗 [Concepts > Extending Kubernetes > Compute, Storage, and Networking Extensions > Network Plugins](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/)

> **Scenario:** 使用 `kubeadm init --pod-network-cidr=10.10.0.0/16` 初始化集群，但 Calico 默认 CIDR 是 `192.168.0.0/16`，需要在安装前修改 manifest 使其匹配。

<details><summary>show</summary>
<p>

```bash
# download the manifest first (don't apply directly)
curl -O https://raw.githubusercontent.com/projectcalico/calico/v3.29.3/manifests/calico.yaml

# find the CIDR setting
grep -n "CALICO_IPV4POOL_CIDR" calico.yaml

# uncomment and modify CALICO_IPV4POOL_CIDR to match --pod-network-cidr
# the default is commented out with value 192.168.0.0/16, change to 10.10.0.0/16
sed -i 's|# - name: CALICO_IPV4POOL_CIDR|- name: CALICO_IPV4POOL_CIDR|' calico.yaml
sed -i 's|#   value: "192.168.0.0/16"|  value: "10.10.0.0/16"|' calico.yaml

# verify the change
grep -A1 "CALICO_IPV4POOL_CIDR" calico.yaml

# apply the modified manifest
kubectl apply -f calico.yaml

# verify
kubectl get pods -n kube-system -l k8s-app=calico-node
kubectl get nodes
```

</p>
</details>

### Change the Calico encapsulation mode from IPIP to VXLAN

> 🔗 [Concepts > Extending Kubernetes > Compute, Storage, and Networking Extensions > Network Plugins](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/)

> **Note:** IPIP vs VXLAN 区别：
> - **IPIP**: IP-in-IP 封装，开销更低（20 bytes），但只支持 IPv4，某些云环境不支持
> - **VXLAN**: UDP 封装，开销略高（50 bytes），但兼容性更好，支持 IPv4/IPv6

<details><summary>show</summary>
<p>

```bash
# === Method 1: Modify manifest before install ===

# in calico.yaml, find and change encapsulation settings:
grep -n "CALICO_IPV4POOL_IPIP\|CALICO_IPV4POOL_VXLAN" calico.yaml

# set CALICO_IPV4POOL_IPIP value to "Never"
# set CALICO_IPV4POOL_VXLAN value to "Always"

# === Method 2: Modify running Calico via IPPool resource ===

# view current IPPool
kubectl get ippool default-ipv4-ippool -o yaml

# patch to switch from IPIP to VXLAN
kubectl patch ippool default-ipv4-ippool --type merge \
  -p '{"spec":{"ipipMode":"Never","vxlanMode":"Always"}}'

# verify
kubectl get ippool default-ipv4-ippool -o yaml | grep -E "ipipMode|vxlanMode"
```

</p>
</details>

### Configure MTU for the Calico CNI plugin

> 🔗 [Concepts > Extending Kubernetes > Compute, Storage, and Networking Extensions > Network Plugins](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/)

> **Note:** MTU 需要根据封装模式和底层网络调整：
> - 底层网络 MTU 1500 + IPIP → pod MTU 1480 (1500 - 20)
> - 底层网络 MTU 1500 + VXLAN → pod MTU 1450 (1500 - 50)
> - 无封装（同子网直连） → pod MTU 1500

<details><summary>show</summary>
<p>

```bash
# === Before install: modify calico.yaml ===

# find the MTU setting in the manifest
grep -n "veth_mtu" calico.yaml

# modify to desired value (e.g., 1450 for VXLAN)

# === After install: modify ConfigMap ===

# check current MTU
kubectl -n kube-system get cm calico-config -o yaml | grep veth_mtu

# edit the ConfigMap
kubectl -n kube-system edit cm calico-config
# change veth_mtu to desired value

# restart calico pods to apply
kubectl -n kube-system rollout restart daemonset calico-node

# verify MTU on a pod's network interface
kubectl exec <pod> -- ip link show eth0 | grep mtu
```

</p>
</details>

### Verify the CNI plugin is working by testing cross-node pod connectivity

> 🔗 [Concepts > Extending Kubernetes > Compute, Storage, and Networking Extensions > Network Plugins](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/)

> **Why this works:** CNI 插件负责三项核心功能：为 pod 分配 IP、配置 pod 网络命名空间、建立跨节点路由（overlay 或 BGP）。如果两个 pod 在**不同节点**上能通过 pod IP 直接通信，说明 CNI 的这三项功能均正常工作。注意：如果 pods 在同一节点上，它们通过本地网桥通信，无法验证跨节点路由。

<details><summary>show</summary>
<p>

```bash
# list available nodes
kubectl get nodes

# create web pod on one node
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: web
spec:
  nodeName: <node-1>   # replace with an actual node name
  containers:
  - name: web
    image: nginx
EOF

# create test pod on a different node
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: test
spec:
  nodeName: <node-2>   # replace with a different node name
  containers:
  - name: test
    image: busybox
    command: ["sleep", "3600"]
EOF

# verify pods are on different nodes
kubectl get pods -o wide

# get the IP of the web pod (note: use "pod web" singular, not "pods")
WEB_IP=$(kubectl get pod web -o jsonpath='{.status.podIP}')

# or, using yq
WEB_IP=$(kubectl get pod web -o yaml | yq '.status.podIP')

# verify cross-node connectivity
kubectl exec test -- wget -O- -T3 http://$WEB_IP
```

</p>
</details>

### List CSI drivers installed in the cluster and inspect storage classes

> 🔗 [Concepts > Storage > Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/)

> **Note:** `kubectl get csidriver` 可能返回空。这是正常的——只有实现了 CSI 规范并注册 `CSIDriver` 对象的驱动才会显示（如 `ebs.csi.aws.com`、`nfs.csi.k8s.io`）。使用旧式 out-of-tree provisioner（如 `nfs-subdir-external-provisioner`）或 in-tree provisioner（如 `kubernetes.io/aws-ebs`）的集群不会有 CSIDriver 资源。StorageClass 的 `provisioner` 字段可以是 CSI driver，也可以是非 CSI provisioner。

<details><summary>show</summary>
<p>

```bash
# list all CSI drivers (may be empty if no CSI drivers are installed)
kubectl get csidriver

# list storage classes and their provisioners
kubectl get sc

# show provisioner for each storage class
kubectl get sc -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.provisioner}{"\n"}{end}'

# or, using yq
kubectl get sc -o yaml | yq '.items[] | .metadata.name + " " + .provisioner'

# find the default storage class
kubectl get sc | grep '(default)'

# describe a specific storage class to see reclaimPolicy, volumeBindingMode, etc.
kubectl describe sc <storage-class-name>
```

</p>
</details>

### Troubleshoot a pod stuck in ContainerCreating due to CNI misconfiguration

> 🔗 [Concepts > Extending Kubernetes > Compute, Storage, and Networking Extensions > Network Plugins](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/)

*此为场景练习，无固定答案。关键步骤：*

```
1. kubectl describe pod <pod> — 查看 Events 中的 CNI 错误信息
2. ssh 到对应 node，检查 /etc/cni/net.d/ 配置文件是否存在
3. 检查 /opt/cni/bin/ 中 CNI 二进制文件是否完整（需有 loopback 等基础插件）
4. journalctl -u kubelet — 查看 kubelet 日志中的 CNI 相关错误
5. kubectl get pods -n kube-system — 确认 CNI 插件的 DaemonSet pods 正常运行
```

---

## 8. Understand CRDs, install and configure operators

> 📖
> [Concepts > Extending Kubernetes > Custom Resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)
> [Concepts > Extending Kubernetes > Operator Pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/)

### Create a CustomResourceDefinition and a custom resource instance

> 🔗 [Tasks > Extend Kubernetes > Use CustomResourceDefinitions](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/)

<details><summary>show</summary>
<p>

```bash
# create a CRD
cat <<EOF | kubectl apply -f -
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: crontabs.stable.example.com
spec:
  group: stable.example.com
  versions:
  - name: v1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            properties:
              cronSpec:
                type: string
              image:
                type: string
              replicas:
                type: integer
  scope: Namespaced
  names:
    plural: crontabs
    singular: crontab
    kind: CronTab
    shortNames:
    - ct
EOF

# verify the CRD is created
kubectl get crd crontabs.stable.example.com

# create an instance of the custom resource
cat <<EOF | kubectl apply -f -
apiVersion: stable.example.com/v1
kind: CronTab
metadata:
  name: my-crontab
spec:
  cronSpec: "* * * * */5"
  image: my-cron-image
  replicas: 3
EOF

# verify the custom resource
kubectl get crontabs        # or: kubectl get ct (using shortName)
kubectl get ct my-crontab -o yaml
```

</p>
</details>

### List existing CRDs in the cluster and inspect a custom resource

> 🔗 [Concepts > Extending Kubernetes > Custom Resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)

<details><summary>show</summary>
<p>

```bash
# list all CRDs in the cluster
kubectl get crd

# describe a specific CRD (shows schema, status, versions)
kubectl describe crd crontabs.stable.example.com

# find custom API resources by group
kubectl api-resources | grep stable.example.com

# list all instances of a custom resource
kubectl get crontabs --all-namespaces

# inspect a specific custom resource
kubectl get ct my-crontab -o yaml
kubectl describe ct my-crontab

# check if the resource has explain support
kubectl explain crontab.spec
```

</p>
</details>

### Delete a CRD and observe that all custom resource instances are also removed

> 🔗 [Tasks > Extend Kubernetes > Use CustomResourceDefinitions](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/)

<details><summary>show</summary>
<p>

```bash
# verify custom resources exist
kubectl get ct
# NAME          AGE
# my-crontab    5m

# create a second instance
cat <<EOF | kubectl apply -f -
apiVersion: stable.example.com/v1
kind: CronTab
metadata:
  name: another-crontab
spec:
  cronSpec: "0 */6 * * *"
  image: another-image
  replicas: 1
EOF

kubectl get ct
# should show 2 instances

# delete the CRD
kubectl delete crd crontabs.stable.example.com

# verify: all custom resource instances are automatically deleted (cascading deletion)
kubectl get ct
# error: the server doesn't have a resource type "crontabs"

# ⚠️ 删除 CRD 会级联删除所有该类型的自定义资源实例，生产环境需谨慎操作
```

</p>
</details>

### Install an operator and verify it reconciles custom resources

> 🔗 [Concepts > Extending Kubernetes > Operator Pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/)

> **Note:** Operator = CRD + Controller。Controller 监听 CR 的变化并自动执行对应操作（reconciliation）。CKA 考试中通常只需理解概念并能安装/验证 operator。

<details><summary>show</summary>
<p>

```bash
# Operator 模式的核心组件:
# 1. CRD — 定义自定义资源的 schema
# 2. Controller — 监听 CR 的增删改，执行 reconciliation 逻辑
# 3. RBAC — Controller 操作集群资源所需的权限

# 安装 operator 通常包含以下步骤:
# 1. 安装 CRDs
kubectl apply -f <operator-crds.yaml>

# 2. 创建 namespace、ServiceAccount、RBAC
kubectl apply -f <operator-rbac.yaml>

# 3. 部署 operator controller（通常是一个 Deployment）
kubectl apply -f <operator-deployment.yaml>

# 验证 operator 运行状态
kubectl get pods -n <operator-namespace>

# 创建自定义资源，观察 operator 的 reconciliation
kubectl apply -f <custom-resource.yaml>

# 查看 operator 创建的子资源（如 Deployments、Services 等）
kubectl get all -l <operator-labels>

# 查看 operator 的事件日志
kubectl get events --field-selector reason=<operator-event>

# 查看 operator controller 的日志
kubectl logs deploy/<operator-name> -n <operator-namespace>
```

</p>
</details>

---

## Killer.sh Mock Exam Questions

> 📚 Source PDFs: [`assets/killer-sh/cka-simulator-a-k8s-1.35.pdf`](../assets/killer-sh/cka-simulator-a-k8s-1.35.pdf) | [`assets/killer-sh/cka-simulator-b-k8s-1.35.pdf`](../assets/killer-sh/cka-simulator-b-k8s-1.35.pdf)
>
> CKA 报名后 killer.sh 提供两次模拟考试（Simulator A & B），各 17 题，难度高于真实考试。下文整理了与本章节（集群架构）相关的题目，完整解答见 PDF。

### [Killer.sh A-Q1] Contexts: extract info from kubeconfig file
> 🔗 [Tasks > Access Applications in a Cluster > Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)
> [Concepts > Configuration > Organize Cluster Access Using kubeconfig Files](https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/)

> 🖥 Solve on: `ssh cka9412`

**Task:**

You're asked to extract the following information out of kubeconfig file `/opt/course/1/kubeconfig` on `cka9412`:

1. Write all kubeconfig context names into `/opt/course/1/contexts`, one per line
2. Write the name of the current context into `/opt/course/1/current-context`
3. Write the client-certificate of user `account-0027` base64-decoded into `/opt/course/1/cert`

**Lab context:**

- Hostname: `cka9412` (controlplane)
- Kubeconfig file already exists at `/opt/course/1/kubeconfig` with contexts `cluster-admin`, `cluster-w100`, `cluster-w200` (current context is `cluster-w200`)
- Target directory `/opt/course/1/` already exists

<details><summary>show</summary>
<p>

```bash
ssh cka9412

# 1. all context names
k --kubeconfig /opt/course/1/kubeconfig config get-contexts -oname > /opt/course/1/contexts

# 2. current context
k --kubeconfig /opt/course/1/kubeconfig config current-context > /opt/course/1/current-context

# 3. base64-decoded client cert for account-0027
k --kubeconfig /opt/course/1/kubeconfig config view --raw \
  -ojsonpath='{.users[?(@.name=="account-0027@internal")].user.client-certificate-data}' \
  | base64 -d > /opt/course/1/cert
```

</p>
</details>

### [Killer.sh A-Q2] Helm: install cert-manager + ClusterIssuer with CRL
> 🔗 [Concepts > Extending Kubernetes > Custom Resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)
> [Helm > Documentation](https://helm.sh/docs/)

> 🖥 Solve on: `ssh cka7968`

**Task:**

Install cert-manager using Helm in Namespace `cert-manager`. Then configure and create the ClusterIssuer CRD:

1. Create Namespace `cert-manager`
2. Install Helm chart `jetstack/cert-manager` (with `crds.enabled=true`) into the new Namespace. The Helm Release should be called `cert-manager`
3. Update the ClusterIssuer resource in `/opt/course/2/cluster-issuer.yaml` to include `crlDistributionPoints: ["http://example.com/crl"]` under `spec.selfSigned`
4. Create the ClusterIssuer resource from `/opt/course/2/cluster-issuer.yaml`

> ℹ️ It is not required for cert-manager to issue real certificates. Installing the Helm Chart and the ClusterIssuer resource as requested is enough

**Lab context:**

- Hostname: `cka7968` (controlplane)
- Helm repo `jetstack` is already configured (pointing at `http://localhost:6000`); chart `jetstack/cert-manager` is available
- Existing `/opt/course/2/cluster-issuer.yaml`:
  ```yaml
  apiVersion: cert-manager.io/v1
  kind: ClusterIssuer
  metadata:
    name: course-issuer
  spec:
    selfSigned:
  ```

<details><summary>show</summary>
<p>

```bash
k create ns cert-manager

helm repo add jetstack https://charts.jetstack.io
helm repo update
helm -n cert-manager install cert-manager jetstack/cert-manager --set crds.enabled=true

# edit /opt/course/2/cluster-issuer.yaml, add under spec.selfSigned:
# crlDistributionPoints:
# - "http://example.com/crl"

k apply -f /opt/course/2/cluster-issuer.yaml

# verify
k get clusterissuer
k -n cert-manager get pods
```

</p>
</details>

### [Killer.sh A-Q8] kubeadm join: upgrade node + join to cluster
> 🔗 [Tasks > Administer a Cluster > Administration with kubeadm > Adding Linux worker nodes](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/adding-linux-nodes/)
> [Tasks > Administer a Cluster > Administration with kubeadm > Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)
> [Reference > Setup tools reference > Kubeadm > kubeadm join](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join/)

> 🖥 Solve on: `ssh cka3962`

**Task:**

Your coworker notified you that node `cka3962-node1` is running an older Kubernetes version and is not even part of the cluster yet.

1. Update the node's Kubernetes to the exact version of the controlplane
2. Add the node to the cluster using `kubeadm`

> ℹ️ You can connect to the worker node using `ssh cka3962-node1` from `cka3962`

**Lab context:**

- Hostname: `cka3962` (controlplane) — connect to worker via `ssh cka3962-node1`
- Controlplane is running Kubernetes `v1.35.2`
- On `cka3962-node1`: `kubeadm` is already at `v1.35.2`, but `kubectl` and `kubelet` are at `v1.34.5`, and the node has not yet joined the cluster

<details><summary>show</summary>
<p>

```bash
# check controlplane version
k get node
# e.g. v1.35.2

ssh cka3962-node1
sudo -i

apt update
apt install -y kubectl=1.35.2-1.1 kubelet=1.35.2-1.1
systemctl restart kubelet

exit; exit  # back to controlplane

# generate join command
kubeadm token create --print-join-command
# kubeadm join 192.168.100.31:6443 --token xxx --discovery-token-ca-cert-hash sha256:xxx

# run join command on node
ssh cka3962-node1 'sudo kubeadm join 192.168.100.31:6443 --token xxx --discovery-token-ca-cert-hash sha256:xxx'

k get nodes  # node should appear as Ready
```

</p>
</details>

### [Killer.sh A-Q9] API from Pod: query Secrets via ServiceAccount token
> 🔗 [Tasks > Run Applications > Accessing the Kubernetes API from a Pod](https://kubernetes.io/docs/tasks/run-application/access-api-from-pod/)
> [Tasks > Configure Pods and Containers > Configure Service Accounts for Pods](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/)

> 🖥 Solve on: `ssh cka9412`

**Task:**

There is ServiceAccount `secret-reader` in Namespace `project-swan`. Create a Pod of image `nginx:1-alpine` named `api-contact` which uses this ServiceAccount.

Exec into the Pod and use `curl` to manually query all Secrets from the Kubernetes Api.
Write the result into file `/opt/course/9/result.json`.

**Lab context:**

- Hostname: `cka9412` (controlplane)
- Existing ServiceAccount `secret-reader` in Namespace `project-swan` (already authorized to list Secrets)
- Target directory `/opt/course/9/` already exists

<details><summary>show</summary>
<p>

```yaml
# api-contact.yaml
apiVersion: v1
kind: Pod
metadata:
  name: api-contact
  namespace: project-swan
spec:
  serviceAccountName: secret-reader
  containers:
  - name: nginx
    image: nginx:1-alpine
```

```bash
k apply -f api-contact.yaml

k -n project-swan exec api-contact -it -- sh
# inside pod:
TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
curl -k https://kubernetes.default/api/v1/secrets \
  -H "Authorization: Bearer ${TOKEN}" > /tmp/result.json
exit

k -n project-swan cp api-contact:/tmp/result.json /opt/course/9/result.json
```

</p>
</details>

### [Killer.sh A-Q10] RBAC: SA + create-only Role for Secrets/ConfigMaps
> 🔗 [Reference > Access Authn Authz > Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
> [Tasks > Configure Pods and Containers > Configure Service Accounts for Pods](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/)

> 🖥 Solve on: `ssh cka3962`

**Task:**

Create a new ServiceAccount `processor` in Namespace `project-hamster`. Create a Role and RoleBinding, both named `processor` as well. These should allow the new SA to only create Secrets and ConfigMaps in that Namespace.

**Lab context:**

- Hostname: `cka3962` (controlplane)
- Namespace `project-hamster` already exists

<details><summary>show</summary>
<p>

```bash
k -n project-hamster create sa processor

k -n project-hamster create role processor \
  --verb=create \
  --resource=secret \
  --resource=configmap

k -n project-hamster create rolebinding processor \
  --role=processor \
  --serviceaccount=project-hamster:processor

# verify
k -n project-hamster auth can-i create secret --as=system:serviceaccount:project-hamster:processor   # yes
k -n project-hamster auth can-i delete secret --as=system:serviceaccount:project-hamster:processor   # no
```

</p>
</details>

### [Killer.sh A-Q14] Certs: check apiserver expiry + prep kubeadm renew
> 🔗 [Tasks > Administer a Cluster > Administration with kubeadm > Certificate Management with kubeadm](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/)

> 🖥 Solve on: `ssh cka9412`

**Task:**

Perform some tasks on cluster certificates:

1. Check how long the kube-apiserver server certificate is valid using `openssl` or `cfssl`. Write the expiration date into `/opt/course/14/expiration`. Run the `kubeadm` command to list the expiration dates and confirm both methods show the same one
2. Write the kubeadm command that would renew the kube-apiserver certificate into `/opt/course/14/kubeadm-renew-certs.sh`

**Lab context:**

- Hostname: `cka9412` (controlplane)
- kube-apiserver certificate present at `/etc/kubernetes/pki/apiserver.crt`
- Target directory `/opt/course/14/` already exists

<details><summary>show</summary>
<p>

```bash
# expiration from openssl
openssl x509 -noout -text -in /etc/kubernetes/pki/apiserver.crt \
  | grep -A2 "Validity"
# Not After : Oct 29 14:19:27 2025 GMT

echo "Oct 29 14:19:27 2025 GMT" > /opt/course/14/expiration

# confirm with kubeadm
kubeadm certs check-expiration | grep apiserver

# renewal command
cat > /opt/course/14/kubeadm-renew-certs.sh <<EOF
#!/bin/bash
kubeadm certs renew apiserver
EOF
chmod +x /opt/course/14/kubeadm-renew-certs.sh
```

</p>
</details>

### [Killer.sh B-Q2] Static Pod: create on controlplane + NodePort Service
> 🔗 [Tasks > Configure Pods and Containers > Create static Pods](https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/)
> [Concepts > Services, Load Balancing, and Networking > Service](https://kubernetes.io/docs/concepts/services-networking/service/)

> 🖥 Solve on: `ssh cka2560`

**Task:**

Create a Static Pod named `my-static-pod` in Namespace `default` on the controlplane node. It should be of image `nginx:1-alpine` and have resource requests for `10m` CPU and `20Mi` memory.

Create a NodePort Service named `static-pod-service` which exposes that static Pod on port `80`.

> ℹ️ For verification check if the new Service has one Endpoint. It should also be possible to access the Pod via the `cka2560` internal IP address, like using `curl 192.168.100.31:NODE_PORT`

**Lab context:**

- Hostname: `cka2560` (controlplane)
- Static Pod manifests directory: `/etc/kubernetes/manifests/`
- Controlplane internal IP: `192.168.100.31`

<details><summary>show</summary>
<p>

```bash
# on controlplane node
ssh <controlplane>
sudo -i

# create static pod manifest
cat > /etc/kubernetes/manifests/my-static-pod.yaml <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: my-static-pod
spec:
  containers:
  - name: nginx
    image: nginx:1-alpine
    resources:
      requests:
        cpu: 10m
        memory: 20Mi
EOF

# kubelet picks it up automatically; pod will be named my-static-pod-<nodename>
k get pod
# my-static-pod-cka2560   1/1   Running

# expose via NodePort
k expose pod my-static-pod-cka2560 --name=static-pod-service --type=NodePort --port=80
```

</p>
</details>

### [Killer.sh B-Q3] Kubelet certs: inspect client + server Issuer / EKU
> 🔗 [Reference > Access Authn Authz > PKI Certificates and Requirements](https://kubernetes.io/docs/setup/best-practices/certificates/)
> [Reference > Access Authn Authz > TLS bootstrapping](https://kubernetes.io/docs/reference/access-authn-authz/kubelet-tls-bootstrapping/)

> 🖥 Solve on: `ssh cka5248`

**Task:**

Node `cka5248-node1` has been added to the cluster using kubeadm and TLS bootstrapping.

Find the Issuer and Extended Key Usage values on `cka5248-node1` for:

1. Kubelet Client Certificate, the one used for outgoing connections to the kube-apiserver
2. Kubelet Server Certificate, the one used for incoming connections from the kube-apiserver

Write the information into file `/opt/course/3/certificate-info.txt`.

> ℹ️ You can connect to the worker node using `ssh cka5248-node1` from `cka5248`

**Lab context:**

- Hostname: `cka5248` (controlplane) — connect to worker via `ssh cka5248-node1`
- Kubelet pki directory on the worker: `/var/lib/kubelet/pki/` (contains `kubelet-client-current.pem` and `kubelet.crt`)
- Target directory `/opt/course/3/` already exists on `cka5248`

<details><summary>show</summary>
<p>

```bash
ssh cka5248-node1
sudo -i

# Client cert (kubelet → kube-apiserver)
openssl x509 -noout -text -in /var/lib/kubelet/pki/kubelet-client-current.pem \
  | grep -E "Issuer:|Extended Key Usage:" -A1
# Issuer: CN=kubernetes
# Extended Key Usage: TLS Web Client Authentication

# Server cert (kube-apiserver → kubelet)
openssl x509 -noout -text -in /var/lib/kubelet/pki/kubelet.crt \
  | grep -E "Issuer:|Extended Key Usage:" -A1
# Issuer: CN=cka5248-node1-ca@<ts>
# Extended Key Usage: TLS Web Server Authentication

# write findings
cat > /opt/course/3/certificate-info.txt <<EOF
Kubelet Client Certificate:
  Issuer: CN=kubernetes
  Extended Key Usage: TLS Web Client Authentication

Kubelet Server Certificate:
  Issuer: CN=cka5248-node1-ca
  Extended Key Usage: TLS Web Server Authentication
EOF
```

</p>
</details>

### [Killer.sh B-Q7] etcd: version check + snapshot save
> 🔗 [Tasks > Administer a Cluster > Operating etcd clusters for Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/)

> 🖥 Solve on: `ssh cka2560`

**Task:**

You have been tasked to perform the following etcd operations:

1. Run `etcd --version` and store the output at `/opt/course/7/etcd-version`
2. Make a snapshot of etcd and save it at `/opt/course/7/etcd-snapshot.db`

**Lab context:**

- Hostname: `cka2560` (controlplane)
- etcd runs as a static Pod (`etcd-cka2560` in `kube-system`); `etcd` binary is not installed directly on the host
- etcd certificates available under `/etc/kubernetes/pki/etcd/` (`ca.crt`, `server.crt`, `server.key`)
- Target directory `/opt/course/7/` already exists

<details><summary>show</summary>
<p>

```bash
# etcd version (via static pod)
k -n kube-system exec etcd-cka2560 -- etcd --version > /opt/course/7/etcd-version

# snapshot save
ETCDCTL_API=3 etcdctl snapshot save /opt/course/7/etcd-snapshot.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# verify
etcdctl snapshot status /opt/course/7/etcd-snapshot.db --write-out=table
```

</p>
</details>

### [Killer.sh B-Q8] Controlplane: identify how each component is started
> 🔗 [Concepts > Overview > Components of Kubernetes](https://kubernetes.io/docs/concepts/overview/components/)
> [Tasks > Configure Pods and Containers > Create static Pods](https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/)

> 🖥 Solve on: `ssh cka8448`

**Task:**

Check how the controlplane components `kubelet`, `kube-apiserver`, `kube-scheduler`, `kube-controller-manager` and `etcd` are started/installed on the controlplane node.

Also find out the name of the DNS application and how it's started/installed in the cluster.

Write your findings into file `/opt/course/8/controlplane-components.txt`. The file should be structured like:

```
# /opt/course/8/controlplane-components.txt
kubelet: [TYPE]
kube-apiserver: [TYPE]
kube-scheduler: [TYPE]
kube-controller-manager: [TYPE]
etcd: [TYPE]
dns: [TYPE] [NAME]
```

Choices of `[TYPE]` are: `not-installed`, `process`, `static-pod`, `pod`

**Lab context:**

- Hostname: `cka8448` (controlplane, single-node cluster)
- Cluster was set up using `kubeadm`
- Target directory `/opt/course/8/` already exists

<details><summary>show</summary>
<p>

```bash
service kubelet status        # process (systemd)
ls /etc/kubernetes/manifests/  # apiserver, scheduler, controller-manager, etcd → static-pod
k -n kube-system get deploy    # coredns → Deployment → pod

cat > /opt/course/8/controlplane-components.txt <<EOF
kubelet: process
kube-apiserver: static-pod
kube-scheduler: static-pod
kube-controller-manager: static-pod
etcd: static-pod
dns: pod coredns
EOF
```

</p>
</details>

### [Killer.sh B-Q14] Cluster info: discover topology + configuration
> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
> [Concepts > Cluster Administration > Cluster Networking](https://kubernetes.io/docs/concepts/cluster-administration/networking/)
> [Tasks > Configure Pods and Containers > Create static Pods](https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/)

> 🖥 Solve on: `ssh cka8448`

**Task:**

You're ask to find out following information about the cluster:

1. How many controlplane nodes are available?
2. How many worker nodes (non controlplane nodes) are available?
3. What is the Service CIDR?
4. Which Networking (or CNI Plugin) is configured and where is its config file?
5. Which suffix will static pods have that run on `cka8448`?

Write your answers into file `/opt/course/14/cluster-info`, structured like this:

```
# /opt/course/14/cluster-info
1: [ANSWER]
2: [ANSWER]
3: [ANSWER]
4: [ANSWER]
5: [ANSWER]
```

**Lab context:**

- Hostname: `cka8448` (controlplane)
- Target directory `/opt/course/14/` already exists

<details><summary>show</summary>
<p>

```bash
# node counts
k get node
# 1 controlplane + 1 worker

# Service CIDR
grep -E "service-cluster-ip-range" /etc/kubernetes/manifests/kube-apiserver.yaml
# --service-cluster-ip-range=10.96.0.0/12

# CNI plugin
ls /etc/cni/net.d/
# 10-weave.conflist

# static pod suffix on cka8448
k get pod -n kube-system -o wide | grep cka8448
# pods are named e.g. kube-apiserver-cka8448  → suffix is "-cka8448"

cat > /opt/course/14/cluster-info <<EOF
1: there are 1 controlplane node
2: there are 1 worker node
3: Service CIDR: 10.96.0.0/12
4: CNI plugin: Weave, config: /etc/cni/net.d/10-weave.conflist
5: static pods on cka8448 have suffix: -cka8448
EOF
```

</p>
</details>

### [Killer.sh B-Q16] api-resources: list namespaced + find ns with most Roles
> 🔗 [Reference > Command line tool (kubectl) > kubectl Quick Reference: Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)
> [Reference > Command line tool (kubectl) > kubectl Quick Reference](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
> [Concepts > Overview > Working with Kubernetes Objects > Namespaces](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/)

> 🖥 Solve on: `ssh cka3200`

**Task:**

Write the names of all namespaced Kubernetes resources (like Pod, Secret, ConfigMap...) into `/opt/course/16/resources.txt`.

Find the `project-*` Namespace with the highest number of Roles defined in it and write its name and amount of Roles into `/opt/course/16/crowded-namespace.txt`.

**Lab context:**

- Hostname: `cka3200` (controlplane)
- Several `project-*` Namespaces exist (e.g. `project-jinan`, `project-miami`, `project-melbourne`, `project-seoul`, `project-toronto`)
- Target directory `/opt/course/16/` already exists

<details><summary>show</summary>
<p>

```bash
# all namespaced resources
k api-resources --namespaced -o name > /opt/course/16/resources.txt

# find project-* namespace with most Roles
for ns in $(k get ns -o name | grep -oE 'project-[a-z]+'); do
  count=$(k -n $ns get role --no-headers 2>/dev/null | wc -l)
  echo "$ns $count"
done | sort -k2 -n -r | head -1

# write top result
echo "project-miami with 300 roles" > /opt/course/16/crowded-namespace.txt
```

</p>
</details>

### [Killer.sh B-Q17] Operator: install via Kustomize, fix RBAC, add CR
> 🔗 [Concepts > Extending Kubernetes > Operator Pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/)
> [Reference > Access Authn Authz > Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
> [Tasks > Manage Kubernetes Objects > Declarative Management of Kubernetes Objects Using Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/)

> 🖥 Solve on: `ssh cka6016`

**Task:**

There is Kustomize config available at `/opt/course/17/operator`. It installs an operator which works with different CRDs. It has been deployed like this:

```
kubectl kustomize /opt/course/17/operator/prod | kubectl apply -f -
```

Perform the following changes in the Kustomize base config:

1. The operator needs to list certain CRDs. Check the logs to find out which ones and adjust the permissions for Role `operator-role`
2. Add a new `Student` resource called `student4` with any name and description

Deploy your Kustomize config changes to `prod`.

**Lab context:**

- Hostname: `cka6016` (controlplane)
- Kustomize tree at `/opt/course/17/operator/` with `base/` and `prod/` directories
- Operator already deployed in Namespace `operator-prod` (Pod is running but failing to `list` `students.education.killer.sh` and `classes.education.killer.sh` due to missing RBAC)
- Existing `Student` resources: `student1`, `student2`, `student3`; existing `Class`: `advanced`

<details><summary>show</summary>
<p>

```bash
# check operator logs for Forbidden errors
k -n operator-prod logs <operator-pod>
# "students.education.killer.sh is forbidden" + "classes.education.killer.sh is forbidden"

# edit base/rbac.yaml — add Role rule:
# - apiGroups: ["education.killer.sh"]
#   resources: ["students", "classes"]
#   verbs: ["list"]

# edit base/students.yaml — append:
# ---
# apiVersion: education.killer.sh/v1
# kind: Student
# metadata:
#   name: student4
# spec:
#   name: "Alice"
#   description: "exam practice"

# deploy to prod
kubectl kustomize /opt/course/17/operator/prod | kubectl apply -f -

# verify operator pod restarts and lists succeed
k -n operator-prod logs <operator-pod> -f
```

</p>
</details>

## KillerCoda Mock Exam Questions

> 📚 Source PDF: [`assets/killercoda/b-architecture-installation-and-maintenance.pdf`](../assets/killercoda/b-architecture-installation-and-maintenance.pdf)

### [KillerCoda-Q1] Find the Node that consumes the most MEMORY in all cluster(currently we have sin - 4 pts

> 🔗 [Setup > Production environment > Installing Kubernetes with deployment tools](https://kubernetes.io/docs/setup/production-environment/tools/)

**Task:**

Find the Node that consumes the most MEMORY in all cluster(currently we have single cluster).
Then, store the result in the file high_memory_node.txt with the following format:
current_context,node_name .

<details><summary>show</summary>
<p>

```bash
Step 1: kubectl top node
Step 2: echo "kubernetes-admin@kubernetes,controlplane" > high_memory_node.txt
```

</p>
</details>

### [KillerCoda-Q2] application-pod pod is running, save All ERROR's pod logs only in - 4 pts

> 🔗 [Setup > Production environment > Installing Kubernetes with deployment tools](https://kubernetes.io/docs/setup/production-environment/tools/)

**Task:**

application-pod pod is running, save All ERROR's pod logs only in
poderrorlogs.txt

<details><summary>show</summary>
<p>

```bash
Step 1: kubectl logs application-pod | grep ERROR
Step 2: Save it in file poderrorlogs.txt
```

</p>
</details>

### [KillerCoda-Q3] alpine-reader-pod pod is running, save All INFO and ERROR's pod logs in - 4 pts

> 🔗 [Setup > Production environment > Installing Kubernetes with deployment tools](https://kubernetes.io/docs/setup/production-environment/tools/)

**Task:**

alpine-reader-pod pod is running, save All INFO and ERROR's pod logs in
podlogs.txt

<details><summary>show</summary>
<p>

```bash
Step 1: kubectl logs alpine-reader-pod | grep -E INFO|ERROR
Step 2: Save it in file podlogs.txt
```

</p>
</details>

### [KillerCoda-Q4] log-reader-pod pod is running, save All pod logs in podalllogs.txt - 4 pts

> 🔗 [Setup > Production environment > Installing Kubernetes with deployment tools](https://kubernetes.io/docs/setup/production-environment/tools/)

**Task:**

log-reader-pod pod is running, save All pod logs in podalllogs.txt

<details><summary>show</summary>
<p>

```bash
Step 1: kubectl logs log-reader-pod
Step 2: Save it in file podalllogs.txt
```

</p>
</details>

### [KillerCoda-Q5] Decode the contents of the existing secret named database-data in the - 2 pts

> 🔗 [Setup > Production environment > Installing Kubernetes with deployment tools](https://kubernetes.io/docs/setup/production-environment/tools/)

**Task:**

Decode the contents of the existing secret named database-data in the
database-ns namespace and save the decoded content into a file located at
decoded.txt

<details><summary>show</summary>
<p>

```bash
Step 1: get the encoded value

kubectl get secret database-data -n database-ns -o yaml

Step 2: Decode the encoded value

echo "c2VjcmV0" | base64 -d

Step 3: Save it in file

echo "secret" > decoded.txt
```

</p>
</details>

### [KillerCoda-Q6] Create a Kubernetes Secret named database-app-secret in the default - 2 pts

> 🔗 [Setup > Production environment > Installing Kubernetes with deployment tools](https://kubernetes.io/docs/setup/production-environment/tools/)

**Task:**

Create a Kubernetes Secret named database-app-secret in the default
namespace using the contents of the file database-data.txt

<details><summary>show</summary>
<p>

```bash
kubectl create secret generic database-app-secret --from-file=database-data.txt -n default
```

</p>
</details>

### [KillerCoda-Q7] Upgrade controlplane node kubeadm , cluster and kubelet to next version - 10 pts

> 🔗 [Setup > Production environment > Installing Kubernetes with deployment tools](https://kubernetes.io/docs/setup/production-environment/tools/)

**Task:**

Upgrade controlplane node kubeadm , cluster and kubelet to next version.

EXAMPLE: If current version is v1.27.1 then upgrade to v1.27.2

<details><summary>show</summary>
<p>

```bash
Step 1: Find the latest patch release for Kubernetes 1.27 using the OS package manager:

apt update

apt-cache madison kubeadm
Step 2: Upgrade kubeadm:

apt-mark unhold kubeadm && \

apt-get update && apt-get install -y kubeadm=1.27.2-00 && \

apt-mark hold kubeadm
Step 3: Verify that the download works and has the expected version:

kubeadm version

Step 4: Verify the upgrade plan:

kubeadm upgrade plan

Step 5: Choose a version to upgrade(cluster) to, and run the appropriate command.

sudo kubeadm upgrade apply v1.27.2

Step 6: Upgrade the kubelet and kubectl:

apt-mark unhold kubelet kubectl && \

apt-get update && apt-get install -y kubelet=1.27.2-00
kubectl=1.27.2-00 && \

apt-mark hold kubelet kubectl
Step 7: Restart the kubelet:

sudo systemctl daemon-reload

sudo systemctl restart kubelet
```

</p>
</details>

### [KillerCoda-Q8] you have a script named svc-filter.sh . Update this script to include a command - 2 pts

> 🔗 [Setup > Production environment > Installing Kubernetes with deployment tools](https://kubernetes.io/docs/setup/production-environment/tools/)

**Task:**

you have a script named svc-filter.sh . Update this script to include a command that filters and
displays the value of target port of a service named redis-service using jsonpath only.

<details><summary>show</summary>
<p>

```bash
add this below command in svc-filter.sh file

kubectl get svc redis-service -o jsonpath='{.spec.ports[0].targetPort}'

OR

kubectl get service redis-service -o jsonpath='{.spec.ports[0].targetPort}'
```

</p>
</details>

### [KillerCoda-Q9] Create a Kubernetes Pod configuration to facilitate real-time monitoring of a lo - 8 pts

> 🔗 [Setup > Production environment > Installing Kubernetes with deployment tools](https://kubernetes.io/docs/setup/production-environment/tools/)

**Task:**

Create a Kubernetes Pod configuration to facilitate real-time monitoring of a log
file. Specifically, you need to set up a Pod named alpine-pod-pod that runs an
Alpine Linux container.

Requirements:

     - Name the Pod alpine-pod-pod .
     - Use alpine:latest image
     - Configure the container to execute the tail -f /config/log.txt command
       using /bin/sh to continuously monitor and display the contents of a log file.
     - Set up a volume named config-volume that maps to a ConfigMap named
       log-configmap , this log-configmap already available.
     - Ensure the Pod has a restart policy of Never .

<details><summary>show</summary>
<p>

```bash
Step 1: Get the pod template

kubectl run alpine-pod-pod --image=alpine:latest --dry-run=client -o yaml > pod.yaml

Step 2: Update the pod template

apiVersion: v1
kind: Pod
metadata:
 name: alpine-pod-pod
spec:
 containers:
 - name: alpine-container
   image: alpine:latest
   command: ["/bin/sh", "-c"]
   args:
   - "tail -f /config/log.txt"
   volumeMounts:
   - name: config-volume
    mountPath: /config
 volumes:
 - name: config-volume
   configMap:
    name: log-configmap
 restartPolicy: Never
```

</p>
</details>

### [KillerCoda-Q10] you have a script named pod-filter.sh . Update this script to include a command - 2 pts

> 🔗 [Setup > Production environment > Installing Kubernetes with deployment tools](https://kubernetes.io/docs/setup/production-environment/tools/)

**Task:**

you have a script named pod-filter.sh . Update this script to include a command
that filters and displays the label with the value application of a pod named
nginx-pod using jsonpath only.

<details><summary>show</summary>
<p>

```bash
add this below command in pod-filter.sh file

kubectl get pod nginx-pod -o=jsonpath='{.metadata.labels.application}'
```

</p>
</details>

### [KillerCoda-Q12] Find the pod that consumes the most CPU in all namespace(including - 4 pts

> 🔗 [Setup > Production environment > Installing Kubernetes with deployment tools](https://kubernetes.io/docs/setup/production-environment/tools/)

**Task:**

Find the pod that consumes the most CPU in all namespace(including
kube-system) in all cluster(currently we have single cluster). Then, store the
result in the file high_cpu_pod.txt with the following format: pod_name,namespace .

<details><summary>show</summary>
<p>

```bash
Step 1:Check which pod consumed the most CPU kubectl top po -A

Step 2: Save it in file echo "kube-apiserver-controlplane,kube-system" > high_cpu_pod.txt
```

</p>
</details>

### [KillerCoda-Q13] product pod is running. when you access logs of this pod, it displays the output - 4 pts

> 🔗 [Setup > Production environment > Installing Kubernetes with deployment tools](https://kubernetes.io/docs/setup/production-environment/tools/)

**Task:**

product pod is running. when you access logs of this pod, it displays the output Mi Tv Is Good

Please update the pod definition file to utilize an environment variable with the value Sony Tv Is
Good Then, recreate this pod with the modified configuration.

<details><summary>show</summary>
<p>

```bash
Step 1: edit pod

kubectl edit pod product

Step 2: Update and Save(wq). From-

 containers:
 - command:
   - sh
   - -c
   -t echo 'Mi Tv Is Good' && sleep 3600
To-

 containers:
 - command:
   - sh
  - -c
  -t echo 'Sony Tv Is Good' && sleep 3600
This will give update pod template (Ex: /tmp/kubectl-edit-<random-number>.yaml)

Step 3: To recreate pod(fast use --force flag) with update template

kubectl replace -f /tmp/kubectl-edit-2137593717.yaml --force
```

</p>
</details>

### [KillerCoda-Q14] etcd-controlplane pod is running in kube-system environment, take backup and - 10 pts

> 🔗 [Setup > Production environment > Installing Kubernetes with deployment tools](https://kubernetes.io/docs/setup/production-environment/tools/)

**Task:**

etcd-controlplane pod is running in kube-system environment, take backup and
store it in /opt/cluster_backup.db file, and also store backup console output store
it in backup.txt

<details><summary>show</summary>
<p>

```bash
Step 1: Take backup

etcdctl --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt
--cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key snapshot save
/opt/cluster_backup.db
Step 2: Save console o/p in a file backup.txt
```

</p>
</details>

### [KillerCoda-Q15] etcd-controlplane pod is running in kube-system environment, take backup and - 10 pts

> 🔗 [Setup > Production environment > Installing Kubernetes with deployment tools](https://kubernetes.io/docs/setup/production-environment/tools/)

**Task:**

etcd-controlplane pod is running in kube-system environment, take backup and
store it in /opt/cluster_backup.db file.

ETCD backup is stored at the path /opt/cluster_backup.db on the controlplane
node. for --data-dir use /root/default.etcd , restore it on the controlplane node
itself and , and also store restore console output store it in restore.txt

<details><summary>show</summary>
<p>

```bash
Step 1: run restore command

etcdctl snapshot restore /opt/cluster_backup.db --data-dir=/root/default.etcd
--cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt
--key=/etc/kubernetes/pki/etcd/server.key

Step 2: Save console o/p in a file restore.txt
```

</p>
</details>

