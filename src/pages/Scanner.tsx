/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCache, removeCache, setCache } from '@/lib/cache';
import useLocalStorage from '@/hooks/use-local-storage';
import { optimizedSelect } from '@/lib/supabaseOptimized';
import { throttle } from '@/lib/networkOptimizer';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, Scan } from 'lucide-react';
import logoutIcon from '@/assets/icons/logout.png';
import scannerIcon from '@/assets/icons/scanner.png';
import ticketIcon from '@/assets/icons/ticket.png';
import { realtimeSync } from '@/lib/syncService';

const Scanner = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, signOut } = useAuth();
  const [ticketNumber, setTicketNumber] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [scanCount, setScanCount] = useState(0);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useLocalStorage<string>('scanner:selectedEventId', '');
  const [lastScanResult, setLastScanResult] = useState<{
    success: boolean;
    message: string;
    ticket?: any;
  } | null>(null);

  const loadEvents = useCallback(async () => {
    const cached = getCache<any[]>('events_all');
    if (cached && cached.length > 0) {
      setEvents(cached);
      if (!selectedEventId) setSelectedEventId(cached[0].id);
    }

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false });

    if (error) {
      console.error('Error loading events:', error);
      if (!cached) {
        toast({
          title: 'Error',
          description: 'Failed to load events',
          variant: 'destructive',
        });
      }
      return;
    }

    if (data && data.length > 0) {
      setEvents(data);
      await setCache('events_all', data, 1000 * 60 * 5);
      if (!selectedEventId) setSelectedEventId(data[0].id);
    }
  }, [toast, selectedEventId, setSelectedEventId]);

  const loadRecentScans = useCallback(async () => {
    if (!user) return;

    try {
      const data = await optimizedSelect('tickets', {
        select: `
          id,
          ticket_number,
          ticket_code,
          status,
          buyer_name,
          scanned_at,
          scanned_by
        `,
        filters: { scanned_by: user.id },
        deduplicate: true,
      });

      const scanned = data?.filter(t => t.status === 'used') || [];
      
      setRecentScans(
        scanned
          .sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime())
          .slice(0, 10)
      );
      setScanCount(scanned.length);
    } catch (error) {
      console.error('Error loading recent scans:', error);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    loadEvents();
    loadRecentScans();

    const throttledRefresh = throttle(() => loadRecentScans(), 1500);

    const unsubscribe = realtimeSync.subscribe('tickets_updated', throttledRefresh);
    return () => unsubscribe();
  }, [user, loadRecentScans, loadEvents]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();

    if ((!ticketNumber.trim() && !qrCode.trim()) || !selectedEventId) {
      toast({
        title: 'Error',
        description: 'Please enter ticket number or QR code and select an event',
        variant: 'destructive',
      });
      return;
    }

    setIsScanning(true);
    setLastScanResult(null);

    try {
      const selectedEvent = events.find(e => e.id === selectedEventId);
      if (!selectedEvent) {
        throw new Error('Selected event not found');
      }

      // Check if event has tickets uploaded
      if (selectedEvent.range_start === 0 && selectedEvent.range_end === 0) {
        throw new Error('Event is awaiting CSV upload. No tickets available yet.');
      }

      let ticket = null;

      // Try to find ticket by QR code first, then by ticket number
      if (qrCode.trim()) {
        const { data, error } = await supabase
          .from('tickets')
          .select('*')
          .eq('qr_data', qrCode.trim())
          .eq('event_id', selectedEventId)
          .maybeSingle();

        if (error) {
          console.error('QR lookup error:', error);
          throw new Error(`Failed to lookup ticket: ${error.message}`);
        }

        ticket = data;
      } else if (ticketNumber.trim()) {
        const ticketNum = parseInt(ticketNumber);
        
        if (isNaN(ticketNum)) {
          throw new Error('Invalid ticket number');
        }

        const { data, error } = await supabase
          .from('tickets')
          .select('*')
          .eq('ticket_number', ticketNum)
          .eq('event_id', selectedEventId)
          .maybeSingle();

        if (error) {
          console.error('Ticket lookup error:', error);
          throw new Error(`Failed to lookup ticket: ${error.message}`);
        }

        ticket = data;
      }

      // Validate ticket exists
      if (!ticket) {
        const identifier = qrCode.trim() || ticketNumber.trim();
        setLastScanResult({
          success: false,
          message: `Ticket not found: ${identifier}`,
        });
        toast({
          title: 'Ticket Not Found',
          description: `No ticket found with ${qrCode.trim() ? 'QR code' : 'number'}: ${identifier}`,
          variant: 'destructive',
        });
        return;
      }

      // Validate ticket status
      if (ticket.status === 'available') {
        setLastScanResult({
          success: false,
          message: `Ticket ${ticket.ticket_number} has not been sold yet`,
          ticket,
        });
        toast({
          title: 'Ticket Not Sold',
          description: `Ticket ${ticket.ticket_code || ticket.ticket_number} is still available. It must be sold before scanning.`,
          variant: 'destructive',
        });
        return;
      }

      if (ticket.status === 'used') {
        const scannedDate = new Date(ticket.scanned_at).toLocaleString();
        setLastScanResult({
          success: false,
          message: `Ticket ${ticket.ticket_number} already used on ${scannedDate}`,
          ticket,
        });
        toast({
          title: 'Already Scanned',
          description: `This ticket was already scanned on ${scannedDate}`,
          variant: 'destructive',
        });
        return;
      }

      // Ticket is sold and not used - mark as used
      if (ticket.status === 'sold') {
        const { error: updateError } = await supabase
          .from('tickets')
          .update({
            status: 'used' as const,
            scanned_at: new Date().toISOString(),
            scanned_by: user?.id
          })
          .eq('id', ticket.id)
          .eq('status', 'sold'); // Only update if still sold

        if (updateError) {
          console.error('Update error:', updateError);
          throw new Error(`Failed to mark ticket as used: ${updateError.message}`);
        }

        // Invalidate cache
        try {
          removeCache('events_all');
          removeCache('dashboard:stats');
        } catch (err) {
          console.debug('cache invalidate failed', err);
        }

        setLastScanResult({
          success: true,
          message: `Ticket ${ticket.ticket_number} scanned successfully`,
          ticket: { ...ticket, status: 'used' },
        });

        toast({
          title: 'Scan Successful',
          description: `Ticket ${ticket.ticket_code || ticket.ticket_number} - ${ticket.buyer_name || 'Unknown buyer'}`,
        });

        // Clear form
        setTicketNumber('');
        setQrCode('');

        // Refresh scans list
        await loadRecentScans();

        return;
      }

      // Unexpected status
      throw new Error(`Unexpected ticket status: ${ticket.status}`);

    } catch (error: any) {
      console.error('Scan error:', error);
      setLastScanResult({
        success: false,
        message: error.message || 'Failed to scan ticket',
      });
      toast({
        title: 'Scan Failed',
        description: error.message || 'Failed to scan ticket',
        variant: 'destructive',
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleLogout = () => {
    signOut();
    navigate('/login');
  };

  if (!user) return null;

  const selectedEvent = events.find(e => e.id === selectedEventId);

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-warning/10 rounded-xl flex items-center justify-center">
                <img src={scannerIcon} alt="Scanner" className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xl font-bold">Scanner</span>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  {profile?.name || user.email?.split('@')[0]}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm hidden sm:flex items-center gap-2 px-3 py-1.5 bg-warning/10 rounded-lg">
                <img src={scannerIcon} alt="Scans" className="w-4 h-4" />
                <span className="text-muted-foreground">Scans: </span>
                <span className="font-semibold">{scanCount}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
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
          <Card className="hover-lift">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scan className="w-5 h-5" />
                Scan Ticket
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleScan} className="space-y-4">
                <div className="space-y-2">
                  <Label>Select Event *</Label>
                  <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose event..." />
                    </SelectTrigger>
                    <SelectContent>
                      {events.map(event => (
                        <SelectItem key={event.id} value={event.id}>
                          {event.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedEvent && selectedEvent.range_start === 0 && selectedEvent.range_end === 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-900">Event Awaiting Upload</p>
                      <p className="text-xs text-yellow-700">Please upload CSV tickets first</p>
                    </div>
                  </div>
                )}

                {selectedEvent && selectedEvent.range_start > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm font-medium text-blue-900">
                      Event Range: {selectedEvent.range_start} - {selectedEvent.range_end}
                    </p>
                    {selectedEvent.bulk_sold_range_start && (
                      <p className="text-xs text-blue-700 mt-1">
                        Bulk: {selectedEvent.bulk_sold_range_start}-{selectedEvent.bulk_sold_range_end}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="qrCode">QR Code</Label>
                  <Input
                    id="qrCode"
                    placeholder="Scan or enter QR code"
                    value={qrCode}
                    onChange={(e) => {
                      setQrCode(e.target.value);
                      setLastScanResult(null);
                    }}
                    disabled={selectedEvent?.range_start === 0}
                    className="text-lg font-mono"
                  />
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 border-t"></div>
                  <span className="text-sm text-muted-foreground">OR</span>
                  <div className="flex-1 border-t"></div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ticketNumber">Ticket Number</Label>
                  <Input
                    id="ticketNumber"
                    type="number"
                    placeholder="Enter ticket number"
                    value={ticketNumber}
                    onChange={(e) => {
                      setTicketNumber(e.target.value);
                      setLastScanResult(null);
                    }}
                    disabled={selectedEvent?.range_start === 0}
                    className="text-lg"
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg" 
                  disabled={isScanning || selectedEvent?.range_start === 0}
                >
                  <Scan className="w-5 h-5 mr-2" />
                  {isScanning ? 'Scanning...' : 'Scan Ticket'}
                </Button>
              </form>

              {lastScanResult && (
                <div className={`mt-4 p-4 rounded-lg border-2 ${
                  lastScanResult.success 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-start gap-3">
                    {lastScanResult.success ? (
                      <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className={`font-semibold ${
                        lastScanResult.success ? 'text-green-900' : 'text-red-900'
                      }`}>
                        {lastScanResult.success ? 'Success!' : 'Scan Failed'}
                      </p>
                      <p className={`text-sm mt-1 ${
                        lastScanResult.success ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {lastScanResult.message}
                      </p>
                      {lastScanResult.ticket && (
                        <div className="mt-2 text-xs space-y-1">
                          <p><strong>Ticket:</strong> {lastScanResult.ticket.ticket_code || lastScanResult.ticket.ticket_number}</p>
                          {lastScanResult.ticket.buyer_name && (
                            <p><strong>Buyer:</strong> {lastScanResult.ticket.buyer_name}</p>
                          )}
                          <p><strong>Status:</strong> {lastScanResult.ticket.status}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="hover-lift">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <img src={scannerIcon} alt="Scanner" className="w-5 h-5" />
                Recent Scans
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentScans.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <img src={ticketIcon} alt="Tickets" className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-1">No scans yet</p>
                  <p className="text-sm">Your scans will appear here</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {recentScans.map((ticket: any) => (
                    <div key={ticket.id} className="flex items-center justify-between p-4 bg-muted/50 hover:bg-muted rounded-xl transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-warning/10 rounded-xl flex items-center justify-center">
                          <CheckCircle className="w-6 h-6 text-success" />
                        </div>
                        <div>
                          <p className="font-semibold">
                            {ticket.ticket_code || `#${ticket.ticket_number}`}
                          </p>
                          <p className="text-sm text-muted-foreground">{ticket.buyer_name || 'Unknown'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-success">Used</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(ticket.scanned_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
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