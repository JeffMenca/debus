-- The fold covers every accented letter of Latin-1 Supplement and Latin Extended-A (U+00C0 to U+017F),
-- not only the Spanish ones, so a name such as François is found by the text typed to search for it.
-- Keep it in step with foldSearchText in @debus/contracts: the search-text integration test compares them.
CREATE OR REPLACE FUNCTION fold_search_text(value text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT lower(translate(value, 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİĴĵĶķĹĺĻļĽľŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽž', 'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyyAaAaAaCcCcCcCcDdEeEeEeEeEeGgGgGgGgHhIiIiIiIiIJjKkLlLlLlNnNnNnOoOoOoRrRrRrSsSsSsSsTtTtUuUuUuUuUuUuWwYyYZzZzZz')) $$;

-- A route is searched by the name and code of its destination branch, which lives in the branch copy.
CREATE FUNCTION route_destination_text(destination uuid) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT fold_search_text(COALESCE((SELECT name || ' ' || code FROM branches WHERE id = destination), '')) $$;

CREATE OR REPLACE FUNCTION routes_search_text() RETURNS trigger AS $$
BEGIN
  NEW.search_text := route_destination_text(NEW.destination_branch_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Renaming the destination branch (BranchUpdated) must reach the routes that go there.
CREATE FUNCTION branches_refresh_route_text() RETURNS trigger AS $$
BEGIN
  UPDATE routes SET search_text = route_destination_text(NEW.id) WHERE destination_branch_id = NEW.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER branches_refresh_route_text AFTER UPDATE OF name, code ON branches
  FOR EACH ROW EXECUTE FUNCTION branches_refresh_route_text();

UPDATE buses SET search_text = fold_search_text(plate || ' ' || brand || ' ' || model);
UPDATE drivers SET search_text = fold_search_text(full_name || ' ' || license_number || ' ' || email);
UPDATE routes SET search_text = route_destination_text(destination_branch_id);
