-- A trip whose arrival is recorded no longer holds its bus or its driver. Its real hours are already
-- past and every new trip starts in the future, so leaving it out cannot let two trips meet.
ALTER TABLE trips DROP CONSTRAINT trips_bus_no_overlap;
ALTER TABLE trips ADD CONSTRAINT trips_bus_no_overlap
  EXCLUDE USING gist (bus_id WITH =, tstzrange(departure_at, estimated_arrival_at, '[)') WITH &&)
  WHERE (status <> 'COMPLETED');
ALTER TABLE trips DROP CONSTRAINT trips_driver_no_overlap;
ALTER TABLE trips ADD CONSTRAINT trips_driver_no_overlap
  EXCLUDE USING gist (driver_id WITH =, tstzrange(departure_at, estimated_arrival_at, '[)') WITH &&)
  WHERE (status <> 'COMPLETED');

-- The status now decides who holds a bus, so it follows the immutable records: it only moves
-- forward, and a trip is on the road or completed only with its departure or arrival recorded.
CREATE FUNCTION trips_status_follows_records() RETURNS trigger AS $$
BEGIN
  IF NEW.status < OLD.status THEN
    RAISE EXCEPTION 'The status of a trip only moves forward';
  END IF;
  IF NEW.status = 'IN_TRANSIT' AND NOT EXISTS (SELECT 1 FROM trip_departures WHERE trip_id = NEW.id) THEN
    RAISE EXCEPTION 'A trip is on the road only with its departure recorded';
  END IF;
  IF NEW.status = 'COMPLETED' AND NOT EXISTS (SELECT 1 FROM trip_arrivals WHERE trip_id = NEW.id) THEN
    RAISE EXCEPTION 'A trip is completed only with its arrival recorded';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trips_status_follows_records BEFORE UPDATE OF status ON trips
  FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION trips_status_follows_records();
