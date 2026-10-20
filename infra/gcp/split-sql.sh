#!/usr/bin/env bash
# One-time move from the shared Cloud SQL instance to one instance per service. Run it after bootstrap.sh,
# at a quiet time: writes a service receives between its export and its cutover are lost. Re-runnable,
# services already pointing at their own instance are skipped. Usage:
#   PROJECT_ID=my-project REGION=us-central1 ./infra/gcp/split-sql.sh
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
: "${REGION:?set REGION}"
OLD_INSTANCE="${OLD_INSTANCE:-debus-pg}"
SQL_INSTANCE_PREFIX="${SQL_INSTANCE_PREFIX:-debus-pg}"
BUCKET="gs://${PROJECT_ID}-debus-sql-split"
DB_SERVICES=(administracion flota viajes ventas clientes reportes notificaciones)

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
exists() { "$@" >/dev/null 2>&1; }
instance_account() { gcloud sql instances describe "$1" --format='value(serviceAccountEmailAddress)'; }
grant_bucket() {
  gcloud storage buckets add-iam-policy-binding "$BUCKET" --member "serviceAccount:$1" \
    --role roles/storage.objectAdmin >/dev/null
}

exists gcloud storage buckets describe "$BUCKET" ||
  gcloud storage buckets create "$BUCKET" --location "$REGION" --uniform-bucket-level-access
grant_bucket "$(instance_account "$OLD_INSTANCE")"

for svc in "${DB_SERVICES[@]}"; do
  instance="$SQL_INSTANCE_PREFIX-$svc"
  secret="$svc-database-url"
  connection_name=$(gcloud sql instances describe "$instance" --format='value(connectionName)')
  url=$(gcloud secrets versions access latest --secret "$secret")
  if [[ "$url" == *"/cloudsql/$connection_name" ]]; then
    echo "$svc already uses $instance, skipping"
    continue
  fi

  echo "== $svc: $OLD_INSTANCE -> $instance"
  job="$svc-outbox-flush"
  paused=false
  if exists gcloud scheduler jobs describe "$job" --location "$REGION"; then
    gcloud scheduler jobs pause "$job" --location "$REGION" >/dev/null
    paused=true
  fi

  grant_bucket "$(instance_account "$instance")"
  dump="$BUCKET/$svc.sql"
  gcloud sql export sql "$OLD_INSTANCE" "$dump" --database "$svc" --quiet

  # Same user and password as before, so the dump keeps its owner and only the socket in the URL changes.
  password=$(sed -E 's#^postgresql://[^:]+:([^@]+)@.*#\1#' <<<"$url")
  if exists gcloud sql users describe "$svc" --instance "$instance"; then
    gcloud sql users set-password "$svc" --instance "$instance" --password "$password"
  else
    gcloud sql users create "$svc" --instance "$instance" --password "$password"
  fi
  # Nothing uses the new database until the cutover below, so a half-finished earlier run is wiped first.
  exists gcloud sql databases describe "$svc" --instance "$instance" &&
    gcloud sql databases delete "$svc" --instance "$instance" --quiet
  gcloud sql databases create "$svc" --instance "$instance"
  gcloud sql import sql "$instance" "$dump" --database "$svc" --user "$svc" --quiet

  printf 'postgresql://%s:%s@localhost/%s?host=/cloudsql/%s' "$svc" "$password" "$svc" "$connection_name" |
    gcloud secrets versions add "$secret" --data-file=- >/dev/null
  # A new revision mounts the new socket and reads the new secret version at the same time.
  gcloud run services update "$svc" --region "$REGION" --set-cloudsql-instances "$connection_name" --quiet
  exists gcloud run jobs describe "$svc-migrate" --region "$REGION" &&
    gcloud run jobs update "$svc-migrate" --region "$REGION" --set-cloudsql-instances "$connection_name" --quiet
  [ "$paused" = true ] && gcloud scheduler jobs resume "$job" --location "$REGION" >/dev/null

  service_url="https://$svc-$PROJECT_NUMBER.$REGION.run.app"
  if token=$(gcloud auth print-identity-token --impersonate-service-account="github-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
    --audiences="$service_url" 2>/dev/null); then
    curl --fail --silent --retry 5 --retry-delay 5 --retry-all-errors \
      -H "X-Serverless-Authorization: Bearer $token" "$service_url/health" >/dev/null
    echo "$svc is healthy on $instance"
  else
    echo "Could not mint an identity token; check $service_url/health by hand"
  fi
done

gcloud storage rm --recursive "$BUCKET"

cat <<OUT

Done. Every service now runs on its own instance.
  1. Set the GitHub repository variable GCP_CLOUDSQL_PREFIX=$PROJECT_ID:$REGION:$SQL_INSTANCE_PREFIX and run deploy with all=true.
  2. Once everything checks out, delete the old instance and the old variable:
       gcloud sql instances delete $OLD_INSTANCE
       (GitHub) remove GCP_CLOUDSQL_INSTANCE
OUT
