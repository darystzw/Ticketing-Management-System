-- ============================================
-- EVENT TICKET MANAGEMENT SYSTEM - COMPLETE SCHEMA
-- Version: 2.0 with Bulk Sales Support
-- Migration Date: 2025-11-14
-- ============================================

-- ============================================
-- CREATE ENUMS (if not exists)
-- ============================================

DO $$ BEGIN
    CREATE TYPE app_role AS ENUM ('admin', 'cashier', 'scanner');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sale_type AS ENUM ('cashier', 'bulk');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ticket_status AS ENUM ('available', 'sold', 'used');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- ALTER EXISTING TABLES TO ADD NEW COLUMNS
-- ============================================

-- Add bulk sale fields to events table if they don't exist
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS bulk_sold_range_start INTEGER,
ADD COLUMN IF NOT EXISTS bulk_sold_range_end INTEGER,
ADD COLUMN IF NOT EXISTS bulk_buyer_name TEXT,
ADD COLUMN IF NOT EXISTS bulk_buyer_email TEXT,
ADD COLUMN IF NOT EXISTS bulk_buyer_phone TEXT;

-- Add constraint for valid bulk range
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_bulk_range'
  ) THEN
    ALTER TABLE public.events ADD CONSTRAINT valid_bulk_range CHECK (
      (bulk_sold_range_start IS NULL AND bulk_sold_range_end IS NULL) OR
      (bulk_sold_range_start >= range_start AND 
       bulk_sold_range_end <= range_end AND 
       bulk_sold_range_start <= bulk_sold_range_end)
    );
  END IF;
END$$;

-- Add sale_type to tickets table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'tickets'
    AND column_name = 'sale_type'
  ) THEN
    ALTER TABLE public.tickets 
    ADD COLUMN sale_type sale_type NOT NULL DEFAULT 'cashier';
  END IF;
END$$;

-- ============================================
-- BACKFILL EXISTING BULK TICKETS
-- ============================================

-- Update tickets that fall within existing bulk ranges to mark them as bulk sales
UPDATE public.tickets t
SET sale_type = 'bulk'
FROM public.events e
WHERE t.event_id = e.id
  AND e.bulk_sold_range_start IS NOT NULL
  AND e.bulk_sold_range_end IS NOT NULL
  AND t.ticket_number >= e.bulk_sold_range_start
  AND t.ticket_number <= e.bulk_sold_range_end
  AND t.sale_type != 'bulk'; -- Only update if not already marked as bulk

-- ============================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_tickets_sale_type ON public.tickets(sale_type);
CREATE INDEX IF NOT EXISTS idx_events_bulk_range ON public.events(bulk_sold_range_start, bulk_sold_range_end);

-- ============================================
-- CREATE/UPDATE HELPER FUNCTIONS
-- ============================================

-- Update event bulk sale range with smart merging
CREATE OR REPLACE FUNCTION public.update_event_bulk_range(
  _event_id UUID,
  _bulk_range_start INTEGER,
  _bulk_range_end INTEGER,
  _buyer_name TEXT,
  _buyer_email TEXT DEFAULT NULL,
  _buyer_phone TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_bulk_start INTEGER;
  current_bulk_end INTEGER;
  event_start INTEGER;
  event_end INTEGER;
  new_start INTEGER;
  new_end INTEGER;
BEGIN
  -- Get current event details with row lock to prevent race conditions
  SELECT range_start, range_end, bulk_sold_range_start, bulk_sold_range_end 
  INTO event_start, event_end, current_bulk_start, current_bulk_end
  FROM public.events 
  WHERE id = _event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Validate new bulk range is within event range
  IF _bulk_range_start < event_start OR _bulk_range_end > event_end THEN
    RAISE EXCEPTION 'Bulk range %-% is outside event range %-%', 
      _bulk_range_start, _bulk_range_end, event_start, event_end;
  END IF;

  -- Validate range is continuous
  IF _bulk_range_start > _bulk_range_end THEN
    RAISE EXCEPTION 'Invalid bulk range: start % is greater than end %', 
      _bulk_range_start, _bulk_range_end;
  END IF;

  -- If there's an existing bulk range
  IF current_bulk_start IS NOT NULL AND current_bulk_end IS NOT NULL THEN
    -- Check if ranges overlap or are adjacent (within 1 number apart)
    IF (_bulk_range_start <= current_bulk_end + 1 AND _bulk_range_end >= current_bulk_start - 1) THEN
      -- Ranges overlap or are adjacent - merge them
      new_start := LEAST(current_bulk_start, _bulk_range_start);
      new_end := GREATEST(current_bulk_end, _bulk_range_end);
      
      UPDATE public.events 
      SET 
        bulk_sold_range_start = new_start,
        bulk_sold_range_end = new_end,
        bulk_buyer_name = _buyer_name,
        bulk_buyer_email = COALESCE(_buyer_email, bulk_buyer_email),
        bulk_buyer_phone = COALESCE(_buyer_phone, bulk_buyer_phone)
      WHERE id = _event_id;
      
      RAISE NOTICE 'Merged bulk ranges: %-% + %-% = %-%', 
        current_bulk_start, current_bulk_end, _bulk_range_start, _bulk_range_end, new_start, new_end;
    ELSE
      -- Ranges have a gap - this is an error for bulk sales
      RAISE EXCEPTION 'New bulk range %-% has a gap with existing range %-%. Gap size: %', 
        _bulk_range_start, _bulk_range_end, current_bulk_start, current_bulk_end,
        LEAST(ABS(_bulk_range_start - current_bulk_end - 1), ABS(current_bulk_start - _bulk_range_end - 1));
    END IF;
  ELSE
    -- No existing bulk range, set the new one
    UPDATE public.events 
    SET 
      bulk_sold_range_start = _bulk_range_start,
      bulk_sold_range_end = _bulk_range_end,
      bulk_buyer_name = _buyer_name,
      bulk_buyer_email = _buyer_email,
      bulk_buyer_phone = _buyer_phone
    WHERE id = _event_id;
    
    RAISE NOTICE 'Set new bulk range: %-%', _bulk_range_start, _bulk_range_end;
  END IF;
END;
$$;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN public.events.bulk_sold_range_start IS 'Start of bulk sold ticket range (inclusive)';
COMMENT ON COLUMN public.events.bulk_sold_range_end IS 'End of bulk sold ticket range (inclusive)';
COMMENT ON COLUMN public.events.bulk_buyer_name IS 'Name of bulk buyer';
COMMENT ON COLUMN public.events.bulk_buyer_email IS 'Email of bulk buyer';
COMMENT ON COLUMN public.events.bulk_buyer_phone IS 'Phone of bulk buyer';
COMMENT ON COLUMN public.tickets.sale_type IS 'Whether ticket was sold via cashier or bulk sale';
COMMENT ON FUNCTION public.update_event_bulk_range IS 'Updates event bulk range, merging adjacent ranges automatically';

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.user_roles TO authenticated;
GRANT ALL ON public.events TO authenticated;
GRANT ALL ON public.tickets TO authenticated;
GRANT ALL ON public.sales TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
