# StigNite Advanced Ticketing System

## Overview

A comprehensive event ticket management system with support for bulk ticket sales and individual cashier sales. The system provides three distinct interfaces for managing ticket lifecycle: Admin, Cashier, and Scanner roles.

## Project Status

**Last Updated:** November 16, 2025
**Current Version:** Schema v2.0 with Bulk Sales Support
**Platform:** Modern React + TypeScript + Supabase
**Performance:** Optimized with lazy loading and adaptive caching

## Recent Changes (November 2025)

### Schema v2.0 Migration - Complete Bulk Sales Support

- **Migration File:** `supabase/migrations/20251114_complete_schema_v2.sql`
- **Status:** ✅ Complete with backfill logic

#### New Features

1. **Bulk Sales Support**

   - Added `sale_type` enum: `'cashier' | 'bulk'`
   - Events now track bulk sold ranges with buyer metadata
   - Continuous ticket ranges sold in bulk are tracked separately from individual cashier sales

2. **Events Table Additions**

   - `bulk_sold_range_start`: Start of bulk sold ticket range (inclusive)
   - `bulk_sold_range_end`: End of bulk sold ticket range (inclusive)
   - `bulk_buyer_name`: Name of bulk buyer
   - `bulk_buyer_email`: Email of bulk buyer
   - `bulk_buyer_phone`: Phone of bulk buyer
   - Constraint: `valid_bulk_range` ensures bulk ranges are within event range

3. **Tickets Table Additions**

   - `sale_type`: Enum marking ticket as 'cashier' or 'bulk' sale
   - Indexed for performance

4. **Smart Bulk Range Management**

   - `update_event_bulk_range()` function automatically merges adjacent bulk ranges
   - Prevents gaps in bulk sales (enforces continuous ranges)
   - Validates bulk ranges are within event range

5. **Data Backfill**
   - Migration includes UPDATE statement to backfill existing tickets
   - Tickets within event bulk ranges automatically marked as `sale_type='bulk'`

## Architecture

### Core Design Principles

1. **Bulk vs Cashier Sales**

   - Bulk sales: Continuous ticket ranges sold to one buyer
   - Cashier sales: Individual tickets or tickets with gaps in numbering
   - System automatically classifies based on continuity

2. **Data Integrity**

   - Bulk ticket ranges must be continuous (no gaps)
   - Cashier cannot sell tickets within bulk ranges
   - Validation at both frontend and backend levels

3. **Real-time Updates**
   - Dashboard statistics reflect bulk vs cashier breakdown
   - All pages use real-time sync for data updates

### User Interfaces

#### Admin Interface (`/upload`)

- Upload event tickets via CSV
- Automatically detects continuous ranges for bulk sales
- Collects bulk buyer information (name, email, phone)
- Tickets with gaps become cashier inventory

#### Cashier Interface (`/cashier`)

- Sell individual tickets
- Validates tickets are not in bulk ranges
- Prevents selling bulk tickets individually
- Sets `sale_type='cashier'` on all sales

#### Scanner Interface (`/scanner`)

- Validates tickets at event entry
- Handles both bulk and cashier tickets
- Verifies ticket is within event range
- Checks sale_type matches event bulk range

#### Dashboard (`/dashboard`)

- Real-time statistics
- Separate counts for bulk vs cashier sales
- Total sales revenue tracking
- User management overview

## Technology Stack

- **Frontend:** React 18 + TypeScript + Vite
- **UI Components:** Shadcn/ui + Tailwind CSS + Radix UI
- **Backend:** Supabase (PostgreSQL)
- **State Management:** TanStack Query (React Query)
- **Routing:** React Router v6 with lazy loading
- **Real-time:** Supabase Realtime subscriptions (delayed initialization)
- **Performance:** Code splitting, adaptive caching, network optimization
- **Build Tools:** Vite with optimized dependency bundling

## Database Schema

### Enums

- `app_role`: 'admin' | 'cashier' | 'scanner'
- `sale_type`: 'cashier' | 'bulk'
- `ticket_status`: 'available' | 'sold' | 'used'

### Key Tables

- **events**: Event metadata, date/time, ticket ranges, bulk sale tracking
- **tickets**: Individual ticket records with sale_type classification
- **sales**: Cashier sale transactions (bulk sales tracked via events table)
- **profiles**: User profiles
- **user_roles**: Role-based access control

## Key Files

### Schema & Types

- `supabase/migrations/20251114_complete_schema_v2.sql` - Complete schema with bulk support
- `src/integrations/supabase/types.ts` - TypeScript types matching database schema

### Pages

- `src/pages/Upload.tsx` - Admin upload interface with bulk sale detection
- `src/pages/Cashier.tsx` - Individual ticket sales interface
- `src/pages/Scanner.tsx` - Ticket validation interface
- `src/pages/Dashboard.tsx` - Statistics dashboard with bulk/cashier breakdown
- `src/pages/Account.tsx` - User account management

### Configuration

- `vite.config.ts` - Configured for port 5000, allows all hosts for Replit proxy
- `.replit` - Workflow configuration

## Development Guidelines

### Bulk Sales Workflow

1. Admin uploads tickets with continuous range
2. System prompts for bulk buyer info
3. `update_event_bulk_range()` function updates event
4. Tickets created with `sale_type='bulk'` and buyer metadata
5. Cashier interface excludes these tickets from inventory

### Cashier Sales Workflow

1. Cashier selects event and ticket number
2. System validates ticket not in bulk range
3. Ticket created/updated with `sale_type='cashier'`
4. Sale record created for transaction tracking

### Scanner Workflow

1. Scanner scans QR code
2. System validates ticket for specific event
3. Checks sale_type matches expected range (bulk or cashier)
4. Marks ticket as 'used' upon successful validation

## Environment Setup

### Required Secrets

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key
- `DATABASE_URL` - PostgreSQL connection string (auto-configured)

### Running the Application

#### Development

```bash
npm run dev          # Start development server on port 5000
npm run dev:all      # Start dev server with WebSocket server
npm run build:dev    # Build for development
```

#### Production

```bash
npm run build        # Production build
npm run preview      # Preview production build
```

#### Code Quality

```bash
npm run lint         # Run ESLint
```

### Performance Features

- **Lazy Loading:** All pages are code-split for faster initial loads
- **Adaptive Caching:** Cache TTL adjusts based on network quality
- **Real-time Optimization:** Connections delayed to prevent blocking initial load
- **Bundle Optimization:** Vite properly optimizes all dependencies

## Migration Notes

### Applying Schema v2.0

The migration is idempotent and safe to run multiple times. It:

1. Creates enums if they don't exist
2. Adds columns with `IF NOT EXISTS` checks
3. Backfills existing data based on event bulk ranges
4. Creates indexes for performance
5. Adds helper functions for bulk range management

### Data Integrity

- All existing tickets are classified correctly during migration
- Tickets within event bulk ranges → `sale_type='bulk'`
- All other tickets → `sale_type='cashier'` (default)

## User Preferences

None specified yet.

## Known Issues

- **Browser Extension Conflicts:** Some ad blockers may cause console warnings (safe to ignore)
- **React Router Warnings:** Future compatibility warnings for v7 (non-breaking)

## Future Enhancements

### Features

- Bulk sales reporting dashboard
- CSV export of bulk buyer information
- Enhanced analytics for bulk vs cashier sales trends
- Mobile-responsive improvements
- Offline support for critical operations

### Performance

- Service worker implementation for caching
- Progressive Web App (PWA) capabilities
- Advanced bundle analysis and optimization
- Database query optimization for large datasets
