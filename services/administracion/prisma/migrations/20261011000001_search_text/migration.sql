-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "search_text" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "search_text" TEXT NOT NULL DEFAULT '';

-- Accent-free, lowercase text used by the list searches (unaccent needs an extension the service role cannot create).
CREATE FUNCTION fold_search_text(value text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT lower(translate(value, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) $$;

CREATE FUNCTION users_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := fold_search_text(NEW.full_name || ' ' || NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER users_search_text BEFORE INSERT OR UPDATE OF full_name, email ON users
  FOR EACH ROW EXECUTE FUNCTION users_search_text();

CREATE FUNCTION branches_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := fold_search_text(NEW.name || ' ' || NEW.code || ' ' || NEW.municipality || ' ' || NEW.department);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER branches_search_text BEFORE INSERT OR UPDATE OF name, code, municipality, department ON branches
  FOR EACH ROW EXECUTE FUNCTION branches_search_text();

UPDATE users SET search_text = fold_search_text(full_name || ' ' || email);
UPDATE branches SET search_text = fold_search_text(name || ' ' || code || ' ' || municipality || ' ' || department);
