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
import { ArrowLeft, AlertCircle } from 'lucide-react';
import logoutIcon from '@/assets/icons/logout.png';
import cashierIcon from '@/assets/icons/cashier.png';
import moneyIcon from '@/assets/icons/money.png';
import ticketIcon from '@/assets/icons/ticket.png';

const Cashier = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, signOut } = useAuth();
  const [ticketNumber, setTicketNumber] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [amount, setAmount] = useState('50.00');
  const [isProcessing, setIsProcessing] = useState(false);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [salesCount, setSalesCount] = useState(0);
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
      setEvents(data);
      if (!selectedEventId) {
        setSelectedEventId(data[0].id);
      }
    }
  }, [toast, selectedEventId]);

  const loadRecentSales = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from('sales')
      .select(`
        id,
        amount,
        sale_timestamp,
        ticket_id,
        tickets (
          ticket_number,
          ticket_code,
          buyer_name
        )
      `)
      .eq('cashier_id', user.id)
      .order('sale_timestamp', { ascending: false })
      .limit(10);

    setRecentSales(data || []);
    setSalesCount(data?.length || 0);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    loadEvents();
    loadRecentSales();

    const unsubscribe = realtimeSync.subscribe('sales_updated', loadRecentSales);
    return () => unsubscribe();
  }, [user, loadRecentSales, loadEvents]);

  const getAvailableRange = (event: any) => {
    // If no bulk range, entire event range available
    if (!event.bulk_sold_range_start || !event.bulk_sold_range_end) {
      return { start: event.range_start, end: event.range_end };
    }

    const bulkStart = event.bulk_sold_range_start;
    const bulkEnd = event.bulk_sold_range_end;
    const eventStart = event.range_start;
    const eventEnd = event.range_end;

    // If bulk range covers entire event range
    if (bulkStart <= eventStart && bulkEnd >= eventEnd) {
      return null; // Nothing available
    }

    // Calculate available ranges
    const beforeBulk = bulkStart > eventStart ? { start: eventStart, end: bulkStart - 1 } : null;
    const afterBulk = bulkEnd < eventEnd ? { start: bulkEnd + 1, end: eventEnd } : null;

    // Return the largest available range
    if (beforeBulk && afterBulk) {
      const beforeSize = beforeBulk.end - beforeBulk.start + 1;
      const afterSize = afterBulk.end - afterBulk.start + 1;
      return afterSize >= beforeSize ? afterBulk : beforeBulk;
    }

    return beforeBulk || afterBulk || null;
  };

  const isTicketInBulkRange = (ticketNum: number, event: any): boolean => {
    if (!event.bulk_sold_range_start || !event.bulk_sold_range_end) {
      return false;
    }
    return ticketNum >= event.bulk_sold_range_start && ticketNum <= event.bulk_sold_range_end;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!ticketNumber.trim() || !buyerName.trim() || !selectedEventId) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      const ticketNum = parseInt(ticketNumber);
      
      if (isNaN(ticketNum)) {
        throw new Error('Invalid ticket number');
      }

      const selectedEvent = events.find(e => e.id === selectedEventId);
      if (!selectedEvent) {
        throw new Error('Selected event not found');
      }

      // Validate ticket is in event range
      if (ticketNum < selectedEvent.range_start || ticketNum > selectedEvent.range_end) {
        throw new Error(`Ticket must be between ${selectedEvent.range_start} and ${selectedEvent.range_end}`);
      }

      // Check if ticket is in bulk sold range
      if (isTicketInBulkRange(ticketNum, selectedEvent)) {
        throw new Error(
          `Ticket ${ticketNum} is in bulk sold range (${selectedEvent.bulk_sold_range_start}-${selectedEvent.bulk_sold_range_end}) and cannot be sold individually`
        );
      }

      // Check available range
      const availableRange = getAvailableRange(selectedEvent);
      if (!availableRange) {
        throw new Error('No tickets available - event fully sold in bulk');
      }

      if (ticketNum < availableRange.start || ticketNum > availableRange.end) {
        throw new Error(`Ticket must be in available range: ${availableRange.start}-${availableRange.end}`);
      }

      // Check if ticket already exists
      const { data: existingTicket, error: fetchError } = await supabase
        .from('tickets')
        .select('*')
        .eq('ticket_number', ticketNum)
        .eq('event_id', selectedEventId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingTicket) {
        // Ticket exists - check status
        if (existingTicket.status === 'sold') {
          throw new Error('Ticket already sold');
        }
        if (existingTicket.status === 'used') {
          throw new Error('Ticket already used');
        }
        if (existingTicket.sale_type === 'bulk') {
          throw new Error('This is a bulk ticket and cannot be sold individually');
        }

        // Update existing available ticket to sold
        const { error: updateError } = await supabase
          .from('tickets')
          .update({
            status: 'sold',
            buyer_name: buyerName.trim(),
            buyer_email: buyerEmail.trim() || null,
            buyer_phone: buyerPhone.trim() || null,
            sold_at: new Date().toISOString(),
            sold_by: user?.id
          })
          .eq('id', existingTicket.id)
          .eq('status', 'available'); // Optimistic lock

        if (updateError) throw updateError;

        // Create sale record
        const { error: saleError } = await supabase
          .from('sales')
          .insert({
            ticket_id: existingTicket.id,
            cashier_id: user?.id,
            amount: parseFloat(amount)
          });

        if (saleError) {
          // Rollback
          await supabase
            .from('tickets')
            .update({ 
              status: 'available',
              buyer_name: null,
              buyer_email: null,
              buyer_phone: null,
              sold_at: null,
              sold_by: null
            })
            .eq('id', existingTicket.id);
          throw saleError;
        }
      } else {
        // Create new ticket for cashier sale
        const ticketCode = `T${ticketNum.toString().padStart(4, '0')}`;
        const qrData = `EVENT_${selectedEventId.substring(0, 8)}_TICKET_${ticketNum}`;

        const { data: newTicket, error: createError } = await supabase
          .from('tickets')
          .insert({
            ticket_number: ticketNum,
            ticket_code: ticketCode,
            qr_data: qrData,
            event_id: selectedEventId,
            status: 'sold',
            sale_type: 'cashier',
            buyer_name: buyerName.trim(),
            buyer_email: buyerEmail.trim() || null,
            buyer_phone: buyerPhone.trim() || null,
            sold_at: new Date().toISOString(),
            sold_by: user?.id
          })
          .select()
          .single();

        if (createError) throw createError;

        // Create sale record
        const { error: saleError } = await supabase
          .from('sales')
          .insert({
            ticket_id: newTicket.id,
            cashier_id: user?.id,
            amount: parseFloat(amount)
          });

        if (saleError) {
          // Delete ticket if sale fails
          await supabase.from('tickets').delete().eq('id', newTicket.id);
          throw saleError;
        }
      }

      toast({
        title: 'Sale Complete',
        description: `Ticket ${ticketNum} sold to ${buyerName}`,
      });

      // Clear form
      setTicketNumber('');
      setBuyerName('');
      setBuyerEmail('');
      setBuyerPhone('');
      setAmount('50.00');

    } catch (error: any) {
      console.error('Sale error:', error);
      toast({
        title: 'Sale Failed',
        description: error.message || 'Failed to process sale',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = () => {
    signOut();
    navigate('/login');
  };

  if (!user) return null;

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const availableRange = selectedEvent ? getAvailableRange(selectedEvent) : null;

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-success/10 rounded-xl flex items-center justify-center">
                <img src={cashierIcon} alt="Cashier" className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xl font-bold">Cashier</span>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  {profile?.name || user.email?.split('@')[0]}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm hidden sm:flex items-center gap-2 px-3 py-1.5 bg-success/10 rounded-lg">
                <img src={moneyIcon} alt="Sales" className="w-4 h-4" />
                <span className="text-muted-foreground">Sales: </span>
                <span className="font-semibold">{salesCount}</span>
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
                <img src={ticketIcon} alt="Ticket" className="w-5 h-5" />
                Sell Ticket
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
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

                {selectedEvent && availableRange && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm font-medium text-blue-900">
                      Available Range: {availableRange.start} - {availableRange.end}
                    </p>
                    {selectedEvent.bulk_sold_range_start && (
                      <p className="text-xs text-blue-700 mt-1">
                        Bulk sold: {selectedEvent.bulk_sold_range_start}-{selectedEvent.bulk_sold_range_end}
                      </p>
                    )}
                  </div>
                )}

                {selectedEvent && !availableRange && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-900">No Tickets Available</p>
                      <p className="text-xs text-red-700">Event fully sold in bulk</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="ticketNumber">Ticket Number *</Label>
                  <Input
                    id="ticketNumber"
                    type="number"
                    placeholder="Enter ticket number"
                    value={ticketNumber}
                    onChange={(e) => setTicketNumber(e.target.value)}
                    required
                    disabled={!availableRange}
                    className="text-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="buyerName">Buyer Name *</Label>
                  <Input
                    id="buyerName"
                    placeholder="Full name"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    required
                    disabled={!availableRange}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="buyerEmail">Email</Label>
                    <Input
                      id="buyerEmail"
                      type="email"
                      placeholder="buyer@example.com"
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      disabled={!availableRange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buyerPhone">Phone</Label>
                    <Input
                      id="buyerPhone"
                      type="tel"
                      placeholder="+1234567890"
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      disabled={!availableRange}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Amount ($) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    disabled={!availableRange}
                    className="text-lg font-semibold"
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg" 
                  disabled={isProcessing || !availableRange}
                >
                  <img src={moneyIcon} alt="Money" className="w-5 h-5 mr-2" />
                  {isProcessing ? 'Processing...' : 'Complete Sale'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="hover-lift">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <img src={moneyIcon} alt="Money" className="w-5 h-5" />
                Recent Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentSales.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <img src={ticketIcon} alt="Tickets" className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-1">No sales yet</p>
                  <p className="text-sm">Your sales will appear here</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {recentSales.map((sale: any) => (
                    <div key={sale.id} className="flex items-center justify-between p-4 bg-muted/50 hover:bg-muted rounded-xl transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-success/10 rounded-xl flex items-center justify-center">
                          <img src={ticketIcon} alt="Ticket" className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-semibold">
                            {sale.tickets?.ticket_code || `#${sale.tickets?.ticket_number}`}
                          </p>
                          <p className="text-sm text-muted-foreground">{sale.tickets?.buyer_name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-success">
                          ${parseFloat(sale.amount).toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(sale.sale_timestamp).toLocaleTimeString()}
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

export default Cashier;