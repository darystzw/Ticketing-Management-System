/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FileText, ArrowLeft, Plus, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import uploadIcon from '@/assets/icons/upload.png';

interface TicketRow {
  ticketNumber: number;
  ticketCode: string;
  qrData: string;
}

const Upload = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<{ 
    success: number; 
    failed: number; 
    cashier: number;
    bulk: number;
    errors: string[] 
  } | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [progress, setProgress] = useState(0);
  const [bulkBuyerName, setBulkBuyerName] = useState('');
  const [bulkBuyerEmail, setBulkBuyerEmail] = useState('');
  const [bulkBuyerPhone, setBulkBuyerPhone] = useState('');

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
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
  };

  const handleCreateEvent = async () => {
    if (!newEventName.trim() || !newEventDate || !rangeStart || !rangeEnd) {
      toast({
        title: 'Error',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }

    const start = parseInt(rangeStart);
    const end = parseInt(rangeEnd);

    if (isNaN(start) || isNaN(end) || start > end || start < 1) {
      toast({
        title: 'Invalid Range',
        description: 'Please enter a valid ticket number range (start must be >= 1, end must be >= start)',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: newEvent, error } = await supabase
        .from('events')
        .insert({
          name: newEventName.trim(),
          event_date: newEventDate,
          range_start: start,
          range_end: end,
          created_by: user?.id
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Event Created',
        description: `Event "${newEventName}" created successfully`,
      });

      setNewEventName('');
      setNewEventDate('');
      setRangeStart('');
      setRangeEnd('');
      setShowCreateEvent(false);

      await loadEvents();
      if (newEvent) {
        setSelectedEventId(newEvent.id);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create event',
        variant: 'destructive',
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadResults(null);
      setProgress(0);
    }
  };

  const parseCSV = (text: string): TicketRow[] => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const tickets: TicketRow[] = [];
    const startIndex = lines[0].toLowerCase().includes('ticket') ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));

      if (parts.length >= 2) {
        const ticketCode = parts[0];
        const qrData = parts[1];
        const numericMatch = ticketCode.match(/\d+/);

        if (numericMatch) {
          const ticketNumber = parseInt(numericMatch[0]);
          if (!isNaN(ticketNumber) && ticketNumber > 0) {
            tickets.push({ ticketCode, ticketNumber, qrData });
          }
        }
      }
    }

    return tickets;
  };

  const getAvailableRange = (event: any) => {
    if (!event.bulk_sold_range_start || !event.bulk_sold_range_end) {
      return { start: event.range_start, end: event.range_end };
    }

    const bulkStart = event.bulk_sold_range_start;
    const bulkEnd = event.bulk_sold_range_end;
    const eventStart = event.range_start;
    const eventEnd = event.range_end;

    if (bulkStart <= eventStart && bulkEnd >= eventEnd) {
      return null;
    }

    const beforeBulk = bulkStart > eventStart ? { start: eventStart, end: bulkStart - 1 } : null;
    const afterBulk = bulkEnd < eventEnd ? { start: bulkEnd + 1, end: eventEnd } : null;

    if (beforeBulk && afterBulk) {
      const beforeSize = beforeBulk.end - beforeBulk.start + 1;
      const afterSize = afterBulk.end - afterBulk.start + 1;
      return afterSize >= beforeSize ? afterBulk : beforeBulk;
    }

    return beforeBulk || afterBulk || null;
  };

  const handleUpload = async () => {
    if (!file || !selectedEventId) {
      toast({
        title: 'Error',
        description: 'Please select a file and event',
        variant: 'destructive',
      });
      return;
    }

    if (!bulkBuyerName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter buyer name for bulk sale',
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

    setUploading(true);
    setProgress(0);

    try {
      const text = await file.text();
      const tickets = parseCSV(text);

      if (tickets.length === 0) {
        throw new Error('No valid tickets found in file');
      }

      let successCount = 0;
      let failedCount = 0;
      let cashierCount = 0;
      let bulkCount = 0;
      const errors: string[] = [];

      // Separate tickets into bulk range and outside range (cashier)
      const ticketNumbers = tickets.map(t => t.ticketNumber).sort((a, b) => a - b);
      const minTicket = ticketNumbers[0];
      const maxTicket = ticketNumbers[ticketNumbers.length - 1];

      // Determine which tickets are in continuous bulk range
      const bulkTickets: TicketRow[] = [];
      const cashierTickets: TicketRow[] = [];

      // Find the continuous bulk range
      const bulkRangeStart = minTicket;
      let bulkRangeEnd = minTicket;

      for (let i = 0; i < ticketNumbers.length - 1; i++) {
        if (ticketNumbers[i + 1] === ticketNumbers[i] + 1) {
          bulkRangeEnd = ticketNumbers[i + 1];
        } else {
          break; // Found a gap, stop bulk range here
        }
      }

      // Categorize tickets
      for (const ticket of tickets) {
        if (ticket.ticketNumber >= bulkRangeStart && ticket.ticketNumber <= bulkRangeEnd) {
          // Ticket is in continuous bulk range
          if (ticket.ticketNumber >= selectedEvent.range_start && 
              ticket.ticketNumber <= selectedEvent.range_end) {
            bulkTickets.push(ticket);
          } else {
            cashierTickets.push(ticket);
          }
        } else {
          // Ticket is outside continuous range - assign to cashier
          cashierTickets.push(ticket);
        }
      }

      // Process BULK tickets
      if (bulkTickets.length > 0) {
        const bulkMin = Math.min(...bulkTickets.map(t => t.ticketNumber));
        const bulkMax = Math.max(...bulkTickets.map(t => t.ticketNumber));

        // Validate bulk tickets are in event range
        if (bulkMin < selectedEvent.range_start || bulkMax > selectedEvent.range_end) {
          throw new Error(`Bulk range ${bulkMin}-${bulkMax} is outside event range ${selectedEvent.range_start}-${selectedEvent.range_end}`);
        }

        // Check for gaps in bulk range
        const expectedBulkCount = bulkMax - bulkMin + 1;
        if (bulkTickets.length !== expectedBulkCount) {
          throw new Error(`Bulk range ${bulkMin}-${bulkMax} has gaps. All bulk tickets must be continuous.`);
        }

        // Check overlap with existing bulk range
        if (selectedEvent.bulk_sold_range_start && selectedEvent.bulk_sold_range_end) {
          const existingStart = selectedEvent.bulk_sold_range_start;
          const existingEnd = selectedEvent.bulk_sold_range_end;
          const canMerge = (bulkMin <= existingEnd + 1 && bulkMax >= existingStart - 1);

          if (!canMerge) {
            const gap = Math.min(
              Math.abs(bulkMin - existingEnd - 1),
              Math.abs(existingStart - bulkMax - 1)
            );
            throw new Error(`Bulk range ${bulkMin}-${bulkMax} has a gap of ${gap} with existing bulk range ${existingStart}-${existingEnd}`);
          }
        }

        // Check for existing non-bulk tickets
        const { data: existingNonBulk, error: checkError } = await supabase
          .from('tickets')
          .select('ticket_number, sale_type')
          .eq('event_id', selectedEventId)
          .gte('ticket_number', bulkMin)
          .lte('ticket_number', bulkMax)
          .neq('sale_type', 'bulk');

        if (checkError) {
          throw new Error(`Failed to check existing tickets: ${checkError.message}`);
        }

        if (existingNonBulk && existingNonBulk.length > 0) {
          throw new Error(`${existingNonBulk.length} cashier tickets already exist in bulk range ${bulkMin}-${bulkMax}`);
        }

        // Update event bulk range
        const { error: rpcError } = await supabase.rpc('update_event_bulk_range', {
          _event_id: selectedEventId,
          _bulk_range_start: bulkMin,
          _bulk_range_end: bulkMax,
          _buyer_name: bulkBuyerName.trim(),
          _buyer_email: bulkBuyerEmail.trim() || null,
          _buyer_phone: bulkBuyerPhone.trim() || null
        });

        if (rpcError) {
          throw new Error(`Failed to update bulk range: ${rpcError.message}`);
        }

        // Insert bulk tickets
        const batchSize = 100;
        const currentTime = new Date().toISOString();

        for (let i = 0; i < bulkTickets.length; i += batchSize) {
          const batch = bulkTickets.slice(i, i + batchSize);

          const ticketData = batch.map(ticket => ({
            ticket_number: ticket.ticketNumber,
            ticket_code: ticket.ticketCode,
            qr_data: ticket.qrData,
            event_id: selectedEventId,
            status: 'sold' as const,
            sale_type: 'bulk' as const,
            buyer_name: bulkBuyerName.trim(),
            buyer_email: bulkBuyerEmail.trim() || null,
            buyer_phone: bulkBuyerPhone.trim() || null,
            sold_at: currentTime,
            sold_by: user?.id
          }));

          const { data, error } = await supabase
            .from('tickets')
            .upsert(ticketData, {
              onConflict: 'ticket_number,event_id',
              ignoreDuplicates: false
            })
            .select();

          if (error) {
            for (const ticket of batch) {
              try {
                await supabase.from('tickets').upsert({
                  ticket_number: ticket.ticketNumber,
                  ticket_code: ticket.ticketCode,
                  qr_data: ticket.qrData,
                  event_id: selectedEventId,
                  status: 'sold' as const,
                  sale_type: 'bulk' as const,
                  buyer_name: bulkBuyerName.trim(),
                  buyer_email: bulkBuyerEmail.trim() || null,
                  buyer_phone: bulkBuyerPhone.trim() || null,
                  sold_at: currentTime,
                  sold_by: user?.id
                }, {
                  onConflict: 'ticket_number,event_id'
                });
                successCount++;
                bulkCount++;
              } catch (err: any) {
                failedCount++;
                errors.push(`${ticket.ticketCode}: ${err.message}`);
              }
            }
          } else {
            const inserted = data?.length || batch.length;
            successCount += inserted;
            bulkCount += inserted;
          }

          setProgress(Math.min(((i + batchSize) / tickets.length) * 50, 50));
        }
      }

      // Process CASHIER tickets (available for individual sale)
      if (cashierTickets.length > 0) {
        const batchSize = 100;

        for (let i = 0; i < cashierTickets.length; i += batchSize) {
          const batch = cashierTickets.slice(i, i + batchSize);

          const ticketData = batch.map(ticket => ({
            ticket_number: ticket.ticketNumber,
            ticket_code: ticket.ticketCode,
            qr_data: ticket.qrData,
            event_id: selectedEventId,
            status: 'available' as const,
            sale_type: 'cashier' as const
          }));

          const { data, error } = await supabase
            .from('tickets')
            .insert(ticketData)
            .select();

          if (error) {
            for (const ticket of batch) {
              try {
                await supabase.from('tickets').insert({
                  ticket_number: ticket.ticketNumber,
                  ticket_code: ticket.ticketCode,
                  qr_data: ticket.qrData,
                  event_id: selectedEventId,
                  status: 'available' as const,
                  sale_type: 'cashier' as const
                });
                successCount++;
                cashierCount++;
              } catch (err: any) {
                failedCount++;
                errors.push(`${ticket.ticketCode}: ${err.message}`);
              }
            }
          } else {
            const inserted = data?.length || batch.length;
            successCount += inserted;
            cashierCount += inserted;
          }

          setProgress(Math.min(50 + ((i + batchSize) / cashierTickets.length) * 50, 100));
        }
      }

      setUploadResults({ 
        success: successCount, 
        failed: failedCount, 
        cashier: cashierCount,
        bulk: bulkCount,
        errors 
      });
      setProgress(100);

      toast({
        title: 'Upload Complete',
        description: `${bulkCount} bulk tickets, ${cashierCount} cashier tickets uploaded successfully` + 
                     (failedCount > 0 ? `, ${failedCount} failed` : ''),
      });

      setFile(null);
      setBulkBuyerName('');
      setBulkBuyerEmail('');
      setBulkBuyerPhone('');

      await loadEvents();

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload tickets',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 2000);
    }
  };

  const renderEventStatus = (event: any) => {
    const availableRange = getAvailableRange(event);

    if (!availableRange) {
      return (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <XCircle className="w-4 h-4" />
          <span>Fully sold: {event.bulk_sold_range_start}-{event.bulk_sold_range_end} (bulk)</span>
        </div>
      );
    }

    if (event.bulk_sold_range_start && event.bulk_sold_range_end) {
      return (
        <div className="flex items-center gap-2 text-warning text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>Bulk: {event.bulk_sold_range_start}-{event.bulk_sold_range_end} | Available: {availableRange.start}-{availableRange.end}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 text-success text-sm">
        <CheckCircle className="w-4 h-4" />
        <span>All available: {event.range_start}-{event.range_end}</span>
      </div>
    );
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-card border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center">
                <img src={uploadIcon} alt="Upload" className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xl font-bold">Upload Tickets</span>
                <p className="text-xs text-muted-foreground hidden sm:block">Smart bulk sale with auto-cashier assignment</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {showCreateEvent && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Create New Event</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="eventName">Event Name</Label>
                <Input
                  id="eventName"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  placeholder="Summer Festival 2024"
                />
              </div>
              <div>
                <Label htmlFor="eventDate">Event Date</Label>
                <Input
                  id="eventDate"
                  type="date"
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="rangeStart">Range Start</Label>
                  <Input
                    id="rangeStart"
                    type="number"
                    min="1"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    placeholder="1"
                  />
                </div>
                <div>
                  <Label htmlFor="rangeEnd">Range End</Label>
                  <Input
                    id="rangeEnd"
                    type="number"
                    min="1"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    placeholder="1000"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateEvent} className="flex-1">Create Event</Button>
                <Button variant="outline" onClick={() => setShowCreateEvent(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Upload Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-900">
                  <p className="font-medium mb-1">Smart Upload System</p>
                  <p>Continuous tickets are marked as <strong>BULK SOLD</strong>. Tickets outside the event range or with gaps are automatically set as <strong>AVAILABLE for cashier sale</strong>.</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="font-medium mb-2 text-sm">CSV Format:</p>
              <code className="text-xs block">Ticket No.,QR Data</code>
              <code className="text-xs block">A0001,uYBxcW</code>
            </div>

            <div>
              <Label>Select Event</Label>
              <div className="flex gap-2 mt-2">
                <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Choose event" />
                  </SelectTrigger>
                  <SelectContent>
                    {events.map(event => (
                      <SelectItem key={event.id} value={event.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{event.name}</span>
                          {renderEventStatus(event)}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => setShowCreateEvent(true)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {selectedEvent && (
              <div className="p-4 bg-muted/30 rounded-lg">
                <h4 className="font-medium mb-2">Event Status</h4>
                {renderEventStatus(selectedEvent)}
              </div>
            )}

            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-primary" />
                  Bulk Sale Buyer Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Buyer Name *</Label>
                  <Input
                    value={bulkBuyerName}
                    onChange={(e) => setBulkBuyerName(e.target.value)}
                    placeholder="Company or Individual"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Email (optional)</Label>
                    <Input
                      type="email"
                      value={bulkBuyerEmail}
                      onChange={(e) => setBulkBuyerEmail(e.target.value)}
                      placeholder="buyer@example.com"
                    />
                  </div>
                  <div>
                    <Label>Phone (optional)</Label>
                    <Input
                      type="tel"
                      value={bulkBuyerPhone}
                      onChange={(e) => setBulkBuyerPhone(e.target.value)}
                      placeholder="+1234567890"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div>
              <Label>Select CSV File</Label>
              <Input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileChange}
                className="mt-2"
              />
            </div>

            {file && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <FileText className="w-8 h-8 text-accent" />
                <div className="flex-1">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setFile(null)}>Remove</Button>
              </div>
            )}

            {uploading && progress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            <Button
              onClick={handleUpload}
              disabled={!file || uploading || !selectedEventId || !bulkBuyerName.trim()}
              className="w-full"
            >
              {uploading ? 'Processing...' : 'Upload Tickets'}
            </Button>
          </CardContent>
        </Card>

        {uploadResults && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-success/10 rounded-lg">
                  <p className="font-medium text-success">✓ Total Success: {uploadResults.success}</p>
                </div>
                {uploadResults.bulk > 0 && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="font-medium text-blue-900">📦 Bulk Sold: {uploadResults.bulk}</p>
                    <p className="text-xs text-blue-700 mt-1">Pre-sold to {bulkBuyerName}</p>
                  </div>
                )}
                {uploadResults.cashier > 0 && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="font-medium text-amber-900">🎫 Cashier Ready: {uploadResults.cashier}</p>
                    <p className="text-xs text-amber-700 mt-1">Available for individual sale</p>
                  </div>
                )}
              </div>
              
              {uploadResults.failed > 0 && (
                <div className="p-4 bg-destructive/10 rounded-lg">
                  <p className="font-medium text-destructive mb-2">✗ Failed: {uploadResults.failed}</p>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {uploadResults.errors.slice(0, 10).map((error, i) => (
                      <p key={i} className="text-xs font-mono">{error}</p>
                    ))}
                    {uploadResults.errors.length > 10 && (
                      <p className="text-xs text-muted-foreground">...and {uploadResults.errors.length - 10} more</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Upload;