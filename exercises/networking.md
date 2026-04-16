# Services & Networking (20%)

> CKA Curriculum v1.35 — [cncf/curriculum](https://github.com/cncf/curriculum)

## 考试大纲考点

- Understand connectivity between Pods
- Define and enforce Network Policies
- Use ClusterIP, NodePort, LoadBalancer service types and endpoints
- Use the Gateway API to manage Ingress traffic
- Know how to use Ingress controllers and Ingress resources
- Understand and use CoreDNS

> **Note:** 原始练习文档 (`networking.md`) 中的练习内容（node drain/uncordon、kubeadm upgrade、etcd backup/restore）实际属于 "Cluster Architecture, Installation and Configuration" 部分，已移至 `cluster-architecture.md`。

---

## 1. Understand connectivity between Pods

> 📖
> [Concepts > Cluster Administration > Cluster Networking](https://kubernetes.io/docs/concepts/cluster-administration/networking/)
> [Concepts > Services, Load Balancing, and Networking > DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)

### Create two pods in different namespaces and verify they can communicate using pod IP

> 🔗 [Concepts > Cluster Administration > Cluster Networking](https://kubernetes.io/docs/concepts/cluster-administration/networking/)

<details><summary>show</summary>
<p>

```bash
# create two namespaces
kubectl create ns ns1
kubectl create ns ns2

# create an nginx pod in ns1
kubectl run web -n ns1 --image=nginx

# create a busybox pod in ns2
kubectl run test -n ns2 --image=busybox --command -- sleep 3600

# wait for pods to be running
kubectl get pods -n ns1 -o wide
kubectl get pods -n ns2

# get the IP of the web pod (note: use "pod web" singular, not "pods")
WEB_IP=$(kubectl get pod web -n ns1 -o jsonpath='{.status.podIP}')

# or, using yq
WEB_IP=$(kubectl get pod web -n ns1 -o yaml | yq '.status.podIP')

# verify connectivity from ns2 pod to ns1 pod via pod IP
kubectl exec test -n ns2 -- wget -O- -T3 http://$WEB_IP
```

</p>
</details>

### Verify a pod's DNS configuration by checking /etc/resolv.conf

> 🔗 [Concepts > Services, Load Balancing, and Networking > DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)

<details><summary>show</summary>
<p>

```bash
kubectl run dns-test --image=busybox --command -- sleep 3600

# check the DNS configuration
kubectl exec dns-test -- cat /etc/resolv.conf

# expected output:
# nameserver 10.96.0.10          ← kube-dns ClusterIP
# search default.svc.cluster.local svc.cluster.local cluster.local
# options ndots:5

# verify the nameserver matches the kube-dns service IP
kubectl get svc kube-dns -n kube-system
```

</p>
</details>

---

## 2. Define and enforce Network Policies

> 📖 [Concepts > Services, Load Balancing, and Networking > Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

> **Note:** NetworkPolicy 需要 CNI 插件支持（如 Calico、Cilium）。Flannel 默认不支持 NetworkPolicy。

### Create a default-deny-ingress NetworkPolicy for a namespace, then allow traffic from pods with a specific label

> 🔗 [Concepts > Services, Load Balancing, and Networking > Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

<details><summary>show</summary>
<p>

```bash
# create a namespace and deploy a web server
kubectl create ns netpol-test
kubectl run web -n netpol-test --image=nginx --labels="app=web"
kubectl expose pod web -n netpol-test --port=80

# verify connectivity works before applying policy
kubectl run client -n netpol-test --rm -it --image=busybox -- wget -O- -T3 http://web

# apply default deny ingress policy
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: netpol-test
spec:
  podSelector: {}
  policyTypes:
  - Ingress
EOF

# verify connectivity is now blocked
kubectl run client -n netpol-test --rm -it --image=busybox -- wget -O- -T3 http://web
# should timeout

# allow ingress only from pods with label "role=client"
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-client
  namespace: netpol-test
spec:
  podSelector:
    matchLabels:
      app: web
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          role: client
    ports:
    - protocol: TCP
      port: 80
EOF

# test: pod without label — should fail
kubectl run no-label -n netpol-test --rm -it --image=busybox -- wget -O- -T3 http://web

# test: pod with label — should succeed
kubectl run with-label -n netpol-test --rm -it --image=busybox --labels="role=client" -- wget -O- -T3 http://web
```

</p>
</details>

### Create a NetworkPolicy that allows ingress only on a specific port from a specific namespace

> 🔗 [Concepts > Services, Load Balancing, and Networking > Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

<details><summary>show</summary>
<p>

```bash
# label the source namespace
kubectl label ns default name=default

# create a NetworkPolicy that allows ingress from the "default" namespace on port 80
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-default
  namespace: netpol-test
spec:
  podSelector:
    matchLabels:
      app: web
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: default
    ports:
    - protocol: TCP
      port: 80
EOF

# test from the default namespace — should succeed
kubectl run cross-ns --rm -it --image=busybox -- wget -O- -T3 http://web.netpol-test.svc.cluster.local
```

</p>
</details>

### Create a NetworkPolicy to restrict egress traffic, allowing only DNS and a specific service

> 🔗 [Concepts > Services, Load Balancing, and Networking > Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

<details><summary>show</summary>
<p>

```bash
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: restrict-egress
  namespace: netpol-test
spec:
  podSelector:
    matchLabels:
      app: restricted
  policyTypes:
  - Egress
  egress:
  # allow DNS
  - to: []
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
  # allow traffic to web pod
  - to:
    - podSelector:
        matchLabels:
          app: web
    ports:
    - protocol: TCP
      port: 80
EOF

# test: restricted pod can access web
kubectl run restricted -n netpol-test --rm -it --image=busybox --labels="app=restricted" -- wget -O- -T3 http://web

# test: restricted pod cannot access external sites
kubectl run restricted -n netpol-test --rm -it --image=busybox --labels="app=restricted" -- wget -O- -T3 http://example.com
# should timeout
```

</p>
</details>

---

## 3. Use ClusterIP, NodePort, LoadBalancer service types and endpoints

> 📖
> [Concepts > Services, Load Balancing, and Networking > Service](https://kubernetes.io/docs/concepts/services-networking/service/)
> [Tutorials > Services > Connecting Applications with Services](https://kubernetes.io/docs/tutorials/services/connect-applications-service/)

### Create a ClusterIP service for a deployment and verify internal DNS access

> 🔗 [Concepts > Services, Load Balancing, and Networking > Service](https://kubernetes.io/docs/concepts/services-networking/service/)

<details><summary>show</summary>
<p>

```bash
# create a deployment
kubectl create deploy web --image=nginx

# expose as ClusterIP (default type)
kubectl expose deploy web --port=80 --type=ClusterIP

# verify service
kubectl get svc web

# test DNS access from a temporary pod
kubectl run test --rm -it --image=busybox -- wget -O- http://web.default.svc.cluster.local

# or using short name (same namespace)
kubectl run test --rm -it --image=busybox -- wget -O- http://web
```

</p>
</details>

### Create a NodePort service and access it via the node's IP

> 🔗 [Concepts > Services, Load Balancing, and Networking > Service](https://kubernetes.io/docs/concepts/services-networking/service/)

<details><summary>show</summary>
<p>

```bash
# expose the deployment as NodePort
kubectl expose deploy web --port=80 --type=NodePort --name=web-np

# get the assigned NodePort
NODE_PORT=$(kubectl get svc web-np -o jsonpath='{.spec.ports[0].nodePort}')

# get a node's internal IP
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')

# access the service via node IP and NodePort
curl http://$NODE_IP:$NODE_PORT

# verify endpoints are populated
kubectl get endpoints web-np
```

</p>
</details>

### Troubleshoot a service that is not routing traffic to its backend pods

> 🔗 [Tutorials > Services > Connecting Applications with Services](https://kubernetes.io/docs/tutorials/services/connect-applications-service/)

*此为场景练习，无固定答案。关键步骤：*

```
1. kubectl get endpoints <svc> — 检查 endpoints 是否为空
2. kubectl get svc <svc> -o yaml — 查看 selector
3. kubectl get pods --show-labels — 对比 pod labels 与 service selector 是否匹配
4. kubectl describe svc <svc> — 查看 TargetPort 是否正确
5. 修复 selector 或 pod labels 后验证: kubectl get endpoints <svc>
```

---

## 4. Use the Gateway API to manage Ingress traffic

> 📖 [Concepts > Services, Load Balancing, and Networking > Gateway API](https://kubernetes.io/docs/concepts/services-networking/gateway/)

### Install Gateway API CRDs and create a basic HTTPRoute

> 🔗 [Concepts > Services, Load Balancing, and Networking > Gateway API](https://kubernetes.io/docs/concepts/services-networking/gateway/)

> **Note:** Gateway API 不是 Kubernetes 核心组件，需要单独安装 CRDs 和 Gateway Controller。CKA 考试中如涉及此考点，通常会预装环境。

<details><summary>show</summary>
<p>

```bash
# install Gateway API CRDs (standard channel)
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/latest/download/standard-install.yaml

# verify CRDs are installed
kubectl get crd | grep gateway

# create a Gateway resource
cat <<EOF | kubectl apply -f -
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
spec:
  gatewayClassName: example-gateway-class
  listeners:
  - name: http
    protocol: HTTP
    port: 80
EOF

# create an HTTPRoute
cat <<EOF | kubectl apply -f -
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: my-route
spec:
  parentRefs:
  - name: my-gateway
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /app
    backendRefs:
    - name: web
      port: 80
EOF

# verify
kubectl get gateway
kubectl get httproute
kubectl describe httproute my-route
```

</p>
</details>

---

## 5. Know how to use Ingress controllers and Ingress resources

> 📖
> [Concepts > Services, Load Balancing, and Networking > Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)
> [Concepts > Services, Load Balancing, and Networking > Ingress Controllers](https://kubernetes.io/docs/concepts/services-networking/ingress-controllers/)

### Create an Ingress resource with a single default backend service

> 🔗 [Concepts > Services, Load Balancing, and Networking > Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)

<details><summary>show</summary>
<p>

```bash
# ensure a deployment and service exist
kubectl create deploy web --image=nginx
kubectl expose deploy web --port=80

# create an Ingress with default backend
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: simple-ingress
spec:
  ingressClassName: nginx
  defaultBackend:
    service:
      name: web
      port:
        number: 80
EOF

# verify
kubectl get ingress
kubectl describe ingress simple-ingress
```

</p>
</details>

### Create an Ingress with path-based routing to multiple backend services

> 🔗 [Concepts > Services, Load Balancing, and Networking > Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)

<details><summary>show</summary>
<p>

```bash
# create two deployments and services
kubectl create deploy foo --image=nginx
kubectl expose deploy foo --port=80
kubectl create deploy bar --image=httpd
kubectl expose deploy bar --port=80

# create Ingress with path-based routing
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: path-ingress
spec:
  ingressClassName: nginx
  rules:
  - http:
      paths:
      - path: /foo
        pathType: Prefix
        backend:
          service:
            name: foo
            port:
              number: 80
      - path: /bar
        pathType: Prefix
        backend:
          service:
            name: bar
            port:
              number: 80
EOF

# verify
kubectl describe ingress path-ingress
```

</p>
</details>

### Create an Ingress with host-based routing (name-based virtual hosting)

> 🔗 [Concepts > Services, Load Balancing, and Networking > Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)

<details><summary>show</summary>
<p>

```bash
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: host-ingress
spec:
  ingressClassName: nginx
  rules:
  - host: foo.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: foo
            port:
              number: 80
  - host: bar.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: bar
            port:
              number: 80
EOF

# verify
kubectl describe ingress host-ingress

# test with curl (use Host header)
INGRESS_IP=$(kubectl get ingress host-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl -H "Host: foo.example.com" http://$INGRESS_IP/
curl -H "Host: bar.example.com" http://$INGRESS_IP/
```

</p>
</details>

---

## 6. Understand and use CoreDNS

> 📖
> [Tasks > Administer a Cluster > Using CoreDNS for Service Discovery](https://kubernetes.io/docs/tasks/administer-cluster/coredns/)
> [Tasks > Administer a Cluster > Debugging DNS Resolution](https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/)

### Verify CoreDNS is running and examine its Corefile configuration

> 🔗 [Tasks > Administer a Cluster > Using CoreDNS for Service Discovery](https://kubernetes.io/docs/tasks/administer-cluster/coredns/)

<details><summary>show</summary>
<p>

```bash
# check CoreDNS pods are running
kubectl get pods -n kube-system -l k8s-app=kube-dns

# check the kube-dns service
kubectl get svc kube-dns -n kube-system

# view the CoreDNS ConfigMap (Corefile)
kubectl get cm coredns -n kube-system -o yaml

# key plugins to understand:
# - kubernetes: service discovery for cluster.local
# - forward: upstream DNS servers (usually . /etc/resolv.conf)
# - cache: response caching (default 30s)
# - loop: loop detection
# - reload: auto-reload config changes
```

</p>
</details>

### Deploy a test pod and verify DNS resolution for services across namespaces

> 🔗 [Tasks > Administer a Cluster > Debugging DNS Resolution](https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/)

<details><summary>show</summary>
<p>

```bash
# create a test pod with DNS tools
kubectl run dnsutils --image=registry.k8s.io/e2e-test-images/agnhost:2.39 --command -- sleep infinity

# wait for the pod to be ready
kubectl wait --for=condition=Ready pod/dnsutils

# test: resolve the kubernetes API service
kubectl exec dnsutils -- nslookup kubernetes.default

# test: resolve a service in a different namespace
kubectl exec dnsutils -- nslookup kube-dns.kube-system.svc.cluster.local

# test: resolve an external domain
kubectl exec dnsutils -- nslookup kubernetes.io

# check pod DNS config
kubectl exec dnsutils -- cat /etc/resolv.conf
```

</p>
</details>

### Modify CoreDNS ConfigMap to add custom DNS forwarding for a stub domain

> 🔗 [Tasks > Administer a Cluster > Using CoreDNS for Service Discovery](https://kubernetes.io/docs/tasks/administer-cluster/coredns/)

<details><summary>show</summary>
<p>

```bash
# edit CoreDNS ConfigMap
kubectl edit cm coredns -n kube-system

# add a custom server block for a stub domain, e.g.:
# mycompany.local:53 {
#     errors
#     cache 30
#     forward . 10.0.0.53
# }

# restart CoreDNS pods to apply changes
kubectl rollout restart deployment coredns -n kube-system

# verify pods are back
kubectl get pods -n kube-system -l k8s-app=kube-dns

# test DNS resolution for the custom domain
kubectl exec dnsutils -- nslookup myservice.mycompany.local
```

</p>
</details>
