#!/usr/bin/env bash
# One-time, re-runnable GCP setup for debus. Usage:
#   PROJECT_ID=my-project REGION=us-central1 GITHUB_REPO=owner/debus ./infra/gcp/bootstrap.sh
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
: "${REGION:?set REGION}"
: "${GITHUB_REPO:?set GITHUB_REPO as owner/name}"
SQL_INSTANCE="${SQL_INSTANCE:-debus-pg}"
SQL_TIER="${SQL_TIER:-db-f1-micro}"
ARTIFACT_REPO="${ARTIFACT_REPO:-debus}"
MEDIA_BUCKET="${MEDIA_BUCKET:-${PROJECT_ID}-debus-media}"
DB_SERVICES=(administracion flota viajes ventas clientes reportes notificaciones)
ALL_SERVICES=(gateway "${DB_SERVICES[@]}" web)

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
exists() { "$@" >/dev/null 2>&1; }

echo "Enabling APIs"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com sqladmin.googleapis.com \
  pubsub.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com storage.googleapis.com

echo "Artifact Registry"
exists gcloud artifacts repositories describe "$ARTIFACT_REPO" --location "$REGION" ||
  gcloud artifacts repositories create "$ARTIFACT_REPO" --repository-format docker --location "$REGION"

echo "Cloud SQL (PostgreSQL 17, one database and one user per service)"
exists gcloud sql instances describe "$SQL_INSTANCE" ||
  gcloud sql instances create "$SQL_INSTANCE" --database-version POSTGRES_17 --tier "$SQL_TIER" \
    --region "$REGION" --edition enterprise --storage-auto-increase
if ! gcloud sql instances describe "$SQL_INSTANCE" --format='value(settings.databaseFlags)' | grep -q max_connections; then
  # 7 services with a database x pool 2 x up to 2 instances.
  gcloud sql instances patch "$SQL_INSTANCE" --database-flags max_connections=60 --quiet
fi
CONNECTION_NAME=$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')
for svc in "${DB_SERVICES[@]}"; do
  db="$svc"
  secret="$svc-database-url"
  exists gcloud sql databases describe "$db" --instance "$SQL_INSTANCE" ||
    gcloud sql databases create "$db" --instance "$SQL_INSTANCE"
  if ! exists gcloud secrets describe "$secret"; then
    password=$(openssl rand -hex 24)
    gcloud sql users create "$db" --instance "$SQL_INSTANCE" --password "$password"
    printf 'postgresql://%s:%s@localhost/%s?host=/cloudsql/%s' "$db" "$password" "$db" "$CONNECTION_NAME" |
      gcloud secrets create "$secret" --data-file=-
  fi
done

echo "Service accounts"
for svc in "${ALL_SERVICES[@]}" pubsub-invoker github-deployer; do
  exists gcloud iam service-accounts describe "$svc@$PROJECT_ID.iam.gserviceaccount.com" ||
    gcloud iam service-accounts create "$svc" --display-name "debus $svc"
done
bind() { gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$1@$PROJECT_ID.iam.gserviceaccount.com" --role "$2" --condition None >/dev/null; }
for svc in "${DB_SERVICES[@]}"; do
  bind "$svc" roles/cloudsql.client
  bind "$svc" roles/secretmanager.secretAccessor
done
for svc in "${ALL_SERVICES[@]}"; do
  bind "$svc" roles/pubsub.publisher
  # Private services only accept identity tokens from these accounts (gateway, peer services, Pub/Sub).
  bind "$svc" roles/run.invoker
  bind "$svc" roles/iam.serviceAccountTokenCreator
done
bind pubsub-invoker roles/run.invoker
for role in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser roles/pubsub.admin \
  roles/cloudscheduler.admin roles/secretmanager.secretAccessor roles/cloudsql.client; do
  bind github-deployer "$role"
done
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:service-$PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role roles/iam.serviceAccountTokenCreator --condition None >/dev/null
# Dead-letter forwarding: the Pub/Sub service agent republishes to <service>-dlq and acks the source.
for role in roles/pubsub.publisher roles/pubsub.subscriber; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:service-$PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com" \
    --role "$role" --condition None >/dev/null
done

echo "Media bucket (bus and driver photos)"
exists gcloud storage buckets describe "gs://$MEDIA_BUCKET" ||
  gcloud storage buckets create "gs://$MEDIA_BUCKET" --location "$REGION" --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding "gs://$MEDIA_BUCKET" \
  --member "serviceAccount:flota@$PROJECT_ID.iam.gserviceaccount.com" --role roles/storage.objectAdmin >/dev/null

echo "Workload Identity Federation for GitHub Actions"
exists gcloud iam workload-identity-pools describe github --location global ||
  gcloud iam workload-identity-pools create github --location global --display-name "GitHub"
exists gcloud iam workload-identity-pools providers describe github --workload-identity-pool github --location global ||
  gcloud iam workload-identity-pools providers create-oidc github --workload-identity-pool github --location global \
    --issuer-uri https://token.actions.githubusercontent.com \
    --attribute-mapping google.subject=assertion.sub,attribute.repository=assertion.repository \
    --attribute-condition "assertion.repository == '$GITHUB_REPO'"
gcloud iam service-accounts add-iam-policy-binding "github-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$GITHUB_REPO" >/dev/null

cat <<OUT

Done. Set these GitHub repository variables (Settings > Secrets and variables > Actions > Variables):
  GCP_PROJECT_ID=$PROJECT_ID
  GCP_PROJECT_NUMBER=$PROJECT_NUMBER
  GCP_REGION=$REGION
  GCP_ARTIFACT_REPO=$ARTIFACT_REPO
  GCP_CLOUDSQL_INSTANCE=$CONNECTION_NAME
  GCP_WIF_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github
  GCP_DEPLOY_SA=github-deployer@$PROJECT_ID.iam.gserviceaccount.com
  MEDIA_BUCKET=$MEDIA_BUCKET
Create one GitHub environment (Settings > Environments): "production" with required reviewers.
Then run the deploy workflow once with all=true.
Pending: SMTP credentials as secret smtp-url, Cloud Scheduler jobs for /outbox/flush and license alerts.
OUT
