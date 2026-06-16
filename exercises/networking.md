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

### [CKA Past Exam - 7 pts] Create allow-port-from-namespace NetworkPolicy in internal namespace allowing same-namespace pods access on port 9000

> 🔗 [Concepts > Services, Load Balancing, and Networking > Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

**Task:**

Create a new NetworkPolicy named `allow-port-from-namespace` in the existing namespace `internal`. Ensure that the new NetworkPolicy allows Pods in namespace `internal` to connect to port `9000` of Pods in the same namespace. Further ensure that the new NetworkPolicy does not allow access to Pods not listening on port `9000`, and does not allow access to Pods not in namespace `internal`.

<details><summary>show</summary>
<p>

```bash
# 切换 context
kubectl config use-context hk8s

cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-port-from-namespace
  namespace: internal
spec:
  podSelector: {}              # 应用到 internal 命名空间所有 Pod
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector: {}          # 仅允许同命名空间的 Pod 访问
    ports:
    - protocol: TCP
      port: 9000
EOF

# 验证
kubectl describe networkpolicy allow-port-from-namespace -n internal
```

</p>
</details>

### [CKA Past Exam - 7 pts] Create NetworkPolicy allowing pods in my-app namespace to egress to big-corp namespace on port 8080

> 🔗 [Concepts > Services, Load Balancing, and Networking > Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

**Task:**

Create a NetworkPolicy in namespace `my-app` that enables Pods in `my-app` to connect to port `8080` of Pods running in the existing namespace `big-corp`.

<details><summary>show</summary>
<p>

```bash
# 先确保 big-corp 命名空间有 label，便于 namespaceSelector 匹配
kubectl label ns big-corp name=big-corp --overwrite

cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-egress-to-big-corp
  namespace: my-app
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: big-corp        # 或使用内置标签 kubernetes.io/metadata.name: big-corp
    ports:
    - protocol: TCP
      port: 8080
EOF
```

</p>
</details>

### [CKA Past Exam - 7 pts] Allow pods from internal namespace to access port 9200 in big-corp namespace

> 🔗 [Concepts > Services, Load Balancing, and Networking > Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

**Task:**

Create a NetworkPolicy in the `big-corp` namespace allowing Pods from the `internal` namespace to access pods on port `9200`.

<details><summary>show</summary>
<p>

```bash
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-port-from-internal
  namespace: big-corp
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: internal
    ports:
    - protocol: TCP
      port: 9200
EOF

# 注意: kubernetes.io/metadata.name 是 Kubernetes 1.22+ 自动添加的内置 label
# 旧版本需要手动给 namespace 打 label: kubectl label ns internal name=internal
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

### [CKA Past Exam - 7 pts] Reconfigure front-end deployment to add named port http (80/TCP) and expose via NodePort service front-end-svc

> 🔗 [Concepts > Services, Load Balancing, and Networking > Service](https://kubernetes.io/docs/concepts/services-networking/service/)

**Task:**

Reconfigure the existing deployment `front-end` and add a port specification named `http` exposing port `80/tcp` of the existing container nginx. Create a new service named `front-end-svc` exposing the container port `http`. Configure the new service to also expose the individual Pods via a NodePort on the nodes on which they are scheduled.

<details><summary>show</summary>
<p>

```bash
# 1. 给 deployment 的 nginx 容器添加 ports 配置
kubectl edit deploy front-end
```

```yaml
    spec:
      containers:
      - name: nginx
        image: nginx
        ports:                  # 添加这段
        - name: http
          containerPort: 80
          protocol: TCP
```

```bash
# 2. 创建 NodePort service，targetPort 引用容器命名端口 "http"
kubectl expose deploy front-end \
  --name=front-end-svc \
  --port=80 \
  --target-port=http \
  --type=NodePort

# 验证
kubectl get svc front-end-svc
kubectl get endpoints front-end-svc
# endpoints 应不为空，说明 Pod label 与 service selector 匹配

# 测试访问
NODE_IP=$(kubectl get node -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
NODE_PORT=$(kubectl get svc front-end-svc -o jsonpath='{.spec.ports[0].nodePort}')
curl http://$NODE_IP:$NODE_PORT
```

</p>
</details>

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

### [CKA Past Exam - 7 pts] Create Ingress "pong" in ing-internal namespace routing /hi to service hi:5678

> 🔗 [Concepts > Services, Load Balancing, and Networking > Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/)

**Task:**

Create a new Ingress resource as follows:
- Name: `pong`
- Namespace: `ing-internal`
- Exposing service `hi` on path `/hi` using service port `5678`

The availability of service `hi` can be checked using the following command, which should return `hi`:
`curl -kL <INTERNAL_IP>/hi`

<details><summary>show</summary>
<p>

```bash
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: pong
  namespace: ing-internal
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /     # 如果需要重写路径
spec:
  ingressClassName: nginx
  rules:
  - http:
      paths:
      - path: /hi
        pathType: Prefix
        backend:
          service:
            name: hi
            port:
              number: 5678
EOF

# 验证
kubectl get ingress -n ing-internal
kubectl describe ingress pong -n ing-internal

# 测试
INGRESS_IP=$(kubectl get ingress pong -n ing-internal -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl -kL $INGRESS_IP/hi
# 应返回 "hi"
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

---

## Killer.sh Mock Exam Questions

> 📚 Source PDFs: [`assets/killer-sh/cka-simulator-a-k8s-1.35.pdf`](../assets/killer-sh/cka-simulator-a-k8s-1.35.pdf) | [`assets/killer-sh/cka-simulator-b-k8s-1.35.pdf`](../assets/killer-sh/cka-simulator-b-k8s-1.35.pdf)

### [Killer.sh A-Q13] Gateway API: replace Ingress with HTTPRoute + header routing
> 🔗 [Concepts > Services, Load Balancing, and Networking > Gateway API](https://kubernetes.io/docs/concepts/services-networking/gateway/)
> [Gateway API SIG > Documentation](https://gateway-api.sigs.k8s.io/)

> 🖥 Solve on: `ssh cka7968`

**Task:**

The team from Project r500 wants to replace their Ingress (`networking.k8s.io`) with a Gateway Api (`gateway.networking.k8s.io`) solution. The old Ingress is available at `/opt/course/13/ingress.yaml`.

Perform the following in Namespace `project-r500` and for the already existing Gateway:

1. Create a new HTTPRoute named `traffic-director` which replicates the routes from the old Ingress
2. Extend the new HTTPRoute with path `/auto` which forwards to `mobile` backend if the `User-Agent` is exactly `mobile` and to `desktop` backend otherwise

The existing Gateway is reachable at `http://r500.gateway:30080` which means your implementation should work for these commands:

```
curl r500.gateway:30080/desktop
curl r500.gateway:30080/mobile
curl r500.gateway:30080/auto -H "User-Agent: mobile"
curl r500.gateway:30080/auto
```

**Lab context:**

- Hostname: `cka7968` (controlplane)
- Existing Gateway `main` in Namespace `project-r500` referencing GatewayClass `nginx` (NGINX Gateway Fabric); Services `web-desktop` and `web-mobile` already exist
- Existing `/opt/course/13/ingress.yaml`:
  ```yaml
  apiVersion: networking.k8s.io/v1
  kind: Ingress
  metadata:
    name: traffic-director
  spec:
    ingressClassName: nginx
    rules:
      - host: r500.gateway
        http:
          paths:
            - backend:
                service:
                  name: web-desktop
                  port:
                    number: 80
              path: /desktop
              pathType: Prefix
            - backend:
                service:
                  name: web-mobile
                  port:
                    number: 80
              path: /mobile
              pathType: Prefix
  ```

<details><summary>show</summary>
<p>

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: traffic-director
  namespace: project-r500
spec:
  parentRefs:
  - name: main
  hostnames: ["r500.gateway"]
  rules:
  - matches:
    - path: {type: PathPrefix, value: /desktop}
    backendRefs:
    - {name: web-desktop, port: 80}
  - matches:
    - path: {type: PathPrefix, value: /mobile}
    backendRefs:
    - {name: web-mobile, port: 80}
  # User-Agent rule MUST come before the catch-all /auto rule (order matters)
  - matches:
    - path: {type: PathPrefix, value: /auto}
      headers:
      - {type: Exact, name: User-Agent, value: mobile}
    backendRefs:
    - {name: web-mobile, port: 80}
  - matches:
    - path: {type: PathPrefix, value: /auto}
    backendRefs:
    - {name: web-desktop, port: 80}
```

```bash
k apply -f http-route.yaml
curl http://r500.gateway:30080/desktop
curl -H "User-Agent: mobile" http://r500.gateway:30080/auto
```

</p>
</details>

### [Killer.sh A-Q15] NetworkPolicy: multi-egress (separate rules = OR pitfall)
> 🔗 [Concepts > Services, Load Balancing, and Networking > Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
> [Tasks > Administer a Cluster > Declare Network Policy](https://kubernetes.io/docs/tasks/administer-cluster/declare-network-policy/)

> 🖥 Solve on: `ssh cka7968`

**Task:**

There was a security incident where an intruder was able to access the whole cluster from a single hacked backend Pod.

To prevent this create a NetworkPolicy called `np-backend` in Namespace `project-snake`. It should allow the `backend-*` Pods only to:

- Connect to `db1-*` Pods on port `1111`
- Connect to `db2-*` Pods on port `2222`

Use the `app` Pod labels in your policy.

> ℹ️ All Pods in the Namespace run plain Nginx images. This allows simple connectivity tests like: `k -n project-snake exec POD_NAME -- curl POD_IP:PORT`

> ℹ️ For example, connections from `backend-*` Pods to `vault-*` Pods on port `3333` should no longer work

**Lab context:**

- Hostname: `cka7968` (controlplane)
- Namespace `project-snake` contains Pods `backend-0`, `db1-0`, `db2-0`, `vault-0` with `app` labels matching their name prefix; all run plain Nginx images on ports 1111/2222/3333 respectively

<details><summary>show</summary>
<p>

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: np-backend
  namespace: project-snake
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: db1
    ports:
    - protocol: TCP
      port: 1111
  - to:
    - podSelector:
        matchLabels:
          app: db2
    ports:
    - protocol: TCP
      port: 2222
```

</p>
</details>

### [Killer.sh A-Q16] CoreDNS: add custom-domain alongside cluster.local
> 🔗 [Tasks > Administer a Cluster > Using CoreDNS for Service Discovery](https://kubernetes.io/docs/tasks/administer-cluster/coredns/)
> [Tasks > Administer a Cluster > Customizing DNS Service](https://kubernetes.io/docs/tasks/administer-cluster/dns-custom-nameservers/)
> [Concepts > Services, Load Balancing, and Networking > DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)

> 🖥 Solve on: `ssh cka5774`

**Task:**

The CoreDNS configuration in the cluster needs to be updated:

1. Make a backup of the existing configuration Yaml and store it at `/opt/course/16/coredns_backup.yaml`. You should be able to fast recover from the backup
2. Update the CoreDNS configuration in the cluster so that DNS resolution for `SERVICE.NAMESPACE.custom-domain` will work exactly like and in addition to `SERVICE.NAMESPACE.cluster.local`

Test your configuration for example from a Pod with `busybox:1` image. These commands should result in an IP address:

```
nslookup kubernetes.default.svc.cluster.local
nslookup kubernetes.default.svc.custom-domain
```

**Lab context:**

- Hostname: `cka5774` (controlplane)
- CoreDNS runs as Deployment `coredns` in `kube-system` (2 replicas) backed by ConfigMap `coredns`
- Target directory `/opt/course/16/` already exists

<details><summary>show</summary>
<p>

```bash
# backup
k -n kube-system get cm coredns -o yaml > /opt/course/16/coredns_backup.yaml

# edit Corefile: change "kubernetes cluster.local in-addr.arpa ip6.arpa"
# to "kubernetes custom-domain cluster.local in-addr.arpa ip6.arpa"
k -n kube-system edit cm coredns
```

```
# Corefile (after edit)
.:53 {
    errors
    health { lameduck 5s }
    ready
    kubernetes custom-domain cluster.local in-addr.arpa ip6.arpa {
       pods insecure
       fallthrough in-addr.arpa ip6.arpa
       ttl 30
    }
    prometheus :9153
    forward . /etc/resolv.conf
    cache 30
    loop
    reload
    loadbalance
}
```

```bash
# reload CoreDNS
k -n kube-system rollout restart deploy coredns

# test
k run bb --image=busybox:1 -- sh -c 'sleep 1d'
k exec -it bb -- nslookup kubernetes.default.svc.custom-domain
k exec -it bb -- nslookup kubernetes.default.svc.cluster.local
```

</p>
</details>

### [Killer.sh B-Q1] DNS FQDNs: Service / headless / Pod / Pod-by-IP
> 🔗 [Concepts > Services, Load Balancing, and Networking > DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
> [Concepts > Services, Load Balancing, and Networking > Service](https://kubernetes.io/docs/concepts/services-networking/service/)

> 🖥 Solve on: `ssh cka6016`

**Task:**

The Deployment `controller` in Namespace `lima-control` communicates with various cluster internal endpoints by using their DNS FQDN values.

Update the ConfigMap used by the Deployment with the correct FQDN values for:

1. `DNS_1`: Service `kubernetes` in Namespace `default`
2. `DNS_2`: Headless Service `department` in Namespace `lima-workload`
3. `DNS_3`: Pod `section100` in Namespace `lima-workload`. It should work even if the Pod IP changes
4. `DNS_4`: A Pod with IP `1.2.3.4` in Namespace `kube-system`

Ensure the Deployment works with the updated values.

> ℹ️ You can use `nslookup` or `dig` inside a Pod of the `controller` Deployment

**Lab context:**

- Hostname: `cka6016` (controlplane)
- Existing Deployment `controller` in Namespace `lima-control` (uses ConfigMap `control-config` with keys `DNS_1`..`DNS_4`)
- In Namespace `lima-workload`: Service `department` (headless, ClusterIP `None`) and Service `section` back Pods `section100`, `section200` which set `hostname`/`subdomain` so `POD.SERVICE.NS.svc.cluster.local` resolves

<details><summary>show</summary>
<p>

```yaml
# k -n lima-control edit cm control-config
data:
  DNS_1: kubernetes.default.svc.cluster.local
  DNS_2: department.lima-workload.svc.cluster.local
  DNS_3: section100.section.lima-workload.svc.cluster.local
  DNS_4: 1-2-3-4.kube-system.pod.cluster.local
```

```bash
k -n lima-control rollout restart deploy controller

# FQDN cheatsheet:
# Service:           <svc>.<ns>.svc.cluster.local
# Headless Service:  <svc>.<ns>.svc.cluster.local (returns A records for each Pod)
# Pod (subdomain):   <hostname>.<subdomain>.<ns>.svc.cluster.local
# Pod by IP:         <ip-with-dashes>.<ns>.pod.cluster.local
```

</p>
</details>
