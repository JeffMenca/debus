-- The expense search promises the plate, the categories and the descriptions, so search_text holds
-- all three. The lines arrive after the header, and a category can be renamed later: the database
-- recomputes the text from both sides.
CREATE FUNCTION refresh_repair_expense_search_text(target uuid) RETURNS void AS $$
  UPDATE repair_expenses e
  SET search_text = fold_search_text(concat_ws(' ', e.bus_plate, (
    SELECT string_agg(c.name || ' ' || l.description, ' ' ORDER BY l.position)
    FROM repair_expense_lines l
    JOIN expense_categories c ON c.id = l.category_id
    WHERE l.expense_id = e.id
  )))
  WHERE e.id = target;
$$ LANGUAGE sql;

CREATE FUNCTION repair_expense_lines_search_text() RETURNS trigger AS $$
BEGIN
  PERFORM refresh_repair_expense_search_text(expense_id) FROM (SELECT DISTINCT expense_id FROM inserted_lines) AS touched;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER repair_expense_lines_search_text AFTER INSERT ON repair_expense_lines
  REFERENCING NEW TABLE AS inserted_lines
  FOR EACH STATEMENT EXECUTE FUNCTION repair_expense_lines_search_text();

CREATE FUNCTION expense_category_renamed_search_text() RETURNS trigger AS $$
BEGIN
  PERFORM refresh_repair_expense_search_text(expense_id)
    FROM (SELECT DISTINCT expense_id FROM repair_expense_lines WHERE category_id = NEW.id) AS touched;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER expense_category_renamed_search_text AFTER UPDATE OF name ON expense_categories
  FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION expense_category_renamed_search_text();

-- Expenses saved before this migration only had the plate.
SELECT refresh_repair_expense_search_text(id) FROM repair_expenses;
