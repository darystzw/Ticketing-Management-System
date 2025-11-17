import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { realtimeSync, SyncMessage } from '@/lib/syncService';
import { ArrowLeft } from 'lucide-react';
import { getCache, setCache } from '@/lib/cache';
import { optimizedSelect } from '@/lib/supabaseOptimized';
import { throttle } from '@/lib/networkOptimizer';
import { perfLogger, measureAsync } from '@/lib/performanceLogger';
import dashboardIcon from '@/assets/icons/dashboard.png';
import ticketIcon from '@/assets/icons/ticket.png';
import analyticsIcon from '@/assets/icons/analytics.png';
import scannerIcon from '@/assets/icons/scanner.png';
import moneyIcon from '@/assets/icons/money.png';
import userIcon from '@/assets/icons/user.png';
import logoutIcon from '@/assets/icons/logout.png';
import uploadIcon from '@/assets/icons/upload.png';
import cashierIcon from '@/assets/icons/cashier.png';

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, signOut, isLoading } = useAuth();
  const [stats, setStats] = useState({
    totalTickets: 0,
    soldTickets: 0,
    usedTickets: 0,
    availableTickets: 0,
    bulkSold: 0,
    cashierSold: 0,
    totalSales: 0,
    totalUsers: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      perfLogger.start('dashboard-loadStats');
      setIsLoadingStats(true);

      // Show cached stats immediately
      perfLogger.start('dashboard-getCache');
      const cachedStats = getCache<typeof stats>('dashboard:stats');
      perfLogger.end('dashboard-getCache');
      
      if (cachedStats) {
        setStats(cachedStats);
        perfLogger.log('dashboard-cache-hit', 0);
      }

      // Fetch tickets and sales data
      const ticketsData = await measureAsync('dashboard-fetch-tickets', () =>
        optimizedSelect('tickets', {
          select: 'status, sale_type',
          deduplicate: true,
        })
      );

      const salesData = await measureAsync('dashboard-fetch-sales', () =>
        optimizedSelect('sales', {
          select: 'amount',
          deduplicate: true,
        })
      );

      const userCountResult = await measureAsync('dashboard-fetch-userCount', async () =>
        await supabase.from('profiles').select('id', { count: 'exact', head: true })
      );
      const { count: userCount } = (userCountResult as unknown as { count?: number | null }) || {};

      const tickets = ticketsData || [];
      const sales = salesData || [];
      const totalUsers = userCount || 0;

      // Calculate stats
      // Available tickets: status='available' AND sale_type='cashier'
      const availableCount = tickets.filter(
        (t) => t.status === 'available' && t.sale_type === 'cashier'
      ).length;
      
      // Sold tickets: status='sold' (includes both bulk and cashier)
      const soldCount = tickets.filter((t) => t.status === 'sold').length;
      
      // Used tickets: status='used'
      const usedCount = tickets.filter((t) => t.status === 'used').length;
      
      // Bulk sold: status='sold' AND sale_type='bulk'
      const bulkSoldCount = tickets.filter(
        (t) => t.status === 'sold' && t.sale_type === 'bulk'
      ).length;
      
      // Cashier sold: status='sold' AND sale_type='cashier'
      const cashierSoldCount = tickets.filter(
        (t) => t.status === 'sold' && t.sale_type === 'cashier'
      ).length;
      
      const totalSalesAmount = sales.reduce((sum, sale) => sum + Number(sale.amount || 0), 0);

      const newStats = {
        totalTickets: tickets.length,
        soldTickets: soldCount,
        usedTickets: usedCount,
        availableTickets: availableCount,
        bulkSold: bulkSoldCount,
        cashierSold: cashierSoldCount,
        totalSales: totalSalesAmount,
        totalUsers,
      };

      setStats(newStats);

      // Cache the stats
      try {
        perfLogger.start('dashboard-setCache');
        setCache('dashboard:stats', newStats, 1000 * 60 * 2);
        perfLogger.end('dashboard-setCache');
      } catch (err) {
        console.debug('cache write failed', err);
      }
      
      perfLogger.end('dashboard-loadStats');
    } catch (error) {
      console.error('Error loading stats:', error);
      perfLogger.end('dashboard-loadStats');
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const handleTicketScanned = useCallback((message: SyncMessage) => {
    // Show notification for ticket scans
    toast({
      title: 'Ticket Scanned',
      description: `Ticket ${message.data.ticketCode || message.data.ticketNumber} was scanned`,
    });
    // Refresh stats to show updated counts
    loadStats();
  }, [toast, loadStats]);

  useEffect(() => {
    if (!user) return;

    loadStats();

    const throttledRefresh = throttle(() => loadStats(), 2000);

    const unsubscribeTickets = realtimeSync.subscribe('tickets_updated', (message) => throttledRefresh());
    const unsubscribeSales = realtimeSync.subscribe('sales_updated', (message) => throttledRefresh());
    const unsubscribeProfiles = realtimeSync.subscribe('profiles_updated', (message) => throttledRefresh());
    const unsubscribeScans = realtimeSync.subscribe('ticket_scanned', handleTicketScanned);

    return () => {
      unsubscribeTickets();
      unsubscribeSales();
      unsubscribeProfiles();
      unsubscribeScans();
    };
  }, [user, loadStats, handleTicketScanned]);

  const handleLogout = () => {
    (async () => {
      await signOut();
      navigate('/login');
    })();
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
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <img src={dashboardIcon} alt="Dashboard" className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xl font-bold text-foreground">Dashboard</span>
                <p className="text-xs text-muted-foreground hidden sm:block">Real-time analytics</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {isLoadingStats && (
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              )}
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {profile?.name || user.email?.split('@')[0] || 'User'}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="hover-lift border-l-4 border-l-accent animate-slide-up">
            <CardContent className="flex items-center p-6">
              <div className="w-14 h-14 bg-accent/10 rounded-xl flex items-center justify-center mr-4 shadow-sm">
                <img src={ticketIcon} alt="Tickets" className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Total Tickets</p>
                <p className="text-3xl font-bold text-foreground">{stats.totalTickets.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-l-4 border-l-success animate-slide-up" style={{ animationDelay: '50ms' }}>
            <CardContent className="flex items-center p-6">
              <div className="w-14 h-14 bg-success/10 rounded-xl flex items-center justify-center mr-4 shadow-sm">
                <img src={analyticsIcon} alt="Analytics" className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Sold Tickets</p>
                <p className="text-3xl font-bold text-foreground">{stats.soldTickets.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-l-4 border-l-warning animate-slide-up" style={{ animationDelay: '100ms' }}>
            <CardContent className="flex items-center p-6">
              <div className="w-14 h-14 bg-warning/10 rounded-xl flex items-center justify-center mr-4 shadow-sm">
                <img src={scannerIcon} alt="Scanner" className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Used Tickets</p>
                <p className="text-3xl font-bold text-foreground">{stats.usedTickets.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-l-4 border-l-green-500 animate-slide-up" style={{ animationDelay: '150ms' }}>
            <CardContent className="flex items-center p-6">
              <div className="w-14 h-14 bg-green-50 rounded-xl flex items-center justify-center mr-4 shadow-sm">
                <img src={ticketIcon} alt="Tickets" className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Available</p>
                <p className="text-3xl font-bold text-foreground">{stats.availableTickets.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Ready for cashier</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-l-4 border-l-blue-500 animate-slide-up" style={{ animationDelay: '175ms' }}>
            <CardContent className="flex items-center p-6">
              <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mr-4 shadow-sm">
                <img src={uploadIcon} alt="Bulk" className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Bulk Sold</p>
                <p className="text-3xl font-bold text-foreground">{stats.bulkSold.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Pre-sold in CSV</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-l-4 border-l-green-600 animate-slide-up" style={{ animationDelay: '200ms' }}>
            <CardContent className="flex items-center p-6">
              <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mr-4 shadow-sm">
                <img src={cashierIcon} alt="Cashier" className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Cashier Sold</p>
                <p className="text-3xl font-bold text-foreground">{stats.cashierSold.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Individual sales</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-l-4 border-l-success animate-slide-up" style={{ animationDelay: '225ms' }}>
            <CardContent className="flex items-center p-6">
              <div className="w-14 h-14 bg-success/10 rounded-xl flex items-center justify-center mr-4 shadow-sm">
                <img src={moneyIcon} alt="Money" className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Total Sales</p>
                <p className="text-3xl font-bold text-foreground">${stats.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift border-l-4 border-l-primary animate-slide-up" style={{ animationDelay: '250ms' }}>
            <CardContent className="flex items-center p-6">
              <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mr-4 shadow-sm">
                <img src={userIcon} alt="Users" className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Total Users</p>
                <p className="text-3xl font-bold text-foreground">{stats.totalUsers}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="animate-fade-in">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              Quick Actions
              <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">Shortcuts</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(profile?.roles?.includes('cashier') || profile?.roles?.includes('admin')) && (
                <Button
                  className="h-32 flex flex-col items-center justify-center gap-3 hover-lift"
                  variant="outline"
                  onClick={() => navigate('/cashier')}
                >
                  <div className="w-12 h-12 bg-success/10 rounded-xl flex items-center justify-center">
                    <img src={cashierIcon} alt="Cashier" className="w-7 h-7" />
                  </div>
                  <span className="font-semibold">Sell Tickets</span>
                </Button>
              )}

              {(profile?.roles?.includes('scanner') || profile?.roles?.includes('admin') || profile?.roles?.includes('cashier')) && (
                <Button
                  className="h-32 flex flex-col items-center justify-center gap-3 hover-lift"
                  variant="outline"
                  onClick={() => navigate('/scanner')}
                >
                  <div className="w-12 h-12 bg-warning/10 rounded-xl flex items-center justify-center">
                    <img src={scannerIcon} alt="Scanner" className="w-7 h-7" />
                  </div>
                  <span className="font-semibold">Scan Tickets</span>
                </Button>
              )}

              {profile?.roles?.includes('admin') && (
                <Button
                  className="h-32 flex flex-col items-center justify-center gap-3 hover-lift"
                  variant="outline"
                  onClick={() => navigate('/upload')}
                >
                  <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center">
                    <img src={uploadIcon} alt="Upload" className="w-7 h-7" />
                  </div>
                  <span className="font-semibold">Upload Tickets</span>
                </Button>
              )}

              {profile?.roles?.includes('admin') && (
                <Button
                  variant="outline"
                  className="h-32 flex flex-col items-center justify-center gap-3 hover-lift"
                  onClick={() => navigate('/account')}
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                    <img src={userIcon} alt="Users" className="w-7 h-7" />
                  </div>
                  <span className="font-semibold">My Account</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;