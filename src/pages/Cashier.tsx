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
import { getCache, removeCache, setCache } from '@/lib/cache';
import useLocalStorage from '@/hooks/use-local-storage';
import { optimizedSelect } from '@/lib/supabaseOptimized';
import { throttle } from '@/lib/networkOptimizer';
import { ArrowLeft, AlertCircle, CreditCard, Banknote, Smartphone } from 'lucide-react';
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
  const [paymentMode, setPaymentMode] = useState<'cash' | 'card' | 'mobile'>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [salesCount, setSalesCount] = useState(0);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useLocalStorage<string>('cashier:selectedEventId', '');

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

  const loadRecentSales = useCallback(async () => {
    if (!user) return;

    try {
      let data: any[] | null = null;

      // If an event is selected, load recent sales for that event so cashiers see admin sales too
      if (selectedEventId) {
        const { data: eventSales, error } = await supabase
          .from('sales')
          .select(`
            id,
            amount,
            sale_timestamp,
            ticket_id,
            payment_mode,
            cashier_id,
            tickets (
              ticket_number,
              ticket_code,
              buyer_name,
              event_id
            )
          `)
          .eq('tickets.event_id', selectedEventId)
          .order('sale_timestamp', { ascending: false })
          .limit(50);

        if (error) {
          console.error('Error loading event sales:', error);
        } else {
          data = eventSales as any[] | null;
        }
      } else {
        // Fallback: load only current cashier's sales
        data = await optimizedSelect('sales', {
          select: `
            id,
            amount,
            sale_timestamp,
            ticket_id,
            payment_mode,
            tickets (
              ticket_number,
              ticket_code,
              buyer_name
            )
          `,
          filters: { cashier_id: user.id },
          deduplicate: true,
        });
      }

      setRecentSales(
        data
          ? data
              .sort((a, b) => new Date(b.sale_timestamp).getTime() - new Date(a.sale_timestamp).getTime())
              .slice(0, 10)
          : []
      );
      setSalesCount(data?.length || 0);
    } catch (error) {
      console.error('Error loading recent sales:', error);
    }
  }, [user, selectedEventId]);

  useEffect(() => {
    if (!user) return;

    loadEvents();
    loadRecentSales();

    const throttledRefresh = throttle(() => loadRecentSales(), 1500);

    const unsubscribe = realtimeSync.subscribe('sales_updated', throttledRefresh);
    return () => unsubscribe();
  }, [user, loadRecentSales, loadEvents]);

  const getAvailableRange = (event: any) => {
    // If event range not set yet (awaiting CSV)
    if (event.range_start === 0 && event.range_end === 0) {
      return null;
    }

    // If no bulk range, entire event range available
    if (!event.bulk_sold_range_start || !event.bulk_sold_range_end) {
      return { start: event.range_start, end: event.range_end };
    }

    // Collect all available ranges (before bulk, after bulk)
    const availableRanges = [];
    const bulkStart = event.bulk_sold_range_start;
    const bulkEnd = event.bulk_sold_range_end;
    const eventStart = event.range_start;
    const eventEnd = event.range_end;

    // Before bulk range
    if (eventStart < bulkStart) {
      availableRanges.push({ start: eventStart, end: bulkStart - 1 });
    }

    // After bulk range
    if (bulkEnd < eventEnd) {
      availableRanges.push({ start: bulkEnd + 1, end: eventEnd });
    }

    // If no available ranges
    if (availableRanges.length === 0) {
      return null;
    }

    // Return the first available range
    return availableRanges[0];
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

      // Check if event has CSV uploaded
      if (selectedEvent.range_start === 0 && selectedEvent.range_end === 0) {
        throw new Error('Event is awaiting CSV upload. Please upload tickets first.');
      }

      // Validate ticket is in event range
      if (ticketNum < selectedEvent.range_start || ticketNum > selectedEvent.range_end) {
        throw new Error(`Ticket must be between ${selectedEvent.range_start} and ${selectedEvent.range_end}`);
      }

      // Check if ticket is in bulk range (not allowed to sell)
      if (selectedEvent.bulk_sold_range_start && selectedEvent.bulk_sold_range_end) {
        if (ticketNum >= selectedEvent.bulk_sold_range_start && ticketNum <= selectedEvent.bulk_sold_range_end) {
          throw new Error(
            `Ticket ${ticketNum} is in bulk sold range (${selectedEvent.bulk_sold_range_start}-${selectedEvent.bulk_sold_range_end}) and cannot be sold individually`
          );
        }
      }

      // Check if ticket already exists
      const { data: existingTicket, error: fetchError } = await supabase
        .from('tickets')
        .select('*')
        .eq('ticket_number', ticketNum)
        .eq('event_id', selectedEventId)
        .maybeSingle();

      if (fetchError) {
        console.error('Fetch error:', fetchError);
        throw new Error(`Failed to check ticket: ${fetchError.message}`);
      }

      let ticketId: string;

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

        // Update available ticket to sold
        const { error: updateError } = await supabase
          .from('tickets')
          .update({
            status: 'sold' as const,
            buyer_name: buyerName.trim(),
            buyer_email: buyerEmail.trim() || null,
            buyer_phone: buyerPhone.trim() || null,
            sold_at: new Date().toISOString(),
            sold_by: user?.id
          })
          .eq('id', existingTicket.id)
          .eq('status', 'available');

        if (updateError) {
          console.error('Update error:', updateError);
          throw new Error(`Failed to update ticket: ${updateError.message}`);
        }

        ticketId = existingTicket.id;

      } else {
        // Ticket doesn't exist - create new ticket and mark as sold
        const ticketCode = `T${ticketNum.toString().padStart(4, '0')}`;
        const qrData = `EVENT_${selectedEventId.substring(0, 8)}_TICKET_${ticketNum}`;

        const { data: newTicket, error: createError } = await supabase
          .from('tickets')
          .insert({
            ticket_number: ticketNum,
            ticket_code: ticketCode,
            qr_data: qrData,
            event_id: selectedEventId,
            status: 'sold' as const,
            sale_type: 'cashier' as const,
            buyer_name: buyerName.trim(),
            buyer_email: buyerEmail.trim() || null,
            buyer_phone: buyerPhone.trim() || null,
            sold_at: new Date().toISOString(),
            sold_by: user?.id
          })
          .select()
          .single();

        if (createError) {
          console.error('Create error:', createError);
          throw new Error(`Failed to create ticket: ${createError.message}`);
        }

        if (!newTicket) {
          throw new Error('Failed to create ticket: No data returned');
        }

        ticketId = newTicket.id;
      }

      // Create sale record
      const { error: saleError } = await supabase
        .from('sales')
        .insert({
          ticket_id: ticketId,
          cashier_id: user?.id,
          amount: parseFloat(amount),
          payment_mode: paymentMode
        });

      if (saleError) {
        console.error('Sale error:', saleError);
        // Rollback ticket status
        await supabase
          .from('tickets')
          .update({
            status: existingTicket ? 'available' as const : 'sold' as const,
            buyer_name: existingTicket ? null : buyerName.trim(),
            buyer_email: existingTicket ? null : (buyerEmail.trim() || null),
            buyer_phone: existingTicket ? null : (buyerPhone.trim() || null),
            sold_at: existingTicket ? null : new Date().toISOString(),
            sold_by: existingTicket ? null : user?.id
          })
          .eq('id', ticketId);
        
        if (!existingTicket) {
          // If we created a new ticket, delete it
          await supabase.from('tickets').delete().eq('id', ticketId);
        }
        
        throw new Error(`Failed to create sale record: ${saleError.message}`);
      }

      // Invalidate cache
      try {
        removeCache('events_all');
        removeCache('dashboard:stats');
      } catch (err) {
        console.debug('cache invalidate failed', err);
      }

      toast({
        title: 'Sale Complete',
        description: `Ticket ${ticketNum} sold to ${buyerName} via ${paymentMode}`,
      });

      // Clear form
      setTicketNumber('');
      setBuyerName('');
      setBuyerEmail('');
      setBuyerPhone('');
      setAmount('50.00');
      setPaymentMode('cash');

      // Refresh sales list
      await loadRecentSales();

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

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const getPaymentIcon = (mode: string) => {
    switch (mode) {
      case 'card':
        return <CreditCard className="w-4 h-4" />;
      case 'mobile':
        return <Smartphone className="w-4 h-4" />;
      default:
        return <Banknote className="w-4 h-4" />;
    }
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

                {selectedEvent && selectedEvent.range_start === 0 && selectedEvent.range_end === 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-900">Event Awaiting Upload</p>
                      <p className="text-xs text-yellow-700">Please upload CSV tickets first</p>
                    </div>
                  </div>
                )}

                {selectedEvent && availableRange && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-medium text-green-900">
                      Available Range: {availableRange.start} - {availableRange.end}
                    </p>
                    {selectedEvent.bulk_sold_range_start && (
                      <p className="text-xs text-green-700 mt-1">
                        Bulk sold: {selectedEvent.bulk_sold_range_start}-{selectedEvent.bulk_sold_range_end}
                      </p>
                    )}
                  </div>
                )}

                {selectedEvent && selectedEvent.range_start > 0 && !availableRange && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-900">No Tickets Available</p>
                      <p className="text-xs text-red-700">All tickets in bulk sold range</p>
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

                <div className="space-y-2">
                  <Label>Payment Mode *</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMode('cash')}
                      disabled={!availableRange}
                      className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                        paymentMode === 'cash'
                          ? 'border-success bg-success/10 text-success'
                          : 'border-border hover:border-success/50'
                      } ${!availableRange ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <Banknote className="w-6 h-6 mb-2" />
                      <span className="text-sm font-medium">Cash</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setPaymentMode('card')}
                      disabled={!availableRange}
                      className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                        paymentMode === 'card'
                          ? 'border-blue-600 bg-blue-50 text-blue-600'
                          : 'border-border hover:border-blue-600/50'
                      } ${!availableRange ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <CreditCard className="w-6 h-6 mb-2" />
                      <span className="text-sm font-medium">Card</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setPaymentMode('mobile')}
                      disabled={!availableRange}
                      className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
                        paymentMode === 'mobile'
                          ? 'border-purple-600 bg-purple-50 text-purple-600'
                          : 'border-border hover:border-purple-600/50'
                      } ${!availableRange ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <Smartphone className="w-6 h-6 mb-2" />
                      <span className="text-sm font-medium">Mobile</span>
                    </button>
                  </div>
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
                          <div className="flex items-center gap-1 mt-1">
                            {getPaymentIcon(sale.payment_mode)}
                            <span className="text-xs text-muted-foreground capitalize">{sale.payment_mode}</span>
                          </div>
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