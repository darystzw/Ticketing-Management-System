/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Users, ArrowLeft, Trash2, Ban, Unlock } from 'lucide-react';
import logoutIcon from '@/assets/icons/logout.png';
import userIcon from '@/assets/icons/user.png';
import settingsIcon from '@/assets/icons/settings.png';
import refreshIcon from '@/assets/icons/refresh.png';

const Account = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user: currentUser, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [userToBan, setUserToBan] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBanning, setIsBanning] = useState(false);

  // Define loadUsers before using it in useEffect
  const loadUsers = async () => {
    const { data: profilesData } = await supabase
      .from('profiles')
      .select(`
        *,
        user_roles (role)
      `);
    
    if (profilesData) {
      // Sort: unbanned first, then by creation date
      const sorted = profilesData.sort((a, b) => {
        if (a.banned === b.banned) {
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        }
        return a.banned ? 1 : -1;
      });
      setUsers(sorted);
    }
  };

  // useEffect with real-time subscription
  useEffect(() => {
    loadUsers();

    // Simple real-time subscription without external service
    const channel = supabase
      .channel('account-users-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles'
        },
        () => {
          loadUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password || !role) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || email,
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        // Assign role
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: authData.user.id,
            role: role as 'admin' | 'cashier' | 'scanner'
          });

        if (roleError) throw roleError;
      }

      toast({
        title: 'User Created',
        description: `User ${email} created successfully`,
      });

      setEmail('');
      setName('');
      setPassword('');
      setRole('');
      loadUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create user',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    
    // Prevent self-deletion
    if (userToDelete.id === currentUser?.id) {
      toast({
        title: 'Error',
        description: 'You cannot delete your own account',
        variant: 'destructive',
      });
      setUserToDelete(null);
      return;
    }

    setIsDeleting(true);

    try {
      // Call RPC function to delete user cascade (auth + profile + roles)
      const { data, error: rpcError } = await supabase.rpc('delete_user_cascade', {
        _user_id: userToDelete.id
      }) as { data: { success: boolean; message?: string } | null; error: Error | null };

      if (rpcError) throw rpcError;

      if (data && !data.success) {
        throw new Error(data.message || 'Failed to delete user');
      }

      toast({
        title: 'User Deleted',
        description: `${userToDelete.name} has been removed from the system`,
      });

      setUserToDelete(null);
      loadUsers();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete user',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBanUser = async () => {
    if (!userToBan) return;
    
    // Prevent self-ban
    if (userToBan.id === currentUser?.id) {
      toast({
        title: 'Error',
        description: 'You cannot ban your own account',
        variant: 'destructive',
      });
      setUserToBan(null);
      return;
    }

    setIsBanning(true);

    try {
      const newBanStatus = !userToBan.banned;
      
      const { error } = await supabase
        .from('profiles')
        .update({ banned: newBanStatus })
        .eq('id', userToBan.id);

      if (error) throw error;

      toast({
        title: newBanStatus ? 'User Banned' : 'User Unbanned',
        description: `${userToBan.name} has been ${newBanStatus ? 'banned' : 'unbanned'}`,
      });

      setUserToBan(null);
      loadUsers();
    } catch (error) {
      console.error('Ban error:', error);
      toast({
        title: 'Action Failed',
        description: error instanceof Error ? error.message : 'Failed to update user status',
        variant: 'destructive',
      });
    } finally {
      setIsBanning(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-card/80 backdrop-blur-sm border-b border-border shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <img src={settingsIcon} alt="Settings" className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xl font-bold text-foreground">Account Management</span>
                <p className="text-xs text-muted-foreground hidden sm:block">User administration</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <img src={logoutIcon} alt="Logout" className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-4 mb-4">
            <img src={userIcon} alt="Users" className="w-16 h-16" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">User Account Management</h1>
              <p className="text-muted-foreground mt-1">Create and manage user accounts and permissions</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="hover-lift animate-slide-up">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                Create New User
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="User's full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role *</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id="role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scanner">Scanner - Can scan tickets only</SelectItem>
                      <SelectItem value="cashier">Cashier - Can sell and scan tickets</SelectItem>
                      <SelectItem value="admin">Admin - Full system access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" className="w-full">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Create User
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="hover-lift animate-slide-up" style={{ animationDelay: '100ms' }}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-accent" />
                Existing Users
              </CardTitle>
              <Button variant="outline" size="sm" onClick={loadUsers}>
                <img src={refreshIcon} alt="Refresh" className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {users.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No users found</p>
                  </div>
                ) : (
                  users.map((user) => {
                    const userRole = user.user_roles?.[0]?.role || 'No role assigned';
                    const isCurrentUser = user.id === currentUser?.id;
                    const isBanned = user.banned || false;
                    
                    return (
                      <div 
                        key={user.id} 
                        className={`flex items-center justify-between p-4 rounded-xl transition-colors ${
                          isBanned ? 'bg-destructive/5 border border-destructive/20' : 'bg-muted/50 hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${
                            isBanned ? 'bg-destructive/10' : 'bg-primary/10'
                          }`}>
                            <img src={userIcon} alt="User" className="w-8 h-8" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className={`font-medium truncate ${
                                isBanned ? 'text-destructive' : 'text-foreground'
                              }`}>
                                {user.name}
                                {isCurrentUser && (
                                  <span className="text-xs ml-2 px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                                    You
                                  </span>
                                )}
                              </p>
                              {isBanned && (
                                <Badge variant="destructive" className="text-xs">
                                  <Ban className="w-3 h-3 mr-1" />
                                  Banned
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                            <p className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded-full inline-block mt-1 capitalize">
                              {userRole}
                            </p>
                          </div>
                        </div>
                        
                        {!isCurrentUser && (
                          <div className="flex items-center gap-2 ml-2">
                            <Button
                              variant={isBanned ? "outline" : "ghost"}
                              size="sm"
                              onClick={() => setUserToBan(user)}
                              title={isBanned ? "Unban user" : "Ban user"}
                            >
                              {isBanned ? (
                                <Unlock className="w-4 h-4" />
                              ) : (
                                <Ban className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setUserToDelete(user)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete user"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete User?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{userToDelete?.name}</strong> ({userToDelete?.email})?
              <br /><br />
              This action will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Remove their profile and roles</li>
                <li>Prevent them from accessing the system</li>
              </ul>
              <br />
              <strong>This action cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ban/Unban User Confirmation Dialog */}
      <AlertDialog open={!!userToBan} onOpenChange={(open) => !open && setUserToBan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {userToBan?.banned ? (
                <><Unlock className="w-5 h-5 text-success" /> Unban User?</>
              ) : (
                <><Ban className="w-5 h-5 text-warning" /> Ban User?</>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {userToBan?.banned ? (
                <>
                  Are you sure you want to unban <strong>{userToBan?.name}</strong>?
                  <br /><br />
                  They will regain access to the system.
                </>
              ) : (
                <>
                  Are you sure you want to ban <strong>{userToBan?.name}</strong> ({userToBan?.email})?
                  <br /><br />
                  This will:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Prevent them from logging in</li>
                    <li>Block their access to all features</li>
                    <li>Keep their data intact</li>
                  </ul>
                  <br />
                  You can unban them later if needed.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBanning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBanUser}
              disabled={isBanning}
              className={userToBan?.banned ? 'bg-success hover:bg-success/90' : 'bg-warning hover:bg-warning/90'}
            >
              {isBanning ? 'Processing...' : userToBan?.banned ? 'Unban User' : 'Ban User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Account;
