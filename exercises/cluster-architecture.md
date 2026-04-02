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

> 📖 [PKI certificates and requirements](https://kubernetes.io/docs/setup/best-practices/certificates/) · [Configuring each kubelet in your cluster using kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/kubelet-integration/) · [Kubernetes API health endpoints](https://kubernetes.io/docs/reference/using-api/health-checks/)

### List the services on your Linux operating system that are associated with Kubernetes

> 🔗 [Configuring each kubelet in your cluster using kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/kubelet-integration/)

<details><summary>show</summary>
<p>

```bash
systemctl list-unit-files --type service --all | grep kube
```

</p>
</details>

### List the status of the kubelet service running on the Kubernetes node

> 🔗 [Configuring each kubelet in your cluster using kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/kubelet-integration/)

<details><summary>show</summary>
<p>

```bash
systemctl status kubelet
```

</p>
</details>

### Get the status of the control plane components (cluster health)

> 🔗 [Kubernetes API health endpoints](https://kubernetes.io/docs/reference/using-api/health-checks/)

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

[Kubernetes API Health Endpoints](https://kubernetes.io/docs/reference/using-api/health-checks/)

</p>
</details>

### Perform the command to list all API resources in your Kubernetes cluster

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl api-resources
```

</p>
</details>

### Restart kubelet on the node

> 🔗 [Configuring each kubelet in your cluster using kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/kubelet-integration/)

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

> 📖 [Creating a cluster with kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/) · [Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)

### Upgrade the control plane components using kubeadm. When completed, check that everything, including kubelet and kubectl is upgrade to version 1.31.6

> 🔗 [Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)

<details><summary>show</summary>
<p>

```bash
# list the control plane components at their current version and target version
kubeadm upgrade plan

# apply the upgrade to 1.31.6
kubeadm upgrade apply v1.31.6

# optionally upgrade kubeadm
# this is if you get the message "Specified version to upgrade to "v1.31.6" is higher than the kubeadm version "v1.31.0". Upgrade kubeadm first using the tool you used to install kubeadm"

# Download the public signing key for the Kubernetes package repositories
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.31/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

# Add the appropriate Kubernetes apt repository
# This overwrites any existing configuration in /etc/apt/sources.list.d/kubernetes.list
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.31/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list

# update kubeadm to version 1.31.6-1.1
sudo apt install -y kubeadm=1.31.6-1.1

# try again to upgrade the control plane components using kubeadm
kubeadm upgrade apply v1.31.6 -y

# run kubeadm upgrade plan again to verify that everything is upgraded to 1.31.6
kubeadm upgrade plan
```

</p>
</details>

### Upgrade kubeadm to version 1.18.6

> 🔗 [Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)

<details><summary>show</summary>
<p>

```bash
sudo apt install -y kubeadm --allow-change-held-packages kubeadm=1.18.6-00
```

</p>
</details>

### Plan and upgrade the control plane components with kubeadm to version 1.18.6

> 🔗 [Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)

<details><summary>show</summary>
<p>

```bash
sudo kubeadm upgrade plan

sudo kubeadm upgrade apply v1.18.6
```

</p>
</details>

### Update kubelet to version 1.18.6

> 🔗 [Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)

<details><summary>show</summary>
<p>

```bash
sudo apt install kubelet=1.18.6-00
```

</p>
</details>

### Update kubectl to version 1.18.6

> 🔗 [Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)

<details><summary>show</summary>
<p>

```bash
sudo apt install kubectl=1.18.6-00
```

</p>
</details>

### Upgrade the kubelet configuration on a worker node

> 🔗 [Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)

<details><summary>show</summary>
<p>

```bash
sudo kubeadm upgrade node
```

</p>
</details>

---

## 4. Manage the lifecycle of Kubernetes clusters

> 📖 [Upgrading kubeadm clusters](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/) · [Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/) · [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

### Setup autocomplete for k8s commands

> 🔗 [kubectl Cheat Sheet - kubectl autocomplete](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#kubectl-autocomplete)

<details><summary>show</summary>
<p>

```bash
source <(kubectl completion bash)
echo "source <(kubectl completion bash)" >> ~/.bashrc
```

</p>
</details>

### Setup alias for kubectl

> 🔗 [kubectl Cheat Sheet - kubectl autocomplete](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#kubectl-autocomplete)

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

> 🔗 [Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)

<details><summary>show</summary>
<p>

```bash
kubectl config view
```

</p>
</details>

### Use multiple kubeconfig files at the same time

> 🔗 [Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)

<details><summary>show</summary>
<p>

```bash
KUBECONFIG=~/.kube/config:~/.kube/kubconfig2
```

</p>
</details>

### Permanently save the namespace `ggcka-s2` for all subsequent kubectl commands in that context.

> 🔗 [Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/) · [kubectl Cheat Sheet - kubectl context and configuration](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#kubectl-context-and-configuration)

<details><summary>show</summary>
<p>

```bash
kubectl config set-context --current --namespace=ggcka-s2
```

</p>
</details>

### Set a context utilizing a specific `cluster-admin` user in `default` namespace

> 🔗 [Configure Access to Multiple Clusters](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)

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

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

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

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl describe nodes
```

</p>
</details>

### Get the external IP of all nodes

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl get nodes -o jsonpath='{.items[*].status.addresses[?(@.type=="ExternalIP")].address}'
```

</p>
</details>

### Create a new namespace

> 🔗 [Namespaces Walkthrough](https://kubernetes.io/docs/tasks/administer-cluster/namespaces-walkthrough/)

<details><summary>show</summary>
<p>

```bash
kubectl create namespace web
```

</p>
</details>

### List all the namespaces that exist in the cluster

> 🔗 [Namespaces](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/)

<details><summary>show</summary>
<p>

```bash
kubectl get namespaces
```

</p>
</details>

### List all services in the kube-system namespace

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl get svc -n kube-system
```

</p>
</details>

### List the pods in all namespaces

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

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

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl -n default get pods -o wide
```

</p>
</details>

### List all pods in the default namespace

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

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

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

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

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

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

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl describe po nginx
```

</p>
</details>

### Get pod logs from a pod named `nginx`

> 🔗 [kubectl Cheat Sheet - Interacting with running Pods](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#interacting-with-running-pods)

<details><summary>show</summary>
<p>

```bash
kubectl logs nginx
```

</p>
</details>

### Output a pod's YAML without cluster specific information

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl get pod my-pod -o yaml
```

</p>
</details>

### List services in the default namespace, sorted by name

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

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

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl get svc -A
```

</p>
</details>

### Create a pod which runs an nginx container

> 🔗 [Pods](https://kubernetes.io/docs/concepts/workloads/pods/) · [kubectl Cheat Sheet - Creating objects](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#creating-objects)

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

> 🔗 [kubectl Cheat Sheet - Deleting resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#deleting-resources)

<details><summary>show</summary>
<p>

```bash
kubectl delete po nginx
```

</p>
</details>

### Use the imperative command to create a pod named nginx-pod with the image nginx, but save it to a YAML file named pod.yaml instead of creating it

> 🔗 [kubectl Usage Conventions](https://kubernetes.io/docs/reference/kubectl/conventions/) · [kubectl Cheat Sheet - Creating objects](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#creating-objects)

<details><summary>show</summary>
<p>

```bash
kubectl run nginx --image nginx-pod --dry-run=client -o yaml > pod.yaml
```

</p>
</details>

### Create a deployment with two replica pods from YAML

> 🔗 [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)

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

> 🔗 [Annotations](https://kubernetes.io/docs/concepts/overview/working-with-objects/annotations/)

<details><summary>show</summary>
<p>

```bash
kubectl annotate deploy nginx mycompany.com/someannotation="chad"
```

</p>
</details>

### Add a label to a pod

> 🔗 [Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)

<details><summary>show</summary>
<p>

```bash
kubectl label pods nginx env=prod
```

</p>
</details>

### Show labels for all pods in the cluster

> 🔗 [Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)

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

> 🔗 [Field Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/field-selectors/)

<details><summary>show</summary>
<p>

```bash
kubectl get po --field-selector status.phase=Running
```

</p>
</details>

### List all services in the default namespace using field selectors

> 🔗 [Field Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/field-selectors/)

<details><summary>show</summary>
<p>

```bash
kubectl get svc --field-selector metadata.namespace=default
```

</p>
</details>

### List all API resources in your Kubernetes cluster

> 🔗 [kubectl Cheat Sheet - Viewing and finding resources](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#viewing-and-finding-resources)

<details><summary>show</summary>
<p>

```bash
kubectl api-resources
```

</p>
</details>

### Drain a node for maintenance named `node1.mylabserver.com`

> 🔗 [Safely Drain a Node](https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/)

<details><summary>show</summary>
<p>

```bash
kubectl drain node1.mylabserver.com --ignore-daemonsets --force
```

</p>
</details>

### Put the node `node1.mylabserver.com` back into service, so pods can be scheduled to it

> 🔗 [Safely Drain a Node](https://kubernetes.io/docs/tasks/administer-cluster/safely-drain-node/)

<details><summary>show</summary>
<p>

```bash
kubectl uncordon node1.mylabserver.com
```

</p>
</details>

### Look up the value for the key `cluster.name` in the etcd cluster and backup etcd

> 🔗 [Operating etcd clusters for Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/)

<details><summary>show</summary>
<p>

```bash
ETCDCTL_API=3 etcdctl get cluster.name \
--endpoints=https://10.0.1.101:2379 \
--cacert=/home/cloud_user/etcd-certs/etcd-ca.pem \
--cert=/home/cloud_user/etcd-certs/etcd-server.crt \
--key=/home/cloud_user/etcd-certs/etcd-server.key

ETCDCTL_API=3 etcdctl snapshot save /home/cloud_user/etcd_backup.db \
--endpoints=https://10.0.1.101:2379 \
--cacert=/home/cloud_user/etcd-certs/etcd-ca.pem \
--cert=/home/cloud_user/etcd-certs/etcd-server.crt \
--key=/home/cloud_user/etcd-certs/etcd-server.key
```

</p>
</details>

### Reset etcd and remove all data from the etcd

> 🔗 [Operating etcd clusters for Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/)

<details><summary>show</summary>
<p>

```bash
sudo systemctl stop etcd

sudo rm -rf /var/lib/etcd
```

</p>
</details>

### Restore an etcd store from backup.

> 🔗 [Operating etcd clusters for Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/)

<details><summary>show</summary>
<p>

```bash
# spin up a temporary etcd cluster and save the data from the backup file to a new directory (/var/lib/etcd)
sudo ETCDCTL_API=3 etcdctl snapshot restore /home/cloud_user/etcd_backup.db \
--initial-cluster etcd-restore=https://10.0.1.101:2380 \
--initial-advertise-peer-urls https://10.0.1.101:2380 \
--name etcd-restore \
--data-dir /var/lib/etcd

# set ownership of the new data directory
sudo chown -R etcd:etcd /var/lib/etcd

# start etcd
sudo systemctl start etcd

# Verify the data was restored
ETCDCTL_API=3 etcdctl get cluster.name \
--endpoints=https://10.0.1.101:2379 \
--cacert=/home/cloud_user/etcd-certs/etcd-ca.pem \
--cert=/home/cloud_user/etcd-certs/etcd-server.crt \
--key=/home/cloud_user/etcd-certs/etcd-server.key
```

</p>
</details>

---

## 5. Implement and configure a highly-available control plane

> 📖 [Options for Highly Available Topology](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/ha-topology/) · [Creating Highly Available Clusters with kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/high-availability/)

_原文档暂无此考点的练习。_

---

## 6. Use Helm and Kustomize to install cluster components

> 📖 [Managing Kubernetes Objects Using Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/) · [Helm Documentation](https://helm.sh/docs/)

_原文档暂无此考点的练习。_

---

## 7. Understand extension interfaces (CNI, CSI, CRI, etc.)

> 📖 [Network Plugins](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/) · [Container Runtime Interface (CRI)](https://kubernetes.io/docs/concepts/architecture/cri/) · [Container Storage Interface (CSI)](https://kubernetes-csi.github.io/docs/)

_原文档暂无此考点的练习。_

---

## 8. Understand CRDs, install and configure operators

> 📖 [Custom Resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/) · [Operator Pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/)

_原文档暂无此考点的练习。_
