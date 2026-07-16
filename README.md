# k8s-cicd — CI/CD Pipeline with Git, Jenkins, and Kubernetes

Automated pipeline: a commit to Git triggers Jenkins to build a container image,
push it to a registry, and deploy it to a Kubernetes cluster — with automatic
rollback on failure. Built for the FinacPlus SRE/DevOps assignment.

The sample workload is a small React CRUD app (`crud-app`). The app is incidental;
the pipeline is the deliverable.

## Architecture

Everything runs on a single EC2 instance to keep it cheap and stoppable. Jenkins
runs natively (not containerised) so it reuses the Docker, kubectl, helm, and AWS
CLI already on the host.

```
Developer          GitHub              EC2 t3.large (Elastic IP)
─────────          ──────              ─────────────────────────────────
git push  ───────▶ repo
                    │ webhook (push event)
                    ▼
                   :8080/github-webhook/
                                    ┌──────────────────────────────┐
                                    │ Jenkins (native, systemd)    │
                                    │  1. checkout (commit SHA)    │
                                    │  2. docker build             │
                                    │  3. docker push ───────────────▶ Amazon ECR
                                    │  4. refresh pull secret      │        │
                                    │  5. helm upgrade --atomic    │        │
                                    │  6. verify rollout           │        │
                                    └──────────────┬───────────────┘        │
                                                   ▼                        │
                                    ┌──────────────────────────────┐        │
                                    │ k3s (same host)              │        │
                                    │  pods ◀── pull image ─────────────────┘
                                    │  Service type=LoadBalancer   │
                                    │  (k3s ServiceLB → node :80)  │
                                    └──────────────┬───────────────┘
                                                   ▼
                                    http://<Elastic-IP>/   (live app)
```

**Why these choices**

| Choice | Reason |
|---|---|
| Single EC2 + k3s (not EKS) | EKS control plane bills continuously and **cannot be stopped**, only deleted. A single EC2 can be stopped between sessions (~$1/month idle). k3s is a CNCF-certified, lightweight Kubernetes. |
| Jenkins native (not in Docker) | The host already has docker/kubectl/helm/aws for the build. A container would duplicate them and need socket + kubeconfig mounts. Native is simpler here. |
| ECR (kept, single host) | Docker and k3s (containerd) have **separate** image stores even on one host — the registry is the bridge. It also gives immutable, SHA-tagged image versioning, which is what makes rollback possible. |
| Traefik disabled | k3s ships Traefik (ingress) which claims port 80. We expose the app via a `LoadBalancer` Service instead, so Traefik was redundant and blocking the port. |
| Helm (not raw kubectl) | `helm upgrade --atomic` gives automatic rollback on a failed deploy; a values file per environment answers "adaptable to different clusters". |

## Repository layout

```
k8s-cicd/
├── application/            React app + multi-stage Dockerfile
│   ├── Dockerfile
│   └── src/ ...
├── helm/crud-app/          Helm chart
│   ├── Chart.yaml
│   ├── values.yaml         image repo, pull secret, resources, security context
│   └── templates/          deployment.yaml, service.yaml
├── Jenkinsfile             the pipeline (build → push → deploy)
└── README.md
```

## Prerequisites

- An AWS account (region `us-east-1` here)
- A Linux host reachable on a public IP (EC2 `t3.large`, Ubuntu)
- A GitHub repository

## Setup from scratch

### 1. EC2 instance

- Launch a `t3.large`, Ubuntu, 30 GiB gp3 disk.
- Allocate an **Elastic IP** and associate it (a stable IP survives stop/start; the
  GitHub webhook depends on it).
- Security group inbound:
  - `22` (SSH) — your IP only
  - `8080` (Jenkins) — your IP + GitHub's webhook CIDRs (`https://api.github.com/meta`)
  - `80` (app) — `0.0.0.0/0`

### 2. Host tooling

```bash
# Docker
sudo apt-get update && sudo apt-get install -y docker.io
sudo usermod -aG docker ubuntu   # re-login after this

# k3s (single-node Kubernetes), with Traefik disabled
echo "disable: traefik" | sudo tee /etc/rancher/k3s/config.yaml
curl -sfL https://get.k3s.io | sh -
mkdir -p ~/.kube && sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config && chmod 600 ~/.kube/config
export KUBECONFIG=~/.kube/config

# Helm
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# AWS CLI
sudo apt-get install -y unzip
curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip -q awscliv2.zip && sudo ./aws/install
```

### 3. ECR + IAM (no static keys)

- Create a private ECR repository (`k8s-cicd`), scan-on-push enabled.
- Create an IAM **role** trusted by EC2 with a least-privilege inline policy: push/pull
  on that one repository, plus `ecr:GetAuthorizationToken` (must be `Resource: "*"` —
  it is account-level and does not support resource scoping).
- Attach the role to the instance (**Actions → Security → Modify IAM role**).

The instance now authenticates to ECR with temporary, auto-rotating credentials from
its role — no access keys are stored anywhere.

### 4. Jenkins (native)

```bash
sudo apt-get install -y fontconfig openjdk-21-jre
sudo wget -O /etc/apt/keyrings/jenkins-keyring.asc \
  https://pkg.jenkins.io/debian-stable/jenkins.io-2026.key
echo "deb [signed-by=/etc/apt/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" \
  | sudo tee /etc/apt/sources.list.d/jenkins.list
sudo apt-get update && sudo apt-get install -y jenkins

# give the jenkins user Docker access and a kubeconfig
sudo usermod -aG docker jenkins
sudo mkdir -p /var/lib/jenkins/.kube
sudo cp /etc/rancher/k3s/k3s.yaml /var/lib/jenkins/.kube/config
sudo chown -R jenkins:jenkins /var/lib/jenkins/.kube
sudo chmod 600 /var/lib/jenkins/.kube/config
sudo systemctl restart jenkins
```

Open `http://<Elastic-IP>:8080`, unlock with
`/var/lib/jenkins/secrets/initialAdminPassword`, install suggested plugins, create
an admin user.

### 5. Pipeline job + webhook

- **New Item → Pipeline** named `crud-app`.
- **Pipeline → Definition: Pipeline script from SCM → Git**, repo URL, branch `*/main`,
  script path `Jenkinsfile`.
- **Build Triggers → GitHub hook trigger for GITScm polling**.
- In GitHub: **Settings → Webhooks → Add webhook**, payload
  `http://<Elastic-IP>:8080/github-webhook/`, content type `application/json`, push event.

Push a commit — the pipeline runs automatically.

## How the pipeline works (`Jenkinsfile`)

| Stage | Action |
|---|---|
| Checkout | Reads the short commit SHA; this becomes the image tag (never `latest` — immutable tags make rollback meaningful). |
| Build Image | `docker build` — the multi-stage Dockerfile compiles the app in Node and serves the static output from nginx. |
| Push to ECR | `docker login` via the instance role, then `docker push`. |
| Refresh ECR Pull Secret | Recreates the `ecr-creds` Kubernetes secret each deploy (ECR tokens expire after 12h). Uses `create --dry-run=client -o yaml \| kubectl apply` so it is create-or-update, and `set +x` so the token never reaches the build log. |
| Deploy | `helm upgrade --install --atomic` — deploys the SHA-tagged image; rolls back automatically if pods do not become healthy in time. |
| Verify | `kubectl rollout status` confirms the new pods are live. |

The build and deploy always use the **same** commit SHA, so they can never disagree
about which version is live.

## Adapting to a different repo or cluster

The pipeline is parameterised — nothing app- or cluster-specific is hardcoded:

| Parameter | Default | Change to target… |
|---|---|---|
| `ECR_REPO` | `…/k8s-cicd` | a different registry/repository |
| `AWS_REGION` | `us-east-1` | a different region |
| `HELM_RELEASE` | `crud-app` | a different release name |
| `NAMESPACE` | `default` | a different namespace / logical environment |

To onboard a **new application repo**, copy the `Jenkinsfile` and point a new Jenkins
job at it. To target a **different cluster**, point `KUBECONFIG` (in the `environment`
block) at that cluster's config — the same pipeline deploys anywhere `kubectl` can reach.

## Security

- **No static credentials.** The EC2 instance-profile role provides temporary,
  rotating ECR credentials. Nothing sensitive is committed or stored in Jenkins.
- **Least-privilege IAM.** The role can push/pull only the one ECR repository.
- **Secrets kept out of logs.** The pull-secret stage disables shell tracing so the
  ECR token is never echoed into the Jenkins console.
- **Locked-down Jenkins.** Port 8080 is restricted to the operator's IP plus GitHub's
  published webhook ranges — never open to the internet.
- **Hardened workload.** The image runs as a non-root user; the deployment sets
  `runAsNonRoot`, drops all capabilities, disables privilege escalation, and applies
  CPU/memory limits.
- **ECR scan-on-push** flags known vulnerabilities in every pushed image.

## Improvements over the previous implementation

This is an evolution of an earlier version of the same project. Issues found and fixed:

1. **Docker image 1.37 GB → 55 MB.** The old multi-stage build copied source +
   `node_modules` into the runtime stage and ran the React **dev server** in
   production. Rewritten to build in Node and serve compiled static files from nginx.
2. **Rollback made real.** The Helm chart had no readiness/liveness probes, so
   `--atomic` could never detect a bad deploy. Probes added — rollback now works.
3. **Reproducible builds.** A missing babel dependency was patched inside the pipeline
   (`npm install` during CI); moved into `package.json` so any clone builds cleanly.
4. **Fixed a blank-page bug.** `homepage` in `package.json` pointed at the original
   author's GitHub Pages path, breaking asset URLs in production.
5. **Parameterised pipeline.** The old Jenkinsfile hardcoded app name, namespace, and
   kubeconfig; these are now parameters, satisfying the "adaptable to different repos
   and clusters" requirement.
6. **No static Docker Hub credentials.** Replaced with an EC2 IAM role + ECR.

## Verify / demo

**Happy path:** edit a line in `application/src/`, commit, push. Jenkins triggers
automatically; within a few minutes the change is live at `http://<Elastic-IP>/`.
Confirm the running image matches the commit:

```bash
kubectl get deploy crud-app -o jsonpath='{..image}'   # ends in the pushed SHA
```

**Failure path (graceful error handling):** break the app or a readiness probe and
push. The build/deploy fails, `helm --atomic` rolls back to the previous release, and
the old version keeps serving — zero downtime from a bad commit.

App login: `admin@example.com` / `qwerty`.

## Cost & teardown

`t3.large` ≈ $2/day running, ≈ $1/month stopped (EBS only). Stop the instance when
idle; k3s state persists on disk and restarts in ~2 minutes.

```bash
# ECR token refresh, rollout status, or a full teardown are all documented above.
# To pause: stop the EC2 instance (keeps the Elastic IP and disk).
```

## Credits

The sample CRUD application is based on
[safdarjamal/crud-app](https://github.com/safdarjamal/crud-app). This project adds the
containerisation, Helm chart, and CI/CD pipeline around it.
