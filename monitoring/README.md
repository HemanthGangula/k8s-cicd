# Monitoring

Lightweight Prometheus + Grafana for the demo cluster. Plain manifests, applied
by hand, kept separate from the app and the pipeline.

## Why plain YAML and not Helm

Helm earns its place when you parameterize per environment and want atomic
rollback on every release, which is why the app uses it. Monitoring is static
infra applied once to one cluster, so there is nothing to parameterize and raw
manifests are easier to read and defend. The community `kube-prometheus-stack`
Helm chart was deliberately avoided: it pulls in the Prometheus Operator, CRDs,
Alertmanager and around ten pods, which is too heavy for a shared box and too
much to explain line by line.

## Files (one per tool, applied in number order so the namespace lands first)

| File | What it is |
|------|------------|
| `01-prometheus.yaml` | Namespace + RBAC + scrape config + Deployment + Service. 1-day retention, hard-capped |
| `02-node-exporter.yaml` | DaemonSet for host CPU/RAM/disk (one pod per node) |
| `03-kube-state-metrics.yaml` | Object state (pod restarts, deployment replicas), scoped to pods+deployments |
| `04-grafana.yaml` | Provisioning (datasource + 5-panel dashboard) + Deployment + Service |

## The three metric sources (no overlap)

- **cAdvisor** (built into the kubelet, scraped via the API-server proxy) - per-pod CPU/memory *usage*
- **node-exporter** - the host machine underneath
- **kube-state-metrics** - object *state*: restarts, replicas ready

Together: usage + host + health.

## Footprint

Four pods, all with hard memory limits. Combined limit ~610Mi, under 8% of an
8 GB `t3.large`, so it cannot starve Jenkins or the app. 1-day retention keeps
the Prometheus database small.

| Pod | CPU limit | Mem limit |
|-----|-----------|-----------|
| prometheus | 300m | 300Mi |
| grafana | 200m | 200Mi |
| node-exporter | 100m | 50Mi |
| kube-state-metrics | 100m | 64Mi |

## Apply

```bash
kubectl apply -f monitoring/
kubectl -n monitoring get pods    # wait for all Running
```

## Access (no public exposure)

No NodePort and no security-group hole. Reach it over the existing SSH session:

```bash
kubectl -n monitoring port-forward svc/grafana 3000:3000     # http://localhost:3000  (admin/admin)
kubectl -n monitoring port-forward svc/prometheus 9090:9090  # http://localhost:9090
```

Grafana with a default password on a public IP is a liability, so it is never
exposed. Port-forward means it is only reachable by someone already on the box.

## Honest limitation

The app is static nginx and exposes no `/metrics` endpoint, so this monitors the
infrastructure layer (pod/host usage, restarts), not app-internal metrics. If
the app were instrumented, the same Prometheus would just add a scrape job for
its `/metrics`.
