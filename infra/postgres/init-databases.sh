#!/bin/sh
# One database and one user per service, same name as the service.
set -e
for svc in administracion flota viajes ventas clientes reportes notificaciones; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE USER ${svc} WITH PASSWORD '${svc}';
CREATE DATABASE ${svc} OWNER ${svc};
SQL
done
