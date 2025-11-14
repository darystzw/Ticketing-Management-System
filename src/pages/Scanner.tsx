/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react';
import { realtimeSync } from '@/lib/syncService';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';
import logoutIcon from '@/assets/icons/logout.png';
import scannerIcon from '@/assets/icons/scanner.png';
import checkmarkIcon from '@/assets/icons/checkmark.png';
import errorIcon from '@/assets/icons/error.png';

const Scanner = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, signOut, isLoading } = useAuth();
  const [qrData, setQrData] = useState('');
  const [lastScan, setLastScan] = useState<any>(null);
  const [scannedCount, setScannedCount] = useState(0);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false });

    if (error) {
      console.error('Error loading events:', error);
      toast({
        title: 'Error',
        description: 'Failed to load events',
        variant: 'destructive',
      });
      return;
    }

    if (data && data.length > 0) {
      console.log('Events loaded:', data.length);
      setEvents(data);
      if (!selectedEventId) {
        setSelectedEventId(data[0].id);
      }
    } else {
      console.log('No events found in database');
    }
  }, [toast, selectedEventId]);

  const loadScannedCount = useCallback(async () => {
    if (!selectedEventId || !user) return;

    const { count, error } = await supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', selectedEventId)
      .eq('scanned_by', user.id)
      .eq('status', 'used');

    if (error) {
      console.error('Error loading scanned count:', error);
      return;
    }

    setScannedCount(count || 0);
  }, [selectedEventId, user]);

  useEffect(() => {
    if (user) {
      console.log('Scanner: User authenticated, loading events...');
      loadEvents();
    }
  }, [user, loadEvents]);

  useEffect(() => {
    if (user && selectedEventId) {
      console.log('Scanner: Loading scanned count for event:', selectedEventId);
      loadScannedCount();

      // Subscribe to ticket updates
      const unsubscribe = realtimeSync.subscribe('tickets_updated', loadScannedCount);

      return () => {
        unsubscribe();
      };
    }
  }, [user, selectedEventId, loadScannedCount]);

  const validateTicketForEvent = (ticket: any, event: any) => {
    // Check if ticket is within event range
    if (ticket.ticket_number < event.range_start || ticket.ticket_number > event.range_end) {
      return { valid: false, reason: 'Ticket outside event range' };
    }

    // Check ticket status first
    if (ticket.status === 'available') {
      return { valid: false, reason: 'Ticket not sold yet' };
    }

    if (ticket.status === 'used') {
      return { valid: false, reason: 'Ticket already used' };
    }

    // For sold tickets, validate based on sale type
    if (ticket.status === 'sold') {
      // Bulk tickets are valid if they're in the bulk range
      if (ticket.sale_type === 'bulk') {
        if (event.bulk_sold_range_start && event.bulk_sold_range_end) {
          if (ticket.ticket_number >= event.bulk_sold_range_start &&
              ticket.ticket_number <= event.bulk_sold_range_end) {
            return { valid: true, reason: 'Valid bulk ticket' };
          }
        }
        return { valid: false, reason: 'Bulk ticket outside bulk range' };
      }

      // Cashier tickets must not be in bulk range
      if (ticket.sale_type === 'cashier') {
        if (event.bulk_sold_range_start && event.bulk_sold_range_end) {
          if (ticket.ticket_number >= event.bulk_sold_range_start &&
              ticket.ticket_number <= event.bulk_sold_range_end) {
            return { valid: false, reason: 'Cashier ticket in bulk range - invalid' };
          }
        }
        return { valid: true, reason: 'Valid cashier ticket' };
      }
    }

    return { valid: false, reason: 'Invalid ticket status or type' };
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!qrData.trim() || !selectedEventId) {
      toast({
        title: 'Error',
        description: 'Please select an event and enter QR code',
        variant: 'destructive',
      });
      return;
    }

    const selectedEvent = events.find(e => e.id === selectedEventId);
    if (!selectedEvent) {
      toast({
        title: 'Error',
        description: 'Selected event not found',
        variant: 'destructive',
      });
      return;
    }

    const qrCode = qrData.trim();

    // Search for ticket by qr_data
    const { data: ticket, error } = await supabase
      .from('tickets')
      .select('*, events(*)')
      .eq('qr_data', qrCode)
      .eq('event_id', selectedEventId)
      .maybeSingle();

    if (error || !ticket) {
      setLastScan({
        verdict: 'invalid',
        qr_data: qrCode,
        ticket_number: null,
        message: 'Ticket not found',
      });
      toast({
        title: 'Invalid Ticket',
        description: 'QR code not found in system',
        variant: 'destructive',
      });
      setQrData('');
      return;
    }

    // Validate ticket for the event
    const validation = validateTicketForEvent(ticket, selectedEvent);
    
    if (!validation.valid) {
      setLastScan({
        verdict: 'invalid',
        qr_data: qrCode,
        ticket_number: ticket.ticket_number,
        buyer_name: ticket.buyer_name,
        sale_type: ticket.sale_type,
        message: validation.reason,
      });
      toast({
        title: 'Invalid Ticket',
        description: validation.reason,
        variant: 'destructive',
      });
      setQrData('');
      return;
    }

    if (ticket.status === 'used') {
      setLastScan({
        verdict: 'duplicate',
        qr_data: qrCode,
        ticket_number: ticket.ticket_number,
        buyer_name: ticket.buyer_name,
        sale_type: ticket.sale_type,
        scanned_at: ticket.scanned_at,
        message: 'Already scanned',
      });
      toast({
        title: 'Duplicate Entry',
        description: 'This ticket has already been used',
        variant: 'destructive',
      });
      setQrData('');
      return;
    }

    // Update ticket status to 'used' and set scan details
    const { error: updateError } = await supabase
      .from('tickets')
      .update({
        status: 'used',
        scanned_at: new Date().toISOString(),
        scanned_by: user?.id,
      })
      .eq('id', ticket.id)
      .eq('status', 'sold'); // Only update if still in sold status (prevent race conditions)

    if (updateError) {
      console.error('Update error:', updateError);
      toast({
        title: 'Error',
        description: 'Failed to update ticket status',
        variant: 'destructive',
      });
      return;
    }

    setLastScan({
      verdict: 'accepted',
      qr_data: qrCode,
      ticket_number: ticket.ticket_number,
      ticket_code: ticket.ticket_code,
      buyer_name: ticket.buyer_name,
      sale_type: ticket.sale_type,
      event_name: ticket.events?.name || 'Unknown Event',
      scanned_at: new Date().toISOString(),
      message: 'Access granted',
    });

    toast({
      title: 'Ticket Accepted',
      description: `Welcome, ${ticket.buyer_name || 'Guest'}!`,
    });

    setQrData('');
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-card/80 backdrop-blur-sm border-b border-border shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-warning/10 rounded-xl flex items-center justify-center">
                <img src={scannerIcon} alt="Scanner" className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xl font-bold text-foreground">Scanner</span>
                <p className="text-xs text-muted-foreground hidden sm:block">Gate operations</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm hidden sm:flex items-center gap-2 px-3 py-1.5 bg-accent/10 rounded-lg">
                <img src={checkmarkIcon} alt="Checkmark" className="w-4 h-4" />
                <span className="text-muted-foreground">Scanned: </span>
                <span className="font-semibold text-foreground">{scannedCount}</span>
              </div>
              <div className="flex items-center px-3 py-1.5 bg-success/10 text-success rounded-lg text-sm font-medium">
                <div className="w-2 h-2 bg-success rounded-full mr-2 animate-pulse" />
                Online
              </div>
              <span className="text-sm text-muted-foreground hidden md:inline">
                {profile?.name || user.email?.split('@')[0]}
              </span>
              <Button variant="outline" size="sm" onClick={() => navigate('/')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Home
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="hidden sm:flex">
                <img src={logoutIcon} alt="Logout" className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="hover-lift animate-slide-up">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <img src={scannerIcon} alt="Scanner" className="w-5 h-5" />
                Scanner Interface
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Operator: {profile?.name || user.email?.split('@')[0]}
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleScan} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-base">Select Event</Label>
                  <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Choose event..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      {events.map((event) => (
                        <SelectItem key={event.id} value={event.id}>
                          <div className="flex flex-col">
                            <span>{event.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {event.bulk_sold_range_start && event.bulk_sold_range_end 
                                ? `Bulk: ${event.bulk_sold_range_start}-${event.bulk_sold_range_end}`
                                : 'No bulk sales'
                              }
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qrData" className="text-base">QR Code</Label>
                  <Input
                    id="qrData"
                    type="text"
                    placeholder="Scan or enter QR code"
                    value={qrData}
                    onChange={(e) => setQrData(e.target.value)}
                    autoFocus
                    className="text-2xl font-mono h-14 text-center uppercase"
                  />
                </div>

                <Button type="submit" className="w-full h-14 text-lg">
                  <img src={checkmarkIcon} alt="Validate" className="w-5 h-5 mr-2" />
                  Validate Ticket
                </Button>
              </form>

              <div className={`mt-6 p-6 rounded-xl text-center font-bold text-3xl transition-all shadow-lg ${
                !lastScan ? 'bg-muted/50 text-muted-foreground' :
                lastScan.verdict === 'accepted' ? 'bg-success/20 text-success animate-scale-in' :
                lastScan.verdict === 'duplicate' ? 'bg-warning/20 text-warning animate-scale-in' :
                'bg-destructive/20 text-destructive animate-scale-in'
              }`}>
                {!lastScan ? '✓ Ready to Scan' : lastScan.verdict === 'accepted' ? '✓ ACCEPTED' :
                 lastScan.verdict === 'duplicate' ? '⚠ DUPLICATE' : '✗ INVALID'}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift animate-slide-up" style={{ animationDelay: '100ms' }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <img src={scannerIcon} alt="Scanner" className="w-5 h-5" />
                Scan Result
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!lastScan ? (
                <div className="text-center py-16 text-muted-foreground">
                  <div className="text-7xl mb-6 opacity-20">📱</div>
                  <p className="text-xl font-medium mb-2">Ready to scan...</p>
                  <p className="text-sm">Scan a ticket to see the result</p>
                </div>
              ) : (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex items-center justify-center">
                    <div className={`w-24 h-24 rounded-2xl flex items-center justify-center shadow-lg ${
                      lastScan.verdict === 'accepted' ? 'bg-success/20' :
                      lastScan.verdict === 'duplicate' ? 'bg-warning/20' : 'bg-destructive/20'
                    }`}>
                      {lastScan.verdict === 'accepted' ? <img src={checkmarkIcon} alt="Success" className="w-14 h-14" /> :
                       lastScan.verdict === 'duplicate' ? <img src={errorIcon} alt="Warning" className="w-14 h-14" /> :
                       <img src={errorIcon} alt="Error" className="w-14 h-14" />}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-3 border-b border-border">
                      <span className="text-muted-foreground font-medium">Status:</span>
                      <span className={`font-bold text-lg ${
                        lastScan.verdict === 'accepted' ? 'text-success' :
                        lastScan.verdict === 'duplicate' ? 'text-warning' : 'text-destructive'
                      }`}>
                        {lastScan.verdict.toUpperCase()}
                      </span>
                    </div>
                    {lastScan.qr_data && (
                      <div className="flex justify-between items-center py-3 border-b border-border">
                        <span className="text-muted-foreground font-medium">QR Code:</span>
                        <span className="font-mono font-bold text-lg text-foreground uppercase">{lastScan.qr_data}</span>
                      </div>
                    )}
                    {lastScan.ticket_number && (
                      <div className="flex justify-between items-center py-3 border-b border-border">
                        <span className="text-muted-foreground font-medium">Ticket #:</span>
                        <span className="font-mono font-bold text-xl text-foreground">{lastScan.ticket_number}</span>
                      </div>
                    )}
                    {lastScan.ticket_code && (
                      <div className="flex justify-between items-center py-3 border-b border-border">
                        <span className="text-muted-foreground font-medium">Ticket Code:</span>
                        <span className="font-mono font-semibold text-foreground">{lastScan.ticket_code}</span>
                      </div>
                    )}
                    {lastScan.buyer_name && (
                      <div className="flex justify-between items-center py-3 border-b border-border">
                        <span className="text-muted-foreground font-medium">Buyer:</span>
                        <span className="font-semibold text-foreground">{lastScan.buyer_name}</span>
                      </div>
                    )}
                    {lastScan.sale_type && (
                      <div className="flex justify-between items-center py-3 border-b border-border">
                        <span className="text-muted-foreground font-medium">Sale Type:</span>
                        <span className="font-semibold text-foreground capitalize">{lastScan.sale_type}</span>
                      </div>
                    )}
                    {lastScan.event_name && (
                      <div className="flex justify-between items-center py-3 border-b border-border">
                        <span className="text-muted-foreground font-medium">Event:</span>
                        <span className="text-foreground">{lastScan.event_name}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center py-3 border-b border-border">
                      <span className="text-muted-foreground font-medium">Time:</span>
                      <span className="text-foreground">{new Date(lastScan.scanned_at || Date.now()).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex justify-between items-center py-3">
                      <span className="text-muted-foreground font-medium">Message:</span>
                      <span className="text-foreground font-medium">{lastScan.message}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Scanner;