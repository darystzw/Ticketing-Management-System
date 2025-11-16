/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCache, setCache, removeCache } from '@/lib/cache';
import useLocalStorage from '@/hooks/use-local-storage';
import { FileText, ArrowLeft, Plus, AlertTriangle, CheckCircle, Info, Package, Ticket } from 'lucide-react';
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
    bulkSold: number;
    availableCreated: number;
    errors: string[] 
  } | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useLocalStorage<string>('upload:selectedEventId', '');
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [bulkRangeStart, setBulkRangeStart] = useState('');
  const [bulkRangeEnd, setBulkRangeEnd] = useState('');
  const [progress, setProgress] = useState(0);
  const [bulkBuyerName, setBulkBuyerName] = useLocalStorage<string>('upload:bulkBuyerName', '');
  const [bulkBuyerEmail, setBulkBuyerEmail] = useLocalStorage<string>('upload:bulkBuyerEmail', '');
  const [bulkBuyerPhone, setBulkBuyerPhone] = useLocalStorage<string>('upload:bulkBuyerPhone', '');
  
  // Upload options
  const [uploadBulkTickets, setUploadBulkTickets] = useState(true);
  const [createAvailableTickets, setCreateAvailableTickets] = useState(true);
  
  // Preview calculated ranges
  const [previewRanges, setPreviewRanges] = useState<{
    totalTickets: number;
    bulkStart: number;
    bulkEnd: number;
    bulkCount: number;
    availableTickets: number[];
    availableCount: number;
  } | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
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
  };

  const handleCreateEvent = async () => {
    if (!newEventName.trim() || !newEventDate || !bulkRangeStart || !bulkRangeEnd) {
      toast({
        title: 'Error',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }

    const bulkStart = parseInt(bulkRangeStart);
    const bulkEnd = parseInt(bulkRangeEnd);

    if (isNaN(bulkStart) || isNaN(bulkEnd) || bulkStart > bulkEnd || bulkStart < 1) {
      toast({
        title: 'Invalid Range',
        description: 'Please enter a valid bulk range (start must be >= 1, end must be >= start)',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Event range will be set to 0-0 initially, will be updated when CSV is uploaded
      const { data: newEvent, error } = await supabase
        .from('events')
        .insert({
          name: newEventName.trim(),
          event_date: newEventDate,
          range_start: 0,
          range_end: 0,
          bulk_sold_range_start: bulkStart,
          bulk_sold_range_end: bulkEnd,
          created_by: user?.id
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Event Created',
        description: `Event "${newEventName}" created with bulk range ${bulkStart}-${bulkEnd}`,
      });

      setNewEventName('');
      setNewEventDate('');
      setBulkRangeStart('');
      setBulkRangeEnd('');
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setUploadResults(null);
      setProgress(0);
      
      if (selectedEventId) {
        await calculatePreviewRanges(selectedFile);
      }
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

  const calculatePreviewRanges = async (csvFile: File) => {
    try {
      const selectedEvent = events.find(e => e.id === selectedEventId);
      if (!selectedEvent) return;

      if (!selectedEvent.bulk_sold_range_start || !selectedEvent.bulk_sold_range_end) {
        toast({
          title: 'Error',
          description: 'Event must have bulk range specified',
          variant: 'destructive',
        });
        return;
      }

      const text = await csvFile.text();
      const tickets = parseCSV(text);

      if (tickets.length === 0) {
        setPreviewRanges(null);
        return;
      }

      const bulkStart = selectedEvent.bulk_sold_range_start;
      const bulkEnd = selectedEvent.bulk_sold_range_end;
      const totalTickets = tickets.length;

      // Get all ticket numbers from CSV
      const allTicketNumbers = tickets.map(t => t.ticketNumber);
      
      // Find tickets that are in bulk range
      const bulkTickets = allTicketNumbers.filter(num => num >= bulkStart && num <= bulkEnd);
      const bulkCount = bulkTickets.length;
      
      // Find tickets that are NOT in bulk range (these are available)
      const availableTickets = allTicketNumbers.filter(num => num < bulkStart || num > bulkEnd);
      const availableCount = availableTickets.length;

      setPreviewRanges({
        totalTickets,
        bulkStart,
        bulkEnd,
        bulkCount,
        availableTickets,
        availableCount
      });
    } catch (error) {
      console.error('Error calculating preview:', error);
      setPreviewRanges(null);
    }
  };

  useEffect(() => {
    if (file && selectedEventId) {
      calculatePreviewRanges(file);
    } else {
      setPreviewRanges(null);
    }
  }, [selectedEventId, file]);

  const handleUpload = async () => {
    if (!file || !selectedEventId) {
      toast({
        title: 'Error',
        description: 'Please select a file and event',
        variant: 'destructive',
      });
      return;
    }

    if (uploadBulkTickets && !bulkBuyerName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter buyer name for bulk sale',
        variant: 'destructive',
      });
      return;
    }

    if (!uploadBulkTickets && !createAvailableTickets) {
      toast({
        title: 'Error',
        description: 'Please select at least one upload option',
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

    if (!selectedEvent.bulk_sold_range_start || !selectedEvent.bulk_sold_range_end) {
      toast({
        title: 'Error',
        description: 'Event must have bulk range specified',
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
      let bulkSoldCount = 0;
      let availableCreatedCount = 0;
      const errors: string[] = [];

      const bulkStart = selectedEvent.bulk_sold_range_start;
      const bulkEnd = selectedEvent.bulk_sold_range_end;
      
      // Get min and max from CSV to set event range
      const ticketNumbers = tickets.map(t => t.ticketNumber).sort((a, b) => a - b);
      const csvMin = ticketNumbers[0];
      const csvMax = ticketNumbers[ticketNumbers.length - 1];

      // Update event range to match CSV
      const { error: updateError } = await supabase
        .from('events')
        .update({
          range_start: csvMin,
          range_end: csvMax
        })
        .eq('id', selectedEventId);

      if (updateError) {
        throw new Error(`Failed to update event range: ${updateError.message}`);
      }

      // Separate tickets into bulk and available
      const bulkTickets = tickets.filter(t => t.ticketNumber >= bulkStart && t.ticketNumber <= bulkEnd);
      const availableTicketsData = tickets.filter(t => t.ticketNumber < bulkStart || t.ticketNumber > bulkEnd);

      // STEP 1: Upload BULK tickets (if selected)
      if (uploadBulkTickets && bulkTickets.length > 0) {
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
                bulkSoldCount++;
              } catch (err: any) {
                failedCount++;
                errors.push(`${ticket.ticketCode}: ${err.message}`);
              }
            }
          } else {
            const inserted = data?.length || batch.length;
            successCount += inserted;
            bulkSoldCount += inserted;
          }

          setProgress(Math.min(((i + batchSize) / tickets.length) * 50, 50));
        }
      }

      // STEP 2: Create AVAILABLE tickets (if selected)
      if (createAvailableTickets && availableTicketsData.length > 0) {
        const batchSize = 100;

        for (let i = 0; i < availableTicketsData.length; i += batchSize) {
          const batch = availableTicketsData.slice(i, i + batchSize);

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
                availableCreatedCount++;
              } catch (err: any) {
                failedCount++;
                errors.push(`${ticket.ticketCode}: ${err.message}`);
              }
            }
          } else {
            const inserted = data?.length || batch.length;
            successCount += inserted;
            availableCreatedCount += inserted;
          }

          setProgress(Math.min(50 + ((i + batchSize) / availableTicketsData.length) * 50, 100));
        }
      }

      // Invalidate cache
      try {
        removeCache('events_all');
        removeCache('dashboard:stats');
      } catch (err) {
        console.debug('cache invalidate failed', err);
      }

      setUploadResults({ 
        success: successCount, 
        failed: failedCount, 
        bulkSold: bulkSoldCount,
        availableCreated: availableCreatedCount,
        errors 
      });
      setProgress(100);

      const resultParts = [];
      if (bulkSoldCount > 0) resultParts.push(`${bulkSoldCount} bulk sold`);
      if (availableCreatedCount > 0) resultParts.push(`${availableCreatedCount} available created`);
      if (failedCount > 0) resultParts.push(`${failedCount} failed`);

      toast({
        title: 'Upload Complete',
        description: resultParts.join(', '),
      });

      setFile(null);
      setPreviewRanges(null);
      if (uploadBulkTickets) {
        setBulkBuyerName('');
        setBulkBuyerEmail('');
        setBulkBuyerPhone('');
      }

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
    if (!event.bulk_sold_range_start || !event.bulk_sold_range_end) {
      return (
        <div className="flex items-center gap-2 text-warning text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>No bulk range specified</span>
        </div>
      );
    }

    if (event.range_start === 0 && event.range_end === 0) {
      return (
        <div className="flex items-center gap-2 text-blue-600 text-sm">
          <Info className="w-4 h-4" />
          <span>Bulk range: {event.bulk_sold_range_start}-{event.bulk_sold_range_end} | Awaiting CSV upload</span>
        </div>
      );
    }

    const totalTickets = event.range_end - event.range_start + 1;
    const bulkSize = event.bulk_sold_range_end - event.bulk_sold_range_start + 1;
    const availableSize = totalTickets - bulkSize;

    return (
      <div className="flex items-center gap-2 text-success text-sm">
        <CheckCircle className="w-4 h-4" />
        <span>Total: {totalTickets} | Bulk: {bulkSize} | Available: {availableSize}</span>
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
                <p className="text-xs text-muted-foreground hidden sm:block">Upload bulk & available tickets from CSV</p>
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
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-2">Bulk Range</p>
                <p className="text-xs text-blue-700 mb-3">Specify which ticket numbers are pre-sold in bulk</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="bulkStart">Bulk Start</Label>
                    <Input
                      id="bulkStart"
                      type="number"
                      min="1"
                      value={bulkRangeStart}
                      onChange={(e) => setBulkRangeStart(e.target.value)}
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="bulkEnd">Bulk End</Label>
                    <Input
                      id="bulkEnd"
                      type="number"
                      min="1"
                      value={bulkRangeEnd}
                      onChange={(e) => setBulkRangeEnd(e.target.value)}
                      placeholder="600"
                    />
                  </div>
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
                  <p className="font-medium mb-1">How It Works</p>
                  <p className="mb-2">1. Create event and specify bulk range (e.g., 1-600)</p>
                  <p className="mb-2">2. Upload CSV with all tickets</p>
                  <p>3. System separates: tickets in bulk range → sold | tickets outside bulk range → available</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="font-medium mb-2 text-sm">CSV Format:</p>
              <code className="text-xs block">Ticket No.,QR Data</code>
              <code className="text-xs block">A0001,uYBxcW</code>
              <code className="text-xs block">A0002,kLmNpQ</code>
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
                {selectedEvent.bulk_sold_range_start && selectedEvent.bulk_sold_range_end && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Bulk Range: {selectedEvent.bulk_sold_range_start}-{selectedEvent.bulk_sold_range_end}
                  </p>
                )}
              </div>
            )}

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
                <Button variant="outline" size="sm" onClick={() => {
                  setFile(null);
                  setPreviewRanges(null);
                }}>Remove</Button>
              </div>
            )}

            {/* PREVIEW RANGES */}
            {previewRanges && (
              <Card className="border-2 border-purple-200 bg-purple-50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="w-5 h-5 text-purple-600" />
                    Upload Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-3 bg-white rounded-lg border border-purple-200">
                    <p className="text-sm font-medium text-purple-900 mb-1">Total Tickets in CSV</p>
                    <p className="text-2xl font-bold text-purple-600">{previewRanges.totalTickets}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-white rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-4 h-4 text-blue-600" />
                        <p className="text-sm font-medium text-blue-900">Bulk (Pre-Sold)</p>
                      </div>
                      <p className="text-2xl font-bold text-blue-600">{previewRanges.bulkCount}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        In range: {previewRanges.bulkStart}-{previewRanges.bulkEnd}
                      </p>
                    </div>
                    
                    <div className="p-3 bg-white rounded-lg border border-green-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Ticket className="w-4 h-4 text-green-600" />
                        <p className="text-sm font-medium text-green-900">Available (Cashier)</p>
                      </div>
                      <p className="text-2xl font-bold text-green-600">{previewRanges.availableCount}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Outside bulk range
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* UPLOAD OPTIONS */}
            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-primary" />
                  Upload Options
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start space-x-3 p-4 bg-white rounded-lg border">
                  <Checkbox 
                    id="uploadBulk" 
                    checked={uploadBulkTickets}
                    onCheckedChange={(checked) => setUploadBulkTickets(checked as boolean)}
                  />
                  <div className="flex-1">
                    <label htmlFor="uploadBulk" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                      <Package className="w-4 h-4 text-blue-600" />
                      Upload Bulk Tickets
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Mark tickets in bulk range as sold to bulk buyer
                    </p>
                  </div>
                </div>

                {uploadBulkTickets && (
                  <div className="ml-7 space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div>
                      <Label>Bulk Buyer Name *</Label>
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
                  </div>
                )}

                <div className="flex items-start space-x-3 p-4 bg-white rounded-lg border">
                  <Checkbox 
                    id="createAvailable" 
                    checked={createAvailableTickets}
                    onCheckedChange={(checked) => setCreateAvailableTickets(checked as boolean)}
                  />
                  <div className="flex-1">
                    <label htmlFor="createAvailable" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-green-600" />
                      Create Available Tickets
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Mark tickets outside bulk range as available for cashier sale
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

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
              disabled={!file || uploading || !selectedEventId || (uploadBulkTickets && !bulkBuyerName.trim()) || (!uploadBulkTickets && !createAvailableTickets)}
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
                {uploadResults.bulkSold > 0 && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="font-medium text-blue-900">📦 Bulk Sold: {uploadResults.bulkSold}</p>
                    <p className="text-xs text-blue-700 mt-1">Pre-sold to {bulkBuyerName}</p>
                  </div>
                )}
                {uploadResults.availableCreated > 0 && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="font-medium text-green-900">💰 Available Created: {uploadResults.availableCreated}</p>
                    <p className="text-xs text-green-700 mt-1">Ready for cashier sale</p>
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