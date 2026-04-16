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

<details><summary>show</summary>
<p>

```bash
# create a private key using openssl with 2048-bit encryption
openssl genrsa -out sandra.key 2048

# create a certificate signing request to give to the Kubernetes API
openssl req -new -key sandra.key -subj "/CN=sandra" -out sandra.csr

# store the file `sandra.csr` in an environment variable named "REQUEST"
export REQUEST=$(cat sandra.csr | base64 -w 0)

# create the CSR as a Kubernetes resource
cat <<EOF | kubectl apply -f -
apiVersion: certificates.k8s.io/v1
kind: CertificateSigningRequest
metadata:
  name: sandra
spec:
  groups:
  - developers
  request: $REQUEST
  signerName: kubernetes.io/kube-apiserver-client
  usages:
  - client auth
EOF

# list the requests in the Kubernetes cluster
k get csr

# approve the csr resource
k certificate approve sandra

# extract the client certificate from the approved csr
k get csr sandra -o jsonpath='{.status.certificate}' | base64 -d > sandra.crt

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

---

## 2. Prepare underlying infrastructure for installing a Kubernetes cluster

> 📖
>- [Getting started > Best practices > PKI certificates and requirements](https://kubernetes.io/docs/setup/best-practices/certificates/)
>- [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Configuring each kubelet in your cluster using kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/kubelet-integration/)
>- [Reference > API Overview > Kubernetes API health endpoints](https://kubernetes.io/docs/reference/using-api/health-checks/)

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

---

## 5. Implement and configure a highly-available control plane

> 📖
> [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Options for Highly Available Topology](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/ha-topology/)
> [Getting started > Production environment > Installing Kubernetes with deployment tools > Bootstrapping clusters with kubeadm > Creating Highly Available Clusters with kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/high-availability/)

_原文档暂无此考点的练习。_

---

## 6. Use Helm and Kustomize to install cluster components

> 📖
> [Tasks > Manage Kubernetes Objects > Managing Kubernetes Objects Using Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/)
> [Helm Documentation](https://helm.sh/docs/)

_原文档暂无此考点的练习。_

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

<details><summary>show</summary>
<p>

```bash
# list all CSI drivers
kubectl get csidriver

# list storage classes and their provisioners
kubectl get sc

# show provisioner for each storage class
kubectl get sc -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.provisioner}{"\n"}{end}'

# find the default storage class
kubectl get sc -o jsonpath='{.items[?(@.metadata.annotations.storageclass\.kubernetes\.io/is-default-class=="true")].metadata.name}'

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

_原文档暂无此考点的练习。_
