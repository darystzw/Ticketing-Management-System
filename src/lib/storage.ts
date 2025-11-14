// Local storage utilities for ticketing data

export interface Ticket {
  id: string;
  code: string;
  event_name: string;
  buyer_name: string;
  gate: string;
  valid_until: number | null;
  created_at: number;
  used: number;
  used_at: number | null;
}

export interface Scan {
  id: string;
  ticket_id: string | null;
  code: string;
  event_name: string | null;
  gate: string | null;
  operator: string | null;
  device_id: string | null;
  verdict: 'accepted' | 'duplicate' | 'invalid';
  ts: number;
}

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'cashier' | 'scanner';
  name: string;
  created_at: number;
}

const STORAGE_KEYS = {
  TICKETS: 'stignite_tickets',
  SCANS: 'stignite_scans',
  USERS: 'stignite_users',
  CURRENT_USER: 'stignite_current_user',
  DEVICE_ID: 'stignite_device_id',
} as const;

// Tickets
export const getTickets = (): Ticket[] => {
  const data = localStorage.getItem(STORAGE_KEYS.TICKETS);
  return data ? JSON.parse(data) : [];
};

export const saveTickets = (tickets: Ticket[]): void => {
  localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(tickets));
};

export const addTicket = (ticket: Omit<Ticket, 'id' | 'created_at'>): Ticket => {
  const tickets = getTickets();
  const newTicket: Ticket = {
    ...ticket,
    id: crypto.randomUUID(),
    created_at: Date.now(),
  };
  tickets.unshift(newTicket);
  saveTickets(tickets);
  return newTicket;
};

export const findTicketByCode = (code: string): Ticket | undefined => {
  return getTickets().find(t => t.code === code);
};

export const markTicketUsed = (code: string): boolean => {
  const tickets = getTickets();
  const ticket = tickets.find(t => t.code === code);
  if (ticket) {
    ticket.used = 1;
    ticket.used_at = Date.now();
    saveTickets(tickets);
    return true;
  }
  return false;
};

// Scans
export const getScans = (): Scan[] => {
  const data = localStorage.getItem(STORAGE_KEYS.SCANS);
  return data ? JSON.parse(data) : [];
};

export const saveScans = (scans: Scan[]): void => {
  localStorage.setItem(STORAGE_KEYS.SCANS, JSON.stringify(scans));
};

export const addScan = (scan: Omit<Scan, 'id' | 'ts'>): Scan => {
  const scans = getScans();
  const newScan: Scan = {
    ...scan,
    id: crypto.randomUUID(),
    ts: Date.now(),
  };
  scans.unshift(newScan);
  // Keep only last 1000 scans
  if (scans.length > 1000) {
    scans.length = 1000;
  }
  saveScans(scans);
  return newScan;
};

export const clearScans = (): void => {
  saveScans([]);
};

// Users
export const getUsers = (): User[] => {
  const data = localStorage.getItem(STORAGE_KEYS.USERS);
  if (data) return JSON.parse(data);
  
  // Initialize with default admin
  const defaultAdmin: User = {
    id: crypto.randomUUID(),
    email: 'admin@example.com',
    role: 'admin',
    name: 'Administrator',
    created_at: Date.now(),
  };
  saveUsers([defaultAdmin]);
  return [defaultAdmin];
};

export const saveUsers = (users: User[]): void => {
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
};

export const addUser = (user: Omit<User, 'id' | 'created_at'>): User => {
  const users = getUsers();
  const newUser: User = {
    ...user,
    id: crypto.randomUUID(),
    created_at: Date.now(),
  };
  users.push(newUser);
  saveUsers(users);
  return newUser;
};

export const findUserByEmail = (email: string): User | undefined => {
  return getUsers().find(u => u.email === email);
};

// Current User / Auth
export const getCurrentUser = (): User | null => {
  const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  return data ? JSON.parse(data) : null;
};

export const setCurrentUser = (user: User | null): void => {
  if (user) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  }
};

export const login = (email: string, password: string): User | null => {
  const user = findUserByEmail(email);
  // Simple password check (in real app, this would be hashed)
  if (user && (email === 'admin@example.com' && password === 'admin123')) {
    setCurrentUser(user);
    return user;
  }
  // For other users, just check if they exist
  if (user) {
    setCurrentUser(user);
    return user;
  }
  return null;
};

export const logout = (): void => {
  setCurrentUser(null);
};

// Device ID
export const getDeviceId = (): string => {
  let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  if (!deviceId) {
    deviceId = `device_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
  }
  return deviceId;
};

// Stats
export const getStats = () => {
  const scans = getScans();
  const tickets = getTickets();
  
  return {
    totalScans: scans.length,
    successful: scans.filter(s => s.verdict === 'accepted').length,
    duplicates: scans.filter(s => s.verdict === 'duplicate').length,
    invalid: scans.filter(s => s.verdict === 'invalid').length,
    totalTickets: tickets.length,
    usedTickets: tickets.filter(t => t.used).length,
  };
};
