#!/usr/bin/env bash
# One-time, re-runnable GCP setup for debus. Usage:
#   PROJECT_ID=my-project REGION=us-central1 GITHUB_REPO=owner/debus ./infra/gcp/bootstrap.sh
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
: "${REGION:?set REGION}"
: "${GITHUB_REPO:?set GITHUB_REPO as owner/name}"
SQL_INSTANCE_PREFIX="${SQL_INSTANCE_PREFIX:-debus-pg}"
SQL_TIER="${SQL_TIER:-db-f1-micro}"
ARTIFACT_REPO="${ARTIFACT_REPO:-debus}"
MEDIA_BUCKET="${MEDIA_BUCKET:-${PROJECT_ID}-debus-media}"
DB_SERVICES=(administracion flota viajes ventas clientes reportes notificaciones)
ALL_SERVICES=(gateway "${DB_SERVICES[@]}" web)

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
exists() { "$@" >/dev/null 2>&1; }
# Retries a command that can hit per-minute API quotas (for example service account creation).
retry() {
  local attempt
  for attempt in 1 2 3 4 5; do
    "$@" && return 0
    echo "Attempt $attempt failed; waiting 65s before retrying"
    sleep 65
  done
  return 1
}

echo "Enabling APIs"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com sqladmin.googleapis.com \
  pubsub.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com storage.googleapis.com

echo "Artifact Registry"
exists gcloud artifacts repositories describe "$ARTIFACT_REPO" --location "$REGION" ||
  gcloud artifacts repositories create "$ARTIFACT_REPO" --repository-format docker --location "$REGION"

echo "Cloud SQL (PostgreSQL 17, one instance, database and user per service, so one outage stays contained)"
operations=()
for svc in "${DB_SERVICES[@]}"; do
  instance="$SQL_INSTANCE_PREFIX-$svc"
  exists gcloud sql instances describe "$instance" ||
    operations+=("$(gcloud sql instances create "$instance" --database-version POSTGRES_17 --tier "$SQL_TIER" \
      --region "$REGION" --edition enterprise --storage-auto-increase --async --format='value(name)')")
done
# Creating them one by one takes close to an hour; in parallel it takes about ten minutes.
for operation in ${operations[@]+"${operations[@]}"}; do
  gcloud sql operations wait "$operation" --timeout unlimited >/dev/null
done
for svc in "${DB_SERVICES[@]}"; do
  instance="$SQL_INSTANCE_PREFIX-$svc"
  db="$svc"
  secret="$svc-database-url"
  exists gcloud sql databases describe "$db" --instance "$instance" ||
    gcloud sql databases create "$db" --instance "$instance"
  connection_name=$(gcloud sql instances describe "$instance" --format='value(connectionName)')
  if exists gcloud secrets describe "$secret"; then
    # A secret pointing at another instance (the old shared one) gets a new user and version here; the
    # next deploy mounts the new instance and starts from an empty database.
    [[ "$(gcloud secrets versions access latest --secret "$secret")" == *"/cloudsql/$connection_name" ]] && continue
    password=$(openssl rand -hex 24)
    if exists gcloud sql users describe "$db" --instance "$instance"; then
      gcloud sql users set-password "$db" --instance "$instance" --password "$password"
    else
      gcloud sql users create "$db" --instance "$instance" --password "$password"
    fi
    printf 'postgresql://%s:%s@localhost/%s?host=/cloudsql/%s' "$db" "$password" "$db" "$connection_name" |
      gcloud secrets versions add "$secret" --data-file=- >/dev/null
  else
    password=$(openssl rand -hex 24)
    gcloud sql users create "$db" --instance "$instance" --password "$password"
    printf 'postgresql://%s:%s@localhost/%s?host=/cloudsql/%s' "$db" "$password" "$db" "$connection_name" |
      gcloud secrets create "$secret" --data-file=-
  fi
done

echo "Service accounts (account IDs need 6-30 characters, so each unit gets the debus- prefix)"
for account in "${ALL_SERVICES[@]/#/debus-}" pubsub-invoker github-deployer; do
  exists gcloud iam service-accounts describe "$account@$PROJECT_ID.iam.gserviceaccount.com" ||
    retry gcloud iam service-accounts create "$account" --display-name "$account"
done
bind() { gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$1@$PROJECT_ID.iam.gserviceaccount.com" --role "$2" --condition None >/dev/null; }
for svc in "${DB_SERVICES[@]}"; do
  bind "debus-$svc" roles/cloudsql.client
  bind "debus-$svc" roles/secretmanager.secretAccessor
done
for svc in "${ALL_SERVICES[@]}"; do
  bind "debus-$svc" roles/pubsub.publisher
  # Private services only accept identity tokens from these accounts (gateway, peer services, Pub/Sub).
  bind "debus-$svc" roles/run.invoker
  bind "debus-$svc" roles/iam.serviceAccountTokenCreator
done
bind pubsub-invoker roles/run.invoker
# The deploy health check mints identity tokens for the private services by impersonating this same account.
bind github-deployer roles/iam.serviceAccountTokenCreator
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
  --member "serviceAccount:debus-flota@$PROJECT_ID.iam.gserviceaccount.com" --role roles/storage.objectAdmin >/dev/null

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
  GCP_CLOUDSQL_PREFIX=$PROJECT_ID:$REGION:$SQL_INSTANCE_PREFIX
  GCP_WIF_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github
  GCP_DEPLOY_SA=github-deployer@$PROJECT_ID.iam.gserviceaccount.com
  MEDIA_BUCKET=$MEDIA_BUCKET
Create one GitHub environment (Settings > Environments): "production" with required reviewers.
Then run the deploy workflow once with all=true.
Pending: SMTP credentials as secret smtp-url, Cloud Scheduler jobs for /outbox/flush and license alerts.
OUT
