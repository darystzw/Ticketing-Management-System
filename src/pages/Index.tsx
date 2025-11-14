import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Sparkles } from 'lucide-react';
import { NotificationCenter } from '@/components/Notification';
import ticketIcon from '@/assets/icons/ticket.png';
import dashboardIcon from '@/assets/icons/dashboard.png';
import scannerIcon from '@/assets/icons/scanner.png';
import cashierIcon from '@/assets/icons/cashier.png';
import uploadIcon from '@/assets/icons/upload.png';
import userIcon from '@/assets/icons/user.png';
import logoutIcon from '@/assets/icons/logout.png';

const Index = () => {
  const navigate = useNavigate();
  const { user, profile, signOut, isLoading } = useAuth();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login');
    }
  }, [user, isLoading, navigate]);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const features = [
    {
      title: 'Dashboard',
      icon: dashboardIcon,
      description: 'Real-time analytics and system overview',
      path: '/dashboard',
      badge: 'All Users',
      color: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      title: 'Scanner',
      icon: scannerIcon,
      description: 'Scan tickets at the gate',
      path: '/scanner',
      badge: 'Scanner',
      color: 'bg-green-50 dark:bg-green-950/30',
    },
    {
      title: 'Cashier',
      icon: cashierIcon,
      description: 'Sell tickets to customers',
      path: '/cashier',
      badge: 'Cashier',
      color: 'bg-amber-50 dark:bg-amber-950/30',
    },
    {
      title: 'Upload',
      icon: uploadIcon,
      description: 'Import ticket data',
      path: '/upload',
      badge: 'Admin',
      color: 'bg-violet-50 dark:bg-violet-950/30',
    },
    {
      title: 'Account',
      icon: userIcon,
      description: 'Manage users and permissions',
      path: '/account',
      badge: 'Admin',
      color: 'bg-slate-50 dark:bg-slate-950/30',
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-card/80 backdrop-blur-sm border-b border-border shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="relative">
                <img src={ticketIcon} alt="Ticket" className="w-8 h-8" />
                <Sparkles className="w-3 h-3 text-primary absolute -top-1 -right-1" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                StigNite
              </span>
            </div>
            <div className="flex items-center gap-4">
              <NotificationCenter />
              <div className="flex items-center gap-2">
                <img src={userIcon} alt="User" className="w-6 h-6" />
                <span className="text-sm text-muted-foreground hidden sm:inline">
                  {profile?.name || user.email?.split('@')[0] || 'User'}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
                <img src={logoutIcon} alt="Logout" className="w-4 h-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-16 animate-fade-in">
          <div className="inline-block relative mb-6">
            <img src={ticketIcon} alt="Ticket" className="w-24 h-24 md:w-32 md:h-32 animate-scale-in drop-shadow-2xl" />
            <div className="absolute inset-0 blur-3xl opacity-40 bg-primary rounded-full scale-150"></div>
          </div>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-foreground mb-6 animate-slide-up">
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent bg-[length:200%_auto] animate-[gradient_3s_linear_infinite]">
              StigNite
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-4">Advanced Ticketing System</p>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            Streamline your event management with real-time tracking, analytics, and seamless ticket operations
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card
              key={feature.path}
              className="hover-lift cursor-pointer border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden group animate-slide-up"
              style={{ animationDelay: `${index * 100}ms` }}
              onClick={() => navigate(feature.path)}
            >
              <CardContent className="p-6 relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative">
                  <div className="flex items-start mb-4">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mr-4 ${feature.color} shadow-lg group-hover:scale-110 group-hover:shadow-xl transition-all duration-300 p-2`}>
                      <img src={feature.icon} alt={feature.title} className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-card-foreground group-hover:text-primary transition-colors">{feature.title}</h3>
                      <span className="inline-block text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground mt-1">{feature.badge}</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Index;
