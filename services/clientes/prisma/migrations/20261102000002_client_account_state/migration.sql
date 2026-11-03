-- The profile follows the account through UserUpdated, so a deactivated client is no longer offered.
-- An account deactivated before this migration stays active here until it is republished.
ALTER TABLE client_profiles ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE client_profiles ADD COLUMN account_version INTEGER NOT NULL DEFAULT 0;

-- The NIT is also searchable the way the profile shows it, with its hyphen.
CREATE OR REPLACE FUNCTION client_profile_search_source(full_name text, email text, nit text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
    SELECT full_name || ' ' || email || ' ' ||
      COALESCE(nit || ' ' || left(nit, -1) || '-' || right(nit, 1), '') $$;

CREATE OR REPLACE FUNCTION client_profiles_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := fold_search_text(client_profile_search_source(NEW.full_name, NEW.email, NEW.nit));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE client_profiles
  SET search_text = fold_search_text(client_profile_search_source(full_name, email, nit));
