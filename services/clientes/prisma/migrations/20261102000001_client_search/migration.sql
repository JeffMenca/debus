-- A branch admin finds the client of a counter rental by name, email or NIT, with or without accents.
-- Keep it in step with foldSearchText in @debus/contracts.
CREATE FUNCTION fold_search_text(value text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT lower(translate(value, 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİĴĵĶķĹĺĻļĽľŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽž', 'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyyAaAaAaCcCcCcCcDdEeEeEeEeEeGgGgGgGgHhIiIiIiIiIJjKkLlLlLlNnNnNnOoOoOoRrRrRrSsSsSsSsTtTtUuUuUuUuUuUuWwYyYZzZzZz')) $$;

ALTER TABLE client_profiles ADD COLUMN search_text TEXT NOT NULL DEFAULT '';

CREATE FUNCTION client_profiles_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := fold_search_text(NEW.full_name || ' ' || NEW.email || ' ' || COALESCE(NEW.nit, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER client_profiles_search_text BEFORE INSERT OR UPDATE OF full_name, email, nit ON client_profiles
  FOR EACH ROW EXECUTE FUNCTION client_profiles_search_text();

UPDATE client_profiles SET search_text = fold_search_text(full_name || ' ' || email || ' ' || COALESCE(nit, ''));

CREATE INDEX client_profiles_role_full_name_user_id_idx ON client_profiles (role, full_name, user_id);

-- A counter rental now belongs to a client too; only the rows from before this change have none.
ALTER TABLE rentals DROP CONSTRAINT rentals_channel_client;
ALTER TABLE rentals ADD CONSTRAINT rentals_channel_client CHECK (channel <> 'ONLINE' OR client_id IS NOT NULL);
