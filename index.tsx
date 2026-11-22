import React, { useState, useMemo } from 'react';
import {
    Users,
    PlusCircle,
    ClipboardList,
    LayoutDashboard,
    Search,
    Filter,
    Edit3,
    Trash2,
    CheckCircle2,
    Clock,
    XCircle,
    PieChart,
    Calendar,
    MapPin,
    Phone,
    Mail,
    UserCheck,
    Shield,
    ChevronRight,
    LogOut,
    Menu,
    X,
    TrendingUp,
    Award,
    DollarSign,
    Building,
    Briefcase,
    Lock,
    LogIn,
    Cloud,
    Eye,
    EyeOff,
    Sliders,
    Layers,
    Package,
    Navigation,
    Compass,
    Target,
    FileText,
    Download,
    Printer,
    FileSpreadsheet
} from 'lucide-react';
import {
    isFirebaseConfigured,
    subscribeToInquiries,
    saveInquiryToFirestore,
    deleteInquiryFromFirestore,
    subscribeToUsers,
    saveUserToFirestore,
    deleteUserFromFirestore,
    subscribeToConfig,
    saveConfigToFirestore,
    subscribeToVisits,
    saveVisitToFirestore,
    deleteVisitFromFirestore
} from './src/firebase';

// --- PASSWORD HASHING / ENCRYPTION UTILITIES (SHA-256) ---
async function hashPassword(plainText: string): Promise<string> {
    if (!plainText) return '';
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(plainText);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return `sha256:${hashHex}`;
    } catch (e) {
        // Fallback for non-subtle crypto environments
        return `enc:${btoa(plainText)}`;
    }
}

async function verifyPassword(plainText: string, storedHash: string): Promise<boolean> {
    if (!plainText || !storedHash) return false;
    // Check plain text backward compatibility (e.g. existing initial records)
    if (storedHash === plainText) return true;
    if (storedHash.startsWith('sha256:')) {
        const computed = await hashPassword(plainText);
        return computed === storedHash;
    }
    if (storedHash.startsWith('enc:')) {
        return storedHash === `enc:${btoa(plainText)}`;
    }
    return false;
}

// --- EMAIL VALIDATION UTILITY ---
const isValidEmail = (emailStr: string): boolean => {
    if (!emailStr) return false;
    // Standard RFC 5322 compatible regex
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(emailStr.trim());
};

// --- DEFAULT CONFIGURATION FOR EVENT TYPES & HOTEL PACKAGES ---
const DEFAULT_EVENT_TYPES = [
    'Corporate Event',
    'Annual Gala Dinner',
    'Wedding Banquet',
    'Product Launch',
    'Executive Retreat',
    'Private Celebration'
];

const DEFAULT_PACKAGES = [
    'Executive Full-Day Conference Package',
    'Grand Royal Banquet Package',
    'Half-Day Seminar & High-Tea',
    'Luxury Weekend Retreat Package',
    'Cocktail & Lounge Experience'
];

// --- DEFAULT ADMIN SEED (used only if Firestore 'users' collection is empty) ---
const DEFAULT_ADMIN_USER = {
    id: 'admin-001',
    name: 'dayan',
    email: 'admin@jadegreen.com',
    password: 'sha256:240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', // admin123
    role: 'admin',
    department: 'Administration'
};

export default function App() {
    // State variables
    const [currentUser, setCurrentUser] = useState(() => {
        try {
            const saved = localStorage.getItem('marketing_dashboard_user');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    });
    const [users, setUsers] = useState(() => {
        try {
            const saved = localStorage.getItem('marketing_dashboard_users');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {}
        return [DEFAULT_ADMIN_USER];
    });
    const [inquiries, setInquiries] = useState(() => {
        try {
            const saved = localStorage.getItem('marketing_dashboard_inquiries');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch (e) {}
        return [];
    });
    const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'new-inquiry', 'inquiries', 'new-visit', 'visits', 'users', 'packages'
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Visits Collection State
    const [visits, setVisits] = useState<any[]>(() => {
        try {
            const saved = localStorage.getItem('marketing_dashboard_visits');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch (e) {}
        return [];
    });
    const [visitSearchTerm, setVisitSearchTerm] = useState('');
    const [deletingVisitId, setDeletingVisitId] = useState<string | null>(null);

    // Form State for Record New Visit (auto pickup date & time)
    const [newVisitForm, setNewVisitForm] = useState(() => {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].slice(0, 5); // HH:MM
        return {
            date: dateStr,
            time: timeStr,
            companyName: '',
            contactPerson: '',
            phone: '',
            email: '',
            clientLocation: '',
            remark: ''
        };
    });

    // Event Types & Hotel Packages (Configurable by Super Admin)
    const [eventTypes, setEventTypes] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('marketing_dashboard_event_types');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {}
        return DEFAULT_EVENT_TYPES;
    });

    const [hotelPackages, setHotelPackages] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('marketing_dashboard_packages');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {}
        return DEFAULT_PACKAGES;
    });

    const [newEventTypeInput, setNewEventTypeInput] = useState('');
    const [newPackageInput, setNewPackageInput] = useState('');

    // Sales Target for Events (Super Admin configurable with monthly renewal)
    const currentMonthKey = new Date().toISOString().slice(0, 7); // e.g. "2026-11"
    const [salesTarget, setSalesTarget] = useState<number>(() => {
        try {
            const savedMonth = localStorage.getItem('marketing_dashboard_sales_target_month');
            const saved = localStorage.getItem('marketing_dashboard_sales_target');
            if (saved && savedMonth === currentMonthKey) {
                const parsed = Number(saved);
                if (!isNaN(parsed) && parsed > 0) return parsed;
            }
        } catch (e) {}
        return 1000000;
    });
    const [salesTargetMonth, setSalesTargetMonth] = useState<string>(() => {
        try {
            return localStorage.getItem('marketing_dashboard_sales_target_month') || currentMonthKey;
        } catch (e) {
            return currentMonthKey;
        }
    });
    const [salesTargetInput, setSalesTargetInput] = useState<string>('');

    // Reports filter state
    const [reportMonth, setReportMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
    const [reportType, setReportType] = useState<'all' | 'visits' | 'inquiries'>('all');

    // Filters & Search
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    // Modals
    const [editingInquiry, setEditingInquiry] = useState(null);
    const [deletingInquiryId, setDeletingInquiryId] = useState(null);
    const [userModalOpen, setUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [showUserPassword, setShowUserPassword] = useState(false);

    // Form State for New Inquiry
    const [newInquiryForm, setNewInquiryForm] = useState({
        clientName: '',
        contactPerson: '',
        phone: '',
        email: '',
        location: '',
        eventType: 'Corporate Event',
        package: 'Executive Full-Day Conference Package',
        guestCount: '',
        targetDate: '',
        estimatedBudget: '',
        notes: '',
        assignedOfficerId: ''
    });

    // User form state
    const [userFormData, setUserFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'officer',
        department: 'Field Sales'
    });

    // Persist to local storage as reliable backup
    React.useEffect(() => {
        try {
            localStorage.setItem('marketing_dashboard_users', JSON.stringify(users));
        } catch (e) {}
    }, [users]);

    React.useEffect(() => {
        try {
            localStorage.setItem('marketing_dashboard_inquiries', JSON.stringify(inquiries));
        } catch (e) {}
    }, [inquiries]);

    React.useEffect(() => {
        try {
            localStorage.setItem('marketing_dashboard_event_types', JSON.stringify(eventTypes));
        } catch (e) {}
    }, [eventTypes]);

    React.useEffect(() => {
        try {
            localStorage.setItem('marketing_dashboard_packages', JSON.stringify(hotelPackages));
        } catch (e) {}
    }, [hotelPackages]);

    React.useEffect(() => {
        try {
            localStorage.setItem('marketing_dashboard_sales_target', String(salesTarget));
            localStorage.setItem('marketing_dashboard_sales_target_month', salesTargetMonth);
        } catch (e) {}
    }, [salesTarget, salesTargetMonth]);

    React.useEffect(() => {
        try {
            localStorage.setItem('marketing_dashboard_visits', JSON.stringify(visits));
        } catch (e) {}
    }, [visits]);

    // Synchronize with Cloud Firestore in Real-Time
    React.useEffect(() => {
        if (!isFirebaseConfigured()) return;

        const unsubInquiries = subscribeToInquiries((cloudInquiries) => {
            if (cloudInquiries && cloudInquiries.length > 0) {
                setInquiries(cloudInquiries);
            }
        });

        const unsubUsers = subscribeToUsers((cloudUsers) => {
            if (cloudUsers && cloudUsers.length > 0) {
                setUsers(cloudUsers);
            } else {
                // Seed default admin user to Firestore if no users exist
                saveUserToFirestore(DEFAULT_ADMIN_USER);
            }
        });

        const unsubConfig = subscribeToConfig((config) => {
            const thisMonth = new Date().toISOString().slice(0, 7);
            if (config) {
                if (Array.isArray(config.eventTypes) && config.eventTypes.length > 0) {
                    setEventTypes(config.eventTypes);
                }
                if (Array.isArray(config.hotelPackages) && config.hotelPackages.length > 0) {
                    setHotelPackages(config.hotelPackages);
                }
                // Monthly target sales check: if config month differs from current month, renew
                const configMonth = config.targetSalesMonth || thisMonth;
                if (configMonth !== thisMonth) {
                    // New month rollover: renew target for the current month
                    const baseTarget = typeof config.targetSalesAmount === 'number' && config.targetSalesAmount > 0
                        ? config.targetSalesAmount
                        : 1000000;
                    setSalesTarget(baseTarget);
                    setSalesTargetMonth(thisMonth);
                    saveConfigToFirestore({
                        targetSalesMonth: thisMonth,
                        targetSalesAmount: baseTarget
                    });
                } else if (typeof config.targetSalesAmount === 'number' && config.targetSalesAmount > 0) {
                    setSalesTarget(config.targetSalesAmount);
                    setSalesTargetMonth(configMonth);
                }
            } else {
                // Seed default config to Firestore with active monthly key
                saveConfigToFirestore({
                    eventTypes: DEFAULT_EVENT_TYPES,
                    hotelPackages: DEFAULT_PACKAGES,
                    targetSalesAmount: 1000000,
                    targetSalesMonth: thisMonth
                });
            }
        });

        const unsubVisits = subscribeToVisits((cloudVisits) => {
            if (cloudVisits && cloudVisits.length > 0) {
                setVisits(cloudVisits);
            }
        });

        return () => {
            unsubInquiries();
            unsubUsers();
            unsubConfig();
            unsubVisits();
        };
    }, []);

    // Automatically adjust default assigned officer when user changes
    React.useEffect(() => {
        if (!currentUser) return;
        if (currentUser.role === 'officer') {
            setNewInquiryForm(prev => ({ ...prev, assignedOfficerId: currentUser.id }));
        } else {
            setNewInquiryForm(prev => ({ ...prev, assignedOfficerId: users.find(u => u.role === 'officer')?.id || users[0].id }));
        }
    }, [currentUser, users]);

    // Scoped inquiries according to user role
    const visibleInquiries = useMemo(() => {
        if (!currentUser) return [];
        if (currentUser.role === 'officer') {
            return inquiries.filter(inq => inq.assignedOfficerId === currentUser.id);
        }
        return inquiries; // Admin & Management see all
    }, [inquiries, currentUser]);

    // Scoped visits according to user role
    const visibleVisits = useMemo(() => {
        if (!currentUser) return [];
        if (currentUser.role === 'officer') {
            return visits.filter(v => v.officerId === currentUser.id);
        }
        return visits; // Admin & Management see all
    }, [visits, currentUser]);

    const filteredVisits = useMemo(() => {
        return visibleVisits.filter(v => {
            const query = visitSearchTerm.toLowerCase();
            return (
                (v.companyName || '').toLowerCase().includes(query) ||
                (v.contactPerson || '').toLowerCase().includes(query) ||
                (v.clientLocation || '').toLowerCase().includes(query) ||
                (v.id || '').toLowerCase().includes(query)
            );
        });
    }, [visibleVisits, visitSearchTerm]);

    // Helper: Render Status Badge consistently
    const renderStatusBadge = (status: string) => {
        const s = status || 'Pending / New';
        if (s === 'Completed') {
            return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Completed
                </span>
            );
        }
        if (s === 'Confirmed') {
            return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirmed
                </span>
            );
        }
        if (s === 'Nego.' || s === 'In Progress') {
            return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Clock className="w-3.5 h-3.5" />
                    Nego.
                </span>
            );
        }
        if (s === 'Cancelled / Lost' || s === 'Cancelled') {
            return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <XCircle className="w-3.5 h-3.5" />
                    Cancelled / Lost
                </span>
            );
        }
        // Default: Pending / New
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Clock className="w-3.5 h-3.5" />
                Pending / New
            </span>
        );
    };
    const filteredInquiries = useMemo(() => {
        return visibleInquiries.filter(inq => {
            const matchesSearch =
                inq.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inq.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inq.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inq.id.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = statusFilter === 'All' ||
                inq.status === statusFilter ||
                (statusFilter === 'Pending / New' && inq.status === 'Pending') ||
                (statusFilter === 'Nego.' && inq.status === 'In Progress') ||
                (statusFilter === 'Cancelled / Lost' && inq.status === 'Cancelled');
            return matchesSearch && matchesStatus;
        });
    }, [visibleInquiries, searchTerm, statusFilter]);

    // Dashboard Aggregates (Calculated based on Role Scope)
    const stats = useMemo(() => {
        const total = visibleInquiries.length;
        const pending = visibleInquiries.filter(i => i.status === 'Pending / New' || i.status === 'Pending').length;
        const nego = visibleInquiries.filter(i => i.status === 'Nego.' || i.status === 'In Progress').length;
        const confirmed = visibleInquiries.filter(i => i.status === 'Confirmed').length;
        const completed = visibleInquiries.filter(i => i.status === 'Completed').length;
        const cancelled = visibleInquiries.filter(i => i.status === 'Cancelled / Lost' || i.status === 'Cancelled').length;

        const calcPct = (val: number) => (total > 0 ? ((val / total) * 100).toFixed(1) : '0.0');

        // Target sales revenue calculation for the current calendar month:
        // Finalized budget takes precedence once status is Confirmed (or Completed), fallback to estimated budget
        const thisMonthKey = new Date().toISOString().slice(0, 7);
        const monthlyConfirmedInquiries = visibleInquiries.filter(i => {
            const isConfirmed = i.status === 'Confirmed' || i.status === 'Completed';
            if (!isConfirmed) return false;
            // Check inquiry creation or target event date within current active month
            const inqDate = i.createdAt || i.targetDate || '';
            return inqDate.startsWith(thisMonthKey);
        });

        // Also calculate all-time confirmed revenue for reference
        const confirmedInquiries = visibleInquiries.filter(i => i.status === 'Confirmed' || i.status === 'Completed');
        const confirmedRevenue = (monthlyConfirmedInquiries.length > 0 ? monthlyConfirmedInquiries : confirmedInquiries).reduce((sum, inq) => {
            const amount = Number(inq.finalizedBudget) > 0 ? Number(inq.finalizedBudget) : (Number(inq.estimatedBudget) || 0);
            return sum + amount;
        }, 0);

        const targetProgressPct = salesTarget > 0 ? ((confirmedRevenue / salesTarget) * 100) : 0;
        const targetProgressPctFormatted = targetProgressPct.toFixed(1);

        return {
            total,
            pending,
            pendingPct: calcPct(pending),
            nego,
            negoPct: calcPct(nego),
            confirmed,
            confirmedPct: calcPct(confirmed),
            completed,
            completedPct: calcPct(completed),
            cancelled,
            cancelledPct: calcPct(cancelled),
            activeLeads: pending + nego + confirmed,
            activeLeadsPct: calcPct(pending + nego + confirmed),
            confirmedRevenue,
            targetProgressPct,
            targetProgressPctFormatted
        };
    }, [visibleInquiries, salesTarget]);

    // Overall group target calculation (Unified Organization-wide Event Sales Target for all members)
    const groupSalesTargetProgress = useMemo(() => {
        const thisMonthKey = new Date().toISOString().slice(0, 7);
        // Calculate confirmed revenue across ALL inquiries (group-wide / hotel-wide)
        const monthlyConfirmedInquiries = inquiries.filter(i => {
            const isConfirmed = i.status === 'Confirmed' || i.status === 'Completed';
            if (!isConfirmed) return false;
            const inqDate = i.createdAt || i.targetDate || '';
            return inqDate.startsWith(thisMonthKey);
        });

        const allConfirmedInquiries = inquiries.filter(i => i.status === 'Confirmed' || i.status === 'Completed');
        const confirmedRevenue = (monthlyConfirmedInquiries.length > 0 ? monthlyConfirmedInquiries : allConfirmedInquiries).reduce((sum, inq) => {
            const amount = Number(inq.finalizedBudget) > 0 ? Number(inq.finalizedBudget) : (Number(inq.estimatedBudget) || 0);
            return sum + amount;
        }, 0);

        const targetProgressPct = salesTarget > 0 ? ((confirmedRevenue / salesTarget) * 100) : 0;
        const targetProgressPctFormatted = targetProgressPct.toFixed(1);

        return {
            confirmedCount: allConfirmedInquiries.length,
            confirmedRevenue,
            targetProgressPct,
            targetProgressPctFormatted
        };
    }, [inquiries, salesTarget]);

    // Handler: Auth Login / Logout
    const handleLogin = (user) => {
        setCurrentUser(user);
        try {
            localStorage.setItem('marketing_dashboard_user', JSON.stringify(user));
        } catch (e) { }
    };

    const handleLogout = () => {
        setCurrentUser(null);
        try {
            localStorage.removeItem('marketing_dashboard_user');
        } catch (e) { }
        setActiveTab('dashboard');
        setIsMobileMenuOpen(false);
    };

    // Handler: Create Inquiry
    const handleCreateInquiry = (e) => {
        e.preventDefault();
        if (!isValidEmail(newInquiryForm.email)) {
            alert('Please enter a valid email address (e.g., name@domain.com).');
            return;
        }
        const assignedUser = users.find(u => u.id === newInquiryForm.assignedOfficerId) || currentUser;

        const newEntry = {
            id: `INQ-${1000 + inquiries.length + 1}`,
            ...newInquiryForm,
            guestCount: Number(newInquiryForm.guestCount) || 0,
            estimatedBudget: Number(newInquiryForm.estimatedBudget) || 0,
            finalizedBudget: null,
            status: 'Pending / New',
            assignedOfficerId: assignedUser.id,
            assignedOfficerName: assignedUser.name,
            createdAt: new Date().toISOString().split('T')[0],
            followUpHistory: [
                {
                    date: new Date().toISOString().split('T')[0],
                    note: `Inquiry submitted during field visit by ${currentUser.name}.`,
                    updatedBy: currentUser.name
                }
            ]
        };

        setInquiries([newEntry, ...inquiries]);
        saveInquiryToFirestore(newEntry);

        // Reset Form
        setNewInquiryForm({
            clientName: '',
            contactPerson: '',
            phone: '',
            email: '',
            location: '',
            eventType: 'Corporate Event',
            package: 'Executive Full-Day Conference Package',
            guestCount: '',
            targetDate: '',
            estimatedBudget: '',
            notes: '',
            assignedOfficerId: currentUser.role === 'officer' ? currentUser.id : users.find(u => u.role === 'officer')?.id || users[0].id
        });

        setActiveTab('inquiries');
    };

    // Handler: Update Inquiry
    const handleUpdateInquiry = (updatedInquiry, newNoteText) => {
        if (updatedInquiry.email && !isValidEmail(updatedInquiry.email)) {
            alert('Please enter a valid email address (e.g., name@domain.com).');
            return;
        }
        let finalInquiry = updatedInquiry;
        setInquiries(prev => prev.map(inq => {
            if (inq.id === updatedInquiry.id) {
                const history = [...inq.followUpHistory];
                if (newNoteText && newNoteText.trim() !== '') {
                    history.unshift({
                        date: new Date().toISOString().split('T')[0],
                        note: newNoteText.trim(),
                        updatedBy: currentUser.name
                    });
                }
                finalInquiry = { ...updatedInquiry, followUpHistory: history };
                return finalInquiry;
            }
            return inq;
        }));
        saveInquiryToFirestore(finalInquiry);
        setEditingInquiry(null);
    };

    // Handler: Delete Inquiry
    const handleDeleteInquiry = (id) => {
        setInquiries(prev => prev.filter(inq => inq.id !== id));
        deleteInquiryFromFirestore(id);
        setDeletingInquiryId(null);
    };

    // Handler: Create Visit (Step 01 Record Client Visit)
    const handleCreateVisit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValidEmail(newVisitForm.email)) {
            alert('Please enter a valid email address (e.g., name@domain.com).');
            return;
        }

        const newEntry = {
            id: `VISIT-${1000 + visits.length + 1}`,
            ...newVisitForm,
            officerId: currentUser.id,
            officerName: currentUser.name,
            createdAt: new Date().toISOString()
        };

        setVisits([newEntry, ...visits]);
        saveVisitToFirestore(newEntry);

        // Reset with fresh current date & time
        const now = new Date();
        setNewVisitForm({
            date: now.toISOString().split('T')[0],
            time: now.toTimeString().split(' ')[0].slice(0, 5),
            companyName: '',
            contactPerson: '',
            phone: '',
            email: '',
            clientLocation: '',
            remark: ''
        });

        setActiveTab('visits');
    };

    const handleDeleteVisit = (id: string) => {
        setVisits(prev => prev.filter(v => v.id !== id));
        deleteVisitFromFirestore(id);
        setDeletingVisitId(null);
    };

    // Handler: User Management Operations
    const handleSaveUser = async (e) => {
        e.preventDefault();
        if (!isValidEmail(userFormData.email)) {
            alert('Please enter a valid email address (e.g., name@domain.com).');
            return;
        }
        
        let finalPassword = userFormData.password;
        // If a password was entered or modified, encrypt it before saving
        if (finalPassword && !finalPassword.startsWith('sha256:') && !finalPassword.startsWith('enc:')) {
            finalPassword = await hashPassword(finalPassword);
        }

        if (editingUser) {
            const updated = {
                ...editingUser,
                ...userFormData,
                ...(finalPassword ? { password: finalPassword } : {})
            };
            setUsers(prev => prev.map(u => u.id === editingUser.id ? updated : u));
            saveUserToFirestore(updated);
        } else {
            const newUser = {
                id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                ...userFormData,
                password: finalPassword
            };
            setUsers([...users, newUser]);
            saveUserToFirestore(newUser);
        }
        setUserModalOpen(false);
        setEditingUser(null);
        setShowUserPassword(false);
        setUserFormData({ name: '', email: '', password: '', role: 'officer', department: 'Field Sales' });
    };

    const handleDeleteUser = (userId) => {
        if (users.length <= 1) {
            alert("Cannot delete the last remaining user.");
            return;
        }
        setUsers(prev => prev.filter(u => u.id !== userId));
        deleteUserFromFirestore(userId);
        if (currentUser && currentUser.id === userId) {
            handleLogout();
        }
    };

    // Handler: Event Types & Packages Management (Super Admin)
    const handleAddEventType = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newEventTypeInput.trim();
        if (!trimmed) return;
        if (eventTypes.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
            alert('This event type already exists.');
            return;
        }
        const updated = [...eventTypes, trimmed];
        setEventTypes(updated);
        setNewEventTypeInput('');
        saveConfigToFirestore({ eventTypes: updated, hotelPackages });
    };

    const handleDeleteEventType = (typeToDelete: string) => {
        if (eventTypes.length <= 1) {
            alert('You must have at least one event type.');
            return;
        }
        const updated = eventTypes.filter(t => t !== typeToDelete);
        setEventTypes(updated);
        saveConfigToFirestore({ eventTypes: updated, hotelPackages });
    };

    const handleAddPackage = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newPackageInput.trim();
        if (!trimmed) return;
        if (hotelPackages.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
            alert('This hotel package already exists.');
            return;
        }
        const updated = [...hotelPackages, trimmed];
        setHotelPackages(updated);
        setNewPackageInput('');
        saveConfigToFirestore({ eventTypes, hotelPackages: updated });
    };

    const handleDeletePackage = (packageToDelete: string) => {
        if (hotelPackages.length <= 1) {
            alert('You must have at least one hotel package.');
            return;
        }
        const updated = hotelPackages.filter(p => p !== packageToDelete);
        setHotelPackages(updated);
        saveConfigToFirestore({ eventTypes, hotelPackages: updated });
    };

    // Render Login Page if not authenticated
    if (!currentUser) {
        return (
            <LoginPage
                users={users}
                onLogin={handleLogin}
            />
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col antialiased selection:bg-amber-500 selection:text-slate-900">

            {/* GLOBAL TOP HEADER */}
            <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

                    {/* Logo & Brand */}
                    <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-bold text-xl tracking-wider">
                            M
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-100 tracking-tight leading-none flex items-center gap-2">
                                MARKETING DASHBOARD
                            </h1>
                            <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">Field Sales & Campaign Lead Management</p>
                        </div>
                    </div>

                    {/* Header Right: Cloud Sync Status, Active Profile & Log Out */}
                    <div className="flex items-center gap-3">
                        {isFirebaseConfigured() ? (
                            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
                                <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Firestore Live Sync</span>
                            </div>
                        ) : (
                            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-slate-400 border border-slate-800 text-xs font-medium" title="Configure Firebase in .env to enable cloud sync">
                                <Cloud className="w-3.5 h-3.5 text-slate-500" />
                                <span>Local Mode</span>
                            </div>
                        )}

                        <div className="flex items-center gap-2.5 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold text-xs flex items-center justify-center">
                                {currentUser.name.charAt(0)}
                            </div>
                            <div className="hidden sm:block text-left">
                                <p className="text-xs font-semibold text-slate-200 leading-tight">{currentUser.name}</p>
                                <p className="text-[10px] text-slate-400 leading-tight">{currentUser.department}</p>
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${currentUser.role === 'admin'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : currentUser.role === 'management'
                                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                }`}>
                                {currentUser.role}
                            </span>
                        </div>

                        {/* Log Out Button */}
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-rose-500/15 text-slate-300 hover:text-rose-400 border border-slate-800 hover:border-rose-500/30 text-xs font-medium transition-all shadow-sm"
                            title="Sign out of Marketing Dashboard"
                        >
                            <LogOut className="w-3.5 h-3.5 text-rose-400" />
                            <span className="hidden sm:inline">Log Out</span>
                        </button>

                        {/* Mobile Menu Button */}
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="md:hidden p-2 text-slate-400 hover:text-slate-200 focus:outline-none"
                        >
                            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </header>

            {/* MAIN CONTAINER */}
            <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row gap-6">

                {/* SIDEBAR NAVIGATION */}
                <nav className={`md:w-64 flex-shrink-0 ${isMobileMenuOpen ? 'block' : 'hidden md:block'}`}>
                    <div className="bg-slate-950/70 backdrop-blur-md rounded-2xl border border-slate-800/80 p-3 sticky top-22">

                        {/* User Profile Mini Badge */}
                        <div className="p-3 mb-3 bg-slate-900 rounded-xl border border-slate-800/60 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-800 border border-amber-500/30 text-amber-400 font-bold flex items-center justify-center text-sm shadow">
                                {currentUser.name.charAt(0)}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-xs font-semibold text-slate-200 truncate">{currentUser.name}</p>
                                <p className="text-[11px] text-slate-400 truncate">{currentUser.department}</p>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <button
                                onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
                                className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'dashboard'
                                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-lg shadow-amber-500/20'
                                    : 'text-slate-300 hover:bg-slate-900 hover:text-amber-400'
                                    }`}
                            >
                                <LayoutDashboard className="w-4 h-4" />
                                <span>Dashboard Overview</span>
                            </button>

                            <button
                                onClick={() => { setActiveTab('inquiries'); setIsMobileMenuOpen(false); }}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'inquiries'
                                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-lg shadow-amber-500/20'
                                    : 'text-slate-300 hover:bg-slate-900 hover:text-amber-400'
                                    }`}
                            >
                                <div className="flex items-center space-x-3">
                                    <ClipboardList className="w-4 h-4" />
                                    <span>Inquiry Pipeline</span>
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'inquiries' ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-400'
                                    }`}>
                                    {visibleInquiries.length}
                                </span>
                            </button>

                            <button
                                onClick={() => { setActiveTab('visits'); setIsMobileMenuOpen(false); }}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'visits'
                                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-lg shadow-amber-500/20'
                                    : 'text-slate-300 hover:bg-slate-900 hover:text-amber-400'
                                    }`}
                            >
                                <div className="flex items-center space-x-3">
                                    <MapPin className="w-4 h-4" />
                                    <span>Client Visits</span>
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'visits' ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-400'
                                    }`}>
                                    {visibleVisits.length}
                                </span>
                            </button>

                            {/* Monthly Reports (Accessible to all authenticated users) */}
                            <button
                                onClick={() => { setActiveTab('reports'); setIsMobileMenuOpen(false); }}
                                className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'reports'
                                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-lg shadow-amber-500/20'
                                    : 'text-slate-300 hover:bg-slate-900 hover:text-amber-400'
                                    }`}
                            >
                                <FileText className="w-4 h-4" />
                                <span>Monthly Reports</span>
                            </button>

                            {/* Marketing Officer & Admin can add new records */}
                            {(currentUser.role === 'officer' || currentUser.role === 'admin') && (
                                <>
                                    <button
                                        onClick={() => { setActiveTab('new-inquiry'); setIsMobileMenuOpen(false); }}
                                        className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'new-inquiry'
                                            ? 'bg-amber-500 text-slate-950 font-semibold shadow-lg shadow-amber-500/20'
                                            : 'text-slate-300 hover:bg-slate-900 hover:text-amber-400'
                                            }`}
                                    >
                                        <PlusCircle className="w-4 h-4" />
                                        <span>New Field Inquiry</span>
                                    </button>

                                    <button
                                        onClick={() => {
                                            const now = new Date();
                                            setNewVisitForm(prev => ({
                                                ...prev,
                                                date: now.toISOString().split('T')[0],
                                                time: now.toTimeString().split(' ')[0].slice(0, 5)
                                            }));
                                            setActiveTab('new-visit');
                                            setIsMobileMenuOpen(false);
                                        }}
                                        className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'new-visit'
                                            ? 'bg-amber-500 text-slate-950 font-semibold shadow-lg shadow-amber-500/20'
                                            : 'text-slate-300 hover:bg-slate-900 hover:text-amber-400'
                                            }`}
                                    >
                                        <Compass className="w-4 h-4" />
                                        <span>Add New Visit</span>
                                    </button>
                                </>
                            )}

                            {/* Admin Only Navigation */}
                            {currentUser.role === 'admin' && (
                                <div className="pt-3 mt-3 border-t border-slate-800/80">
                                    <p className="px-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">
                                        Super Admin Controls
                                    </p>
                                    <button
                                        onClick={() => { setActiveTab('users'); setIsMobileMenuOpen(false); }}
                                        className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'users'
                                            ? 'bg-amber-500 text-slate-950 font-semibold shadow-lg shadow-amber-500/20'
                                            : 'text-slate-300 hover:bg-slate-900 hover:text-amber-400'
                                            }`}
                                    >
                                        <Users className="w-4 h-4" />
                                        <span>User Management</span>
                                    </button>

                                    <button
                                        onClick={() => { setActiveTab('packages'); setIsMobileMenuOpen(false); }}
                                        className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all mt-1 ${activeTab === 'packages'
                                            ? 'bg-amber-500 text-slate-950 font-semibold shadow-lg shadow-amber-500/20'
                                            : 'text-slate-300 hover:bg-slate-900 hover:text-amber-400'
                                            }`}
                                    >
                                        <Sliders className="w-4 h-4" />
                                        <span>Event Types & Packages</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Field Sales Banner */}
                        <div className="mt-6 p-3.5 bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl">
                            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
                                <Briefcase className="w-3.5 h-3.5" /> Field Sales Active
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                                Log client details directly on-location. Synchronizes live across sales managers.
                            </p>
                        </div>

                        {/* Sign Out Button in Sidebar */}
                        <div className="mt-3 pt-3 border-t border-slate-800/80">
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center space-x-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-all border border-slate-800/60 hover:border-rose-500/30"
                            >
                                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                                <span>Sign Out</span>
                            </button>
                        </div>

                    </div>
                </nav>

                {/* WORKSPACE AREA */}
                <main className="flex-1 space-y-6 overflow-hidden">

                    {/* TAB 1: DASHBOARD VIEW (STEP 03) */}
                    {activeTab === 'dashboard' && (
                        <div className="space-y-6 animate-fadeIn">

                            {/* Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Campaign Analytics & Dashboard</h2>
                                    <p className="text-slate-400 text-sm">
                                        Real-time performance metric breakdowns {currentUser.role === 'officer' ? '(Personal Field Metrics)' : '(Global Hotel Overview)'}
                                    </p>
                                </div>
                                {(currentUser.role === 'officer' || currentUser.role === 'admin') && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            onClick={() => setActiveTab('new-inquiry')}
                                            className="inline-flex items-center justify-center space-x-2 bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-semibold px-4 py-2.5 rounded-xl shadow-md hover:from-amber-400 hover:to-amber-300 transition-all text-sm"
                                        >
                                            <PlusCircle className="w-4 h-4" />
                                            <span>New Inquiry</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                const now = new Date();
                                                setNewVisitForm(prev => ({
                                                    ...prev,
                                                    date: now.toISOString().split('T')[0],
                                                    time: now.toTimeString().split(' ')[0].slice(0, 5)
                                                }));
                                                setActiveTab('new-visit');
                                            }}
                                            className="inline-flex items-center justify-center space-x-2 bg-slate-900 border border-slate-700 hover:border-amber-500/50 text-amber-400 hover:text-amber-300 font-semibold px-4 py-2.5 rounded-xl shadow-md transition-all text-sm"
                                        >
                                            <Compass className="w-4 h-4" />
                                            <span>Add New Visit</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* INQUIRIES PIPELINE STATUS SECTION */}
                            <section className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                                        <ClipboardList className="w-4 h-4 text-amber-400" />
                                        Inquiries Pipeline Status
                                    </h3>
                                    <span className="text-xs text-slate-400 font-medium">
                                        {stats.total} total inquiries
                                    </span>
                                </div>

                                {/* KPI CARDS WITH NUMERICAL VALUES & PERCENTAGES */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">

                                {/* Total Inquiries */}
                                <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Inquiries</span>
                                        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                                            <ClipboardList className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <div className="mt-4 flex items-baseline justify-between">
                                        <span className="text-3xl font-extrabold text-slate-100">{stats.total}</span>
                                        <span className="text-xs font-medium text-slate-400 bg-slate-900 px-2 py-1 rounded-md border border-slate-800">
                                            100%
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-900 h-1.5 rounded-full mt-3 overflow-hidden">
                                        <div className="bg-blue-500 h-full rounded-full" style={{ width: '100%' }}></div>
                                    </div>
                                </div>

                                {/* 1. Pending / New */}
                                <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending / New</span>
                                        <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                                            <Clock className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <div className="mt-4 flex items-baseline justify-between">
                                        <span className="text-3xl font-extrabold text-amber-400">{stats.pending}</span>
                                        <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                                            {stats.pendingPct}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-900 h-1.5 rounded-full mt-3 overflow-hidden">
                                        <div className="bg-amber-500 h-full rounded-full" style={{ width: `${stats.pendingPct}%` }}></div>
                                    </div>
                                </div>

                                {/* 2. Nego. */}
                                <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Nego.</span>
                                        <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                                            <Clock className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <div className="mt-4 flex items-baseline justify-between">
                                        <span className="text-3xl font-extrabold text-indigo-400">{stats.nego}</span>
                                        <span className="text-xs font-semibold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
                                            {stats.negoPct}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-900 h-1.5 rounded-full mt-3 overflow-hidden">
                                        <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${stats.negoPct}%` }}></div>
                                    </div>
                                </div>

                                {/* 3. Confirmed */}
                                <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Confirmed</span>
                                        <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
                                            <CheckCircle2 className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <div className="mt-4 flex items-baseline justify-between">
                                        <span className="text-3xl font-extrabold text-cyan-400">{stats.confirmed}</span>
                                        <span className="text-xs font-semibold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-md border border-cyan-500/20">
                                            {stats.confirmedPct}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-900 h-1.5 rounded-full mt-3 overflow-hidden">
                                        <div className="bg-cyan-500 h-full rounded-full" style={{ width: `${stats.confirmedPct}%` }}></div>
                                    </div>
                                </div>

                                {/* 4. Completed */}
                                <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completed</span>
                                        <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                                            <CheckCircle2 className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <div className="mt-4 flex items-baseline justify-between">
                                        <span className="text-3xl font-extrabold text-emerald-400">{stats.completed}</span>
                                        <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                                            {stats.completedPct}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-900 h-1.5 rounded-full mt-3 overflow-hidden">
                                        <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${stats.completedPct}%` }}></div>
                                    </div>
                                </div>

                                {/* 5. Cancelled / Lost */}
                                <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cancelled / Lost</span>
                                        <div className="p-2 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20">
                                            <XCircle className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <div className="mt-4 flex items-baseline justify-between">
                                        <span className="text-3xl font-extrabold text-rose-400">{stats.cancelled}</span>
                                        <span className="text-xs font-semibold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-md border border-rose-500/20">
                                            {stats.cancelledPct}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-900 h-1.5 rounded-full mt-3 overflow-hidden">
                                        <div className="bg-rose-500 h-full rounded-full" style={{ width: `${stats.cancelledPct}%` }}></div>
                                    </div>
                                </div>

                                </div>
                            </section>

                            {/* SECTION: EVENT TARGET SALES PROGRESS (UNIFIED GROUP TARGET FOR ALL USERS) */}
                            <div className="bg-slate-950/90 rounded-2xl border border-amber-500/30 p-6 space-y-5 shadow-2xl relative overflow-hidden">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                                            <Target className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-slate-100 text-lg">
                                                    Event Target Sales Progress
                                                </h3>
                                                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                    Group Target (Admin View)
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                Unified organization-wide sales benchmark across all team members for {salesTargetMonth}
                                            </p>
                                        </div>
                                    </div>

                                    {currentUser.role === 'admin' && (
                                        <button
                                            onClick={() => setActiveTab('packages')}
                                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-semibold rounded-xl border border-slate-800 transition"
                                        >
                                            <Sliders className="w-3.5 h-3.5" />
                                            <span>Adjust Target (Super Admin)</span>
                                        </button>
                                    )}
                                </div>

                                {/* KPI Revenue Stats Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    {/* 1. Confirmed Inquiries Revenue (Hotel / Group Total) */}
                                    <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
                                        <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider block">
                                            Total Confirmed Sales (Group)
                                        </span>
                                        <div className="mt-2 flex items-baseline gap-2">
                                            <span className="text-2xl font-black text-slate-100 font-mono">
                                                LKR {groupSalesTargetProgress.confirmedRevenue.toLocaleString()}
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-slate-500 mt-1 block">
                                            Aggregated across {groupSalesTargetProgress.confirmedCount} confirmed bookings
                                        </span>
                                    </div>

                                    {/* 2. Admin Sales Target */}
                                    <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider block">
                                                Target Sales Amount (100%)
                                            </span>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-mono border border-amber-500/20">
                                                Renewed {salesTargetMonth}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-baseline gap-2">
                                            <span className="text-2xl font-black text-amber-400 font-mono">
                                                LKR {salesTarget.toLocaleString()}
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-slate-500 mt-1 block">
                                            Monthly quota • Renews 1st of every month
                                        </span>
                                    </div>

                                    {/* 3. Target Achievement Percentage */}
                                    <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
                                        <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider block">
                                            Group Achievement Progress
                                        </span>
                                        <div className="mt-2 flex items-baseline gap-2">
                                            <span className="text-2xl font-black text-cyan-400">
                                                {groupSalesTargetProgress.targetProgressPctFormatted}%
                                            </span>
                                            <span className="text-xs text-slate-400">
                                                {groupSalesTargetProgress.targetProgressPct >= 100 ? 'Target Achieved! 🎉' : `of 100% target`}
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-slate-500 mt-1 block">
                                            {groupSalesTargetProgress.confirmedRevenue >= salesTarget ? 'Surpassed goal' : `LKR ${(salesTarget - groupSalesTargetProgress.confirmedRevenue).toLocaleString()} remaining`}
                                        </span>
                                    </div>
                                </div>

                                {/* Dynamic Animated Progress Bar */}
                                <div className="space-y-2 pt-1">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-400 font-medium flex items-center gap-1.5">
                                            <Award className="w-3.5 h-3.5 text-amber-400" />
                                            Group Target Fulfillment
                                        </span>
                                        <span className="font-mono font-bold text-amber-400">
                                            {groupSalesTargetProgress.targetProgressPctFormatted}% Achieved
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-900 h-4 rounded-full overflow-hidden p-0.5 border border-slate-800 relative">
                                        <div
                                            className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-amber-500 via-emerald-400 to-cyan-400 shadow-lg"
                                            style={{ width: `${Math.min(100, Math.max(0, groupSalesTargetProgress.targetProgressPct))}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                                        <span>LKR 0 (0%)</span>
                                        <span>50%</span>
                                        <span>Target: LKR {salesTarget.toLocaleString()} (100%)</span>
                                    </div>
                                </div>
                            </div>

                            {/* SEPARATE SECTION: CLIENT VISITS ACTIVITY WIDGET */}
                            <div className="bg-slate-950/90 rounded-2xl border border-slate-800 p-6 space-y-4 shadow-xl">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                                            <Compass className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                                                Client Field Visits Summary
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                    Activity Tracker
                                                </span>
                                            </h3>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                Track field visits, client location interactions, and officer activity distinct from formal inquiries
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {(currentUser.role === 'officer' || currentUser.role === 'admin') && (
                                            <button
                                                onClick={() => {
                                                    const now = new Date();
                                                    setNewVisitForm(prev => ({
                                                        ...prev,
                                                        date: now.toISOString().split('T')[0],
                                                        time: now.toTimeString().split(' ')[0].slice(0, 5)
                                                    }));
                                                    setActiveTab('new-visit');
                                                }}
                                                className="inline-flex items-center space-x-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs transition shadow"
                                            >
                                                <PlusCircle className="w-3.5 h-3.5" />
                                                <span>+ Record Visit</span>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setActiveTab('visits')}
                                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl border border-slate-800 transition flex items-center gap-1"
                                        >
                                            <span>View All Visits</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
                                    {/* Total Visits Logged */}
                                    <div className="p-4 bg-slate-900/70 border border-slate-800/80 rounded-xl relative overflow-hidden group hover:border-slate-700 transition">
                                        <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                                            <span>Total Visits Logged</span>
                                            <MapPin className="w-4 h-4 text-amber-400" />
                                        </div>
                                        <div className="mt-3 flex items-baseline justify-between">
                                            <span className="text-3xl font-extrabold text-amber-400">{visibleVisits.length}</span>
                                            <span className="text-[11px] text-slate-400">
                                                {currentUser.role === 'officer' ? 'Your logged visits' : 'Across all officers'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Visits Conducted Today */}
                                    <div className="p-4 bg-slate-900/70 border border-slate-800/80 rounded-xl relative overflow-hidden group hover:border-slate-700 transition">
                                        <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                                            <span>Visits Today</span>
                                            <Calendar className="w-4 h-4 text-emerald-400" />
                                        </div>
                                        <div className="mt-3 flex items-baseline justify-between">
                                            <span className="text-3xl font-extrabold text-emerald-400">
                                                {visibleVisits.filter(v => v.date === new Date().toISOString().split('T')[0]).length}
                                            </span>
                                            <span className="text-[11px] text-slate-400 font-mono">
                                                {new Date().toISOString().split('T')[0]}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Unique Companies Visited */}
                                    <div className="p-4 bg-slate-900/70 border border-slate-800/80 rounded-xl relative overflow-hidden group hover:border-slate-700 transition">
                                        <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                                            <span>Companies Visited</span>
                                            <Building className="w-4 h-4 text-blue-400" />
                                        </div>
                                        <div className="mt-3 flex items-baseline justify-between">
                                            <span className="text-3xl font-extrabold text-blue-400">
                                                {new Set(visibleVisits.map(v => (v.companyName || '').trim().toLowerCase()).filter(Boolean)).size}
                                            </span>
                                            <span className="text-[11px] text-slate-400">Distinct clients</span>
                                        </div>
                                    </div>

                                    {/* Active Officers Deploying */}
                                    <div className="p-4 bg-slate-900/70 border border-slate-800/80 rounded-xl relative overflow-hidden group hover:border-slate-700 transition">
                                        <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
                                            <span>Active Officers</span>
                                            <UserCheck className="w-4 h-4 text-purple-400" />
                                        </div>
                                        <div className="mt-3 flex items-baseline justify-between">
                                            <span className="text-3xl font-extrabold text-purple-400">
                                                {new Set(visibleVisits.map(v => v.officerId || v.officerName).filter(Boolean)).size}
                                            </span>
                                            <span className="text-[11px] text-slate-400">Contributing staff</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}

                    {/* TAB 2: FIELD DATA COLLECTION FORM (STEP 01 - MOBILE RESPONSIVE) */}
                    {activeTab === 'new-inquiry' && (
                        <div className="max-w-3xl mx-auto space-y-6 animate-fadeIn">

                            <div className="bg-slate-950/90 p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-2xl">

                                <div className="border-b border-slate-800 pb-5 mb-6">
                                    <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold uppercase tracking-widest mb-1">
                                        <Building className="w-4 h-4" /> Field Client Visit Form (Step 01)
                                    </div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-slate-100">Record New Client Inquiry</h2>
                                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                                        Gather client requirements on-site and instantly sync with the hotel sales system.
                                    </p>
                                </div>

                                <form onSubmit={handleCreateInquiry} className="space-y-5">

                                    {/* CLIENT BASIC DETAILS */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                                Client Company / Organization *
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="e.g. Apex Tech Solutions"
                                                value={newInquiryForm.clientName}
                                                onChange={(e) => setNewInquiryForm({ ...newInquiryForm, clientName: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                                Contact Person Name *
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="e.g. Robert Vance"
                                                value={newInquiryForm.contactPerson}
                                                onChange={(e) => setNewInquiryForm({ ...newInquiryForm, contactPerson: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                            />
                                        </div>
                                    </div>

                                    {/* CONTACT INFO */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                                Phone Number *
                                            </label>
                                            <input
                                                type="tel"
                                                required
                                                placeholder="e.g. +1 (555) 234-5678"
                                                value={newInquiryForm.phone}
                                                onChange={(e) => setNewInquiryForm({ ...newInquiryForm, phone: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                                Email Address *
                                            </label>
                                            <input
                                                type="email"
                                                required
                                                placeholder="e.g. rvance@apextech.com"
                                                value={newInquiryForm.email}
                                                onChange={(e) => setNewInquiryForm({ ...newInquiryForm, email: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                            />
                                        </div>
                                    </div>

                                    {/* LOCATION */}
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                            Visited Client Location / Address *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. Tech Park, Building 4, Suite 200, North District"
                                            value={newInquiryForm.location}
                                            onChange={(e) => setNewInquiryForm({ ...newInquiryForm, location: e.target.value })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                        />
                                    </div>

                                    {/* EVENT TYPE & PACKAGE SELECTION */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                                Event Type
                                            </label>
                                            <select
                                                value={newInquiryForm.eventType}
                                                onChange={(e) => setNewInquiryForm({ ...newInquiryForm, eventType: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                                            >
                                                {eventTypes.map(type => (
                                                    <option key={type} value={type}>{type}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                                Hotel Package Interested In
                                            </label>
                                            <select
                                                value={newInquiryForm.package}
                                                onChange={(e) => setNewInquiryForm({ ...newInquiryForm, package: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                                            >
                                                {hotelPackages.map(pkg => (
                                                    <option key={pkg} value={pkg}>{pkg}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* GUESTS & TARGET DATE & ESTIMATED BUDGET */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                                Expected Guests
                                            </label>
                                            <input
                                                type="number"
                                                placeholder="e.g. 150"
                                                value={newInquiryForm.guestCount}
                                                onChange={(e) => setNewInquiryForm({ ...newInquiryForm, guestCount: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                                Target Event Date
                                            </label>
                                            <input
                                                type="date"
                                                value={newInquiryForm.targetDate}
                                                onChange={(e) => setNewInquiryForm({ ...newInquiryForm, targetDate: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1.5">
                                                Estimated Budget (LKR)
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                placeholder="e.g. 250000"
                                                value={newInquiryForm.estimatedBudget}
                                                onChange={(e) => setNewInquiryForm({ ...newInquiryForm, estimatedBudget: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                                            />
                                        </div>
                                    </div>

                                    {/* ASSIGNED MARKETING OFFICER (ADMIN ONLY OVERRIDE) */}
                                    {currentUser.role === 'admin' && (
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                                Assign Marketing Officer (Super Admin Privilege)
                                            </label>
                                            <select
                                                value={newInquiryForm.assignedOfficerId}
                                                onChange={(e) => setNewInquiryForm({ ...newInquiryForm, assignedOfficerId: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-amber-300 focus:outline-none focus:border-amber-500 font-medium"
                                            >
                                                {users.filter(u => u.role === 'officer' || u.role === 'admin').map(u => (
                                                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* SPECIAL NOTES */}
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                            Client Field Notes & Requirements
                                        </label>
                                        <textarea
                                            rows={3}
                                            placeholder="Note down specific food preferences, AV requirements, hall preferences, or key discussions..."
                                            value={newInquiryForm.notes}
                                            onChange={(e) => setNewInquiryForm({ ...newInquiryForm, notes: e.target.value })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                        />
                                    </div>

                                    {/* SUBMIT BUTTON */}
                                    <div className="pt-3 flex gap-3">
                                        <button
                                            type="submit"
                                            className="flex-1 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold py-3 px-6 rounded-xl shadow-lg shadow-amber-500/20 transition text-sm flex items-center justify-center gap-2"
                                        >
                                            <PlusCircle className="w-5 h-5" />
                                            <span>Submit Client Inquiry</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('inquiries')}
                                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 px-5 rounded-xl border border-slate-700 transition text-sm"
                                        >
                                            Cancel
                                        </button>
                                    </div>

                                </form>

                            </div>

                        </div>
                    )}

                    {/* TAB 3: INQUIRY TABLE & FOLLOW-UP MANAGEMENT (STEP 02) */}
                    {activeTab === 'inquiries' && (
                        <div className="space-y-6 animate-fadeIn">

                            {/* Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-100 tracking-tight">
                                        Inquiry Follow-Up Pipeline (Step 02)
                                    </h2>
                                    <p className="text-slate-400 text-xs sm:text-sm">
                                        {currentUser.role === 'officer'
                                            ? 'Showing inquiries assigned specifically to your officer account.'
                                            : 'Showing master list of all inquiries across the organization.'}
                                    </p>
                                </div>

                                {(currentUser.role === 'officer' || currentUser.role === 'admin') && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            onClick={() => setActiveTab('new-inquiry')}
                                            className="inline-flex items-center space-x-2 bg-amber-500 text-slate-950 font-semibold px-4 py-2.5 rounded-xl shadow hover:bg-amber-400 transition text-sm"
                                        >
                                            <PlusCircle className="w-4 h-4" />
                                            <span>+ Add Inquiry</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                const now = new Date();
                                                setNewVisitForm(prev => ({
                                                    ...prev,
                                                    date: now.toISOString().split('T')[0],
                                                    time: now.toTimeString().split(' ')[0].slice(0, 5)
                                                }));
                                                setActiveTab('new-visit');
                                            }}
                                            className="inline-flex items-center space-x-2 bg-slate-900 border border-slate-700 hover:border-amber-500/50 text-amber-400 hover:text-amber-300 font-semibold px-4 py-2.5 rounded-xl shadow transition text-sm"
                                        >
                                            <Compass className="w-4 h-4" />
                                            <span>Add New Visit</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* BAR: SEARCH & STATUS FILTER */}
                            <div className="flex flex-col sm:flex-row gap-3 bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                                <div className="relative flex-1">
                                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                                    <input
                                        type="text"
                                        placeholder="Search by client name, contact, location or ID..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <Filter className="w-4 h-4 text-slate-400" />
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-amber-300 font-medium focus:outline-none focus:border-amber-500"
                                    >
                                        <option value="All">All Statuses</option>
                                        <option value="Pending / New">Pending / New</option>
                                        <option value="Nego.">Nego.</option>
                                        <option value="Confirmed">Confirmed</option>
                                        <option value="Completed">Completed</option>
                                        <option value="Cancelled / Lost">Cancelled / Lost</option>
                                    </select>
                                </div>
                            </div>

                            {/* INQUIRY DATA TABLE VIEW */}
                            <div className="bg-slate-950/80 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                                <th className="py-3.5 px-4">Ref / Client</th>
                                                <th className="py-3.5 px-4">Contact Info</th>
                                                <th className="py-3.5 px-4">Event Details</th>
                                                <th className="py-3.5 px-4">Assigned Officer</th>
                                                <th className="py-3.5 px-4">Status</th>
                                                <th className="py-3.5 px-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/60 text-sm">
                                            {filteredInquiries.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="py-12 text-center text-slate-500">
                                                        No sales inquiries match the selected criteria.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredInquiries.map((inq) => {
                                                    const canEdit = currentUser.role === 'admin' ||
                                                        (currentUser.role === 'officer' && inq.assignedOfficerId === currentUser.id);
                                                    const canDelete = currentUser.role === 'admin' ||
                                                        (currentUser.role === 'officer' && inq.assignedOfficerId === currentUser.id);

                                                    return (
                                                        <tr key={inq.id} className="hover:bg-slate-900/40 transition">

                                                            {/* Ref & Client */}
                                                            <td className="py-3.5 px-4">
                                                                <span className="text-[10px] font-mono bg-slate-800 text-amber-400 px-2 py-0.5 rounded border border-slate-700">
                                                                    {inq.id}
                                                                </span>
                                                                <p className="font-semibold text-slate-100 mt-1">{inq.clientName}</p>
                                                                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                                                    <MapPin className="w-3 h-3 text-slate-500" /> {inq.location}
                                                                </p>
                                                            </td>

                                                            {/* Contact Person */}
                                                            <td className="py-3.5 px-4 text-xs">
                                                                <p className="font-medium text-slate-200">{inq.contactPerson}</p>
                                                                <p className="text-slate-400">{inq.phone}</p>
                                                                <p className="text-slate-500 text-[11px]">{inq.email}</p>
                                                            </td>

                                                            {/* Event Details */}
                                                            <td className="py-3.5 px-4 text-xs">
                                                                <p className="font-semibold text-amber-300">{inq.eventType}</p>
                                                                <p className="text-slate-400">{inq.package}</p>
                                                                <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-400">
                                                                    <span>{inq.guestCount} Guests</span>
                                                                    <span>•</span>
                                                                    <span>{inq.targetDate || 'TBD'}</span>
                                                                    {inq.finalizedBudget ? (
                                                                        <>
                                                                            <span>•</span>
                                                                            <span className="font-mono font-bold text-emerald-400">
                                                                                LKR {Number(inq.finalizedBudget).toLocaleString()} (Final)
                                                                            </span>
                                                                        </>
                                                                    ) : inq.estimatedBudget ? (
                                                                        <>
                                                                            <span>•</span>
                                                                            <span className="font-mono text-slate-400">
                                                                                LKR {Number(inq.estimatedBudget).toLocaleString()} (Est.)
                                                                            </span>
                                                                        </>
                                                                    ) : null}
                                                                </div>
                                                            </td>

                                                            {/* Assigned Officer */}
                                                            <td className="py-3.5 px-4 text-xs">
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
                                                                    <UserCheck className="w-3 h-3 text-amber-400" />
                                                                    {inq.assignedOfficerName}
                                                                </span>
                                                            </td>

                                                            {/* Status Badge */}
                                                            <td className="py-3.5 px-4">
                                                                {renderStatusBadge(inq.status)}
                                                            </td>

                                                            {/* Action Buttons */}
                                                            <td className="py-3.5 px-4 text-right space-x-2">
                                                                {canEdit ? (
                                                                    <button
                                                                        onClick={() => setEditingInquiry(inq)}
                                                                        className="p-2 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-slate-300 rounded-lg border border-slate-800 transition"
                                                                        title="Edit inquiry details"
                                                                    >
                                                                        <Edit3 className="w-4 h-4" />
                                                                    </button>
                                                                ) : (
                                                                    <span className="text-xs text-slate-600 italic">View Only</span>
                                                                )}

                                                                {canDelete && (
                                                                    <button
                                                                        onClick={() => setDeletingInquiryId(inq.id)}
                                                                        className="p-2 bg-slate-900 hover:bg-rose-500 hover:text-white text-slate-400 rounded-lg border border-slate-800 transition"
                                                                        title="Delete inquiry"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                            </td>

                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        </div>
                    )}

                    {/* TAB: RECORD NEW CLIENT VISIT */}
                    {activeTab === 'new-visit' && (currentUser.role === 'officer' || currentUser.role === 'admin') && (
                        <div className="max-w-3xl mx-auto space-y-6 animate-fadeIn">
                            <div className="bg-slate-950/90 p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-2xl">
                                <div className="border-b border-slate-800 pb-5 mb-6">
                                    <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold uppercase tracking-widest mb-1">
                                        <Compass className="w-4 h-4" /> Field Client Visit Form
                                    </div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-slate-100">Record Client Visit</h2>
                                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                                        Log in-person meetings, site visits, and direct client interactions with auto-captured date and time.
                                    </p>
                                </div>

                                <form onSubmit={handleCreateVisit} className="space-y-5">
                                    {/* 1. DATE & 2. TIME (AUTO PICKUP) */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-900/60 rounded-xl border border-slate-800/80">
                                        <div>
                                            <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                                <Calendar className="w-3.5 h-3.5" /> 1. Visit Date (Auto Pickup) *
                                            </label>
                                            <input
                                                type="date"
                                                required
                                                value={newVisitForm.date}
                                                onChange={(e) => setNewVisitForm({ ...newVisitForm, date: e.target.value })}
                                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5" /> 2. Visit Time (Auto Pickup) *
                                            </label>
                                            <input
                                                type="time"
                                                required
                                                value={newVisitForm.time}
                                                onChange={(e) => setNewVisitForm({ ...newVisitForm, time: e.target.value })}
                                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                                            />
                                        </div>
                                    </div>

                                    {/* 3. COMPANY / ORGANIZATION */}
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                            3. Company / Organization *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. Grand Horizon Logistics Corp"
                                            value={newVisitForm.companyName}
                                            onChange={(e) => setNewVisitForm({ ...newVisitForm, companyName: e.target.value })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                        />
                                    </div>

                                    {/* 4. CONTACT PERSON NAME */}
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                            4. Contact Person Name *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. Mr. Samantha Perera"
                                            value={newVisitForm.contactPerson}
                                            onChange={(e) => setNewVisitForm({ ...newVisitForm, contactPerson: e.target.value })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                        />
                                    </div>

                                    {/* 5. PHONE & 6. EMAIL */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                                5. Phone Number (Contact Person's) *
                                            </label>
                                            <input
                                                type="tel"
                                                required
                                                placeholder="e.g. +94 77 123 4567"
                                                value={newVisitForm.phone}
                                                onChange={(e) => setNewVisitForm({ ...newVisitForm, phone: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                                6. Email Address (Contact Person's) *
                                            </label>
                                            <input
                                                type="email"
                                                required
                                                placeholder="e.g. contact@company.lk"
                                                value={newVisitForm.email}
                                                onChange={(e) => setNewVisitForm({ ...newVisitForm, email: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                            />
                                        </div>
                                    </div>

                                    {/* 7. VISITED CLIENT LOCATION / ADDRESS */}
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                            7. Visited Client Location / Address *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. Head Office 3rd Floor, Mirijjawila Industrial Zone, Hambantota"
                                            value={newVisitForm.clientLocation}
                                            onChange={(e) => setNewVisitForm({ ...newVisitForm, clientLocation: e.target.value })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                        />
                                    </div>

                                    {/* 8. REMARK */}
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                            8. Remark / Observations
                                        </label>
                                        <textarea
                                            rows={3}
                                            placeholder="Enter discussion summary, follow-up schedule, client interest level..."
                                            value={newVisitForm.remark}
                                            onChange={(e) => setNewVisitForm({ ...newVisitForm, remark: e.target.value })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                        />
                                    </div>

                                    {/* SUBMIT BUTTONS */}
                                    <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('visits')}
                                            className="px-5 py-2.5 bg-slate-900 text-slate-300 hover:bg-slate-800 text-sm font-semibold rounded-xl border border-slate-800 transition"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 text-sm font-bold rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-2"
                                        >
                                            <Compass className="w-4 h-4" />
                                            <span>Save Visit Record</span>
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* TAB: VISITS LOG TABLE */}
                    {activeTab === 'visits' && (
                        <div className="space-y-6 animate-fadeIn">
                            {/* Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-100 tracking-tight">
                                        Client Visit Logs
                                    </h2>
                                    <p className="text-slate-400 text-xs sm:text-sm">
                                        {currentUser.role === 'officer'
                                            ? 'Showing client visits conducted by your officer account.'
                                            : currentUser.role === 'management'
                                                ? 'Showing all company visit records across field officers (View Only).'
                                                : 'Showing master list of all recorded visits across the organization (Full Admin Control).'}
                                    </p>
                                </div>

                                {(currentUser.role === 'officer' || currentUser.role === 'admin') && (
                                    <button
                                        onClick={() => {
                                            const now = new Date();
                                            setNewVisitForm(prev => ({
                                                ...prev,
                                                date: now.toISOString().split('T')[0],
                                                time: now.toTimeString().split(' ')[0].slice(0, 5)
                                            }));
                                            setActiveTab('new-visit');
                                        }}
                                        className="inline-flex items-center space-x-2 bg-amber-500 text-slate-950 font-semibold px-4 py-2.5 rounded-xl shadow hover:bg-amber-400 transition text-sm"
                                    >
                                        <Compass className="w-4 h-4" />
                                        <span>+ Add New Visit</span>
                                    </button>
                                )}
                            </div>

                            {/* SEARCH BAR */}
                            <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                                <div className="relative">
                                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                                    <input
                                        type="text"
                                        placeholder="Search visits by company, contact person, address, or ID..."
                                        value={visitSearchTerm}
                                        onChange={(e) => setVisitSearchTerm(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                    />
                                </div>
                            </div>

                            {/* VISITS TABLE */}
                            <div className="bg-slate-950/80 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                                <th className="py-3.5 px-4">Date & Time</th>
                                                <th className="py-3.5 px-4">Company / Organization</th>
                                                <th className="py-3.5 px-4">Contact Person</th>
                                                <th className="py-3.5 px-4">Visited Client Location / Address</th>
                                                <th className="py-3.5 px-4">Logged By</th>
                                                <th className="py-3.5 px-4">Remark</th>
                                                {currentUser.role === 'admin' && (
                                                    <th className="py-3.5 px-4 text-right">Actions</th>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/60 text-sm">
                                            {filteredVisits.length === 0 ? (
                                                <tr>
                                                    <td colSpan={currentUser.role === 'admin' ? 7 : 6} className="py-12 text-center text-slate-500">
                                                        No visit records found. Click "+ Add New Visit" to record a field visit.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredVisits.map((v) => (
                                                    <tr key={v.id} className="hover:bg-slate-900/40 transition">
                                                        <td className="py-3.5 px-4 text-xs font-mono">
                                                            <div className="text-amber-400 font-semibold flex items-center gap-1">
                                                                <Calendar className="w-3 h-3" /> {v.date}
                                                            </div>
                                                            <div className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                                                                <Clock className="w-3 h-3" /> {v.time}
                                                            </div>
                                                        </td>
                                                        <td className="py-3.5 px-4">
                                                            <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                                                                {v.id}
                                                            </span>
                                                            <p className="font-semibold text-slate-100 mt-1">{v.companyName}</p>
                                                        </td>
                                                        <td className="py-3.5 px-4 text-xs">
                                                            <p className="font-medium text-slate-200">{v.contactPerson}</p>
                                                            <p className="text-slate-400 flex items-center gap-1 mt-0.5">
                                                                <Phone className="w-3 h-3 text-slate-500" /> {v.phone}
                                                            </p>
                                                            <p className="text-slate-500 text-[11px] flex items-center gap-1 mt-0.5">
                                                                <Mail className="w-3 h-3 text-slate-500" /> {v.email}
                                                            </p>
                                                        </td>
                                                        <td className="py-3.5 px-4 text-xs max-w-xs">
                                                            <p className="text-slate-200 flex items-start gap-1">
                                                                <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                                                                <span>{v.clientLocation || v.visitedAddress}</span>
                                                            </p>
                                                        </td>
                                                        <td className="py-3.5 px-4 text-xs">
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
                                                                <UserCheck className="w-3 h-3 text-amber-400" />
                                                                {v.officerName || 'Officer'}
                                                            </span>
                                                        </td>
                                                        <td className="py-3.5 px-4 text-xs max-w-xs">
                                                            <p className="text-slate-300 line-clamp-2">
                                                                {v.remark || <span className="text-slate-600 italic">No remark</span>}
                                                            </p>
                                                        </td>
                                                        {currentUser.role === 'admin' && (
                                                            <td className="py-3.5 px-4 text-right">
                                                                <button
                                                                    onClick={() => setDeletingVisitId(v.id)}
                                                                    className="p-2 bg-slate-900 hover:bg-rose-500 hover:text-white text-slate-400 rounded-lg border border-slate-800 transition"
                                                                    title="Delete visit record"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 4: USER MANAGEMENT PANEL (ADMIN ONLY) */}
                    {activeTab === 'users' && currentUser.role === 'admin' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Staff & User Management</h2>
                                    <p className="text-slate-400 text-sm">Create, update roles, and control access permissions across marketing personnel.</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setEditingUser(null);
                                        setShowUserPassword(false);
                                        setUserFormData({ name: '', email: '', password: '', role: 'officer', department: 'Field Sales' });
                                        setUserModalOpen(true);
                                    }}
                                    className="inline-flex items-center space-x-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl shadow transition text-sm"
                                >
                                    <PlusCircle className="w-4 h-4" />
                                    <span>Create User Account</span>
                                </button>
                            </div>

                            {/* Users Table */}
                            <div className="bg-slate-950/80 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                            <th className="py-3.5 px-4">User Name & Email</th>
                                            <th className="py-3.5 px-4">Role Permission</th>
                                            <th className="py-3.5 px-4">Department</th>
                                            <th className="py-3.5 px-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60 text-sm">
                                        {users.map(u => (
                                            <tr key={u.id} className="hover:bg-slate-900/40">
                                                <td className="py-3.5 px-4">
                                                    <p className="font-semibold text-slate-100">{u.name}</p>
                                                    <p className="text-xs text-slate-400">{u.email}</p>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${u.role === 'admin'
                                                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                                        : u.role === 'management'
                                                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                        }`}>
                                                        {u.role}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 text-slate-300 text-xs">
                                                    {u.department}
                                                </td>
                                                <td className="py-3.5 px-4 text-right space-x-2">
                                                    <button
                                                        onClick={() => {
                                                            setEditingUser(u);
                                                            setUserFormData({ name: u.name, email: u.email, password: '', role: u.role, department: u.department });
                                                            setUserModalOpen(true);
                                                        }}
                                                        className="p-2 bg-slate-900 hover:bg-purple-600 hover:text-white text-slate-300 rounded-lg border border-slate-800 transition"
                                                    >
                                                        <Edit3 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(u.id)}
                                                        className="p-2 bg-slate-900 hover:bg-rose-600 hover:text-white text-slate-400 rounded-lg border border-slate-800 transition"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB 5: EVENT TYPES & HOTEL PACKAGES (SUPER ADMIN ONLY) */}
                    {activeTab === 'packages' && currentUser.role === 'admin' && (
                        <div className="space-y-8 animate-fadeIn">
                            <div>
                                <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold uppercase tracking-widest mb-1">
                                    <Sliders className="w-4 h-4" /> Master Settings
                                </div>
                                <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Event Types & Hotel Packages</h2>
                                <p className="text-slate-400 text-sm mt-1">
                                    Add, update, or remove options available in field inquiries and sales forms.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* EVENT TYPES SECTION */}
                                <div className="bg-slate-950/90 rounded-2xl border border-slate-800 p-6 space-y-5 shadow-xl">
                                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                        <div className="flex items-center space-x-2.5">
                                            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                                                <Layers className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-slate-100 text-base">Event Types</h3>
                                                <p className="text-xs text-slate-400">{eventTypes.length} types registered</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Add Event Type Form */}
                                    <form onSubmit={handleAddEventType} className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="e.g. Exhibitions & Trade Fairs"
                                            value={newEventTypeInput}
                                            onChange={(e) => setNewEventTypeInput(e.target.value)}
                                            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                                        />
                                        <button
                                            type="submit"
                                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow"
                                        >
                                            <PlusCircle className="w-4 h-4" />
                                            <span>Add</span>
                                        </button>
                                    </form>

                                    {/* Event Types List */}
                                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                                        {eventTypes.map((type, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between p-3 bg-slate-900/70 border border-slate-800/80 rounded-xl hover:border-slate-700 transition"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-400 text-xs font-semibold flex items-center justify-center">
                                                        {idx + 1}
                                                    </span>
                                                    <span className="text-sm font-medium text-slate-200">{type}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteEventType(type)}
                                                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                                                    title="Delete event type"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* HOTEL PACKAGES SECTION */}
                                <div className="bg-slate-950/90 rounded-2xl border border-slate-800 p-6 space-y-5 shadow-xl">
                                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                        <div className="flex items-center space-x-2.5">
                                            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl">
                                                <Package className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-slate-100 text-base">Hotel Packages</h3>
                                                <p className="text-xs text-slate-400">{hotelPackages.length} packages registered</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Add Package Form */}
                                    <form onSubmit={handleAddPackage} className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="e.g. VIP Presidential Suite Package"
                                            value={newPackageInput}
                                            onChange={(e) => setNewPackageInput(e.target.value)}
                                            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                                        />
                                        <button
                                            type="submit"
                                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow"
                                        >
                                            <PlusCircle className="w-4 h-4" />
                                            <span>Add</span>
                                        </button>
                                    </form>

                                    {/* Packages List */}
                                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                                        {hotelPackages.map((pkg, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between p-3 bg-slate-900/70 border border-slate-800/80 rounded-xl hover:border-slate-700 transition"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-400 text-xs font-semibold flex items-center justify-center">
                                                        {idx + 1}
                                                    </span>
                                                    <span className="text-sm font-medium text-slate-200">{pkg}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleDeletePackage(pkg)}
                                                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                                                    title="Delete package"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* TARGET SALES AMOUNT SETTING CARD (SUPER ADMIN PREMISES) */}
                            <div className="bg-slate-950/90 rounded-2xl border border-amber-500/30 p-6 space-y-4 shadow-xl">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                                            <Target className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-100 text-lg flex items-center gap-2">
                                                Event Sales Target Setting
                                                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                                                    Super Admin Premises
                                                </span>
                                            </h3>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                Define the benchmark target revenue for event inquiries. This represents 100% on the dashboard progress bar.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-baseline gap-2 bg-slate-900/90 px-4 py-2 rounded-xl border border-slate-800">
                                        <div className="text-right">
                                            <span className="text-[10px] text-slate-400 block uppercase font-semibold">Active Quota ({salesTargetMonth}):</span>
                                            <span className="text-xl font-black text-amber-400 font-mono">
                                                LKR {salesTarget.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800 flex items-center justify-between text-xs text-slate-400">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-amber-400" />
                                        <span><strong>Monthly Renewal Schedule:</strong> Target resets automatically on the 1st of every calendar month.</span>
                                    </div>
                                    <span className="text-amber-300 font-mono text-[11px] bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20">
                                        Current: {salesTargetMonth}
                                    </span>
                                </div>

                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        const parsed = Number(salesTargetInput);
                                        if (isNaN(parsed) || parsed <= 0) {
                                            alert('Please enter a valid target amount greater than zero.');
                                            return;
                                        }
                                        const thisMonth = new Date().toISOString().slice(0, 7);
                                        setSalesTarget(parsed);
                                        setSalesTargetMonth(thisMonth);
                                        setSalesTargetInput('');
                                        saveConfigToFirestore({
                                            eventTypes,
                                            hotelPackages,
                                            targetSalesAmount: parsed,
                                            targetSalesMonth: thisMonth
                                        });
                                        alert(`Monthly event sales target for ${thisMonth} updated to LKR ${parsed.toLocaleString()}`);
                                    }}
                                    className="flex flex-col sm:flex-row items-center gap-3 pt-2"
                                >
                                    <div className="relative flex-1 w-full">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 text-sm font-semibold">
                                            LKR
                                        </div>
                                        <input
                                            type="number"
                                            min="1"
                                            step="any"
                                            placeholder={`Enter new target sales amount (current: ${salesTarget.toLocaleString()})`}
                                            value={salesTargetInput}
                                            onChange={(e) => setSalesTargetInput(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-14 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 shadow"
                                    >
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>Update Target</span>
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* TAB: MONTHLY REPORTS (ACCESSIBLE TO ALL USERS) */}
                    {activeTab === 'reports' && (
                        <MonthlyReportsView
                            visits={visibleVisits}
                            inquiries={visibleInquiries}
                            allInquiries={inquiries}
                            currentUser={currentUser}
                            salesTarget={salesTarget}
                            salesTargetMonth={salesTargetMonth}
                            reportMonth={reportMonth}
                            setReportMonth={setReportMonth}
                            reportType={reportType}
                            setReportType={setReportType}
                        />
                    )}

                </main>
            </div>

            {/* --- EDIT INQUIRY MODAL (STEP 02 FORM UPDATE) --- */}
            {editingInquiry && (
                <EditInquiryModal
                    inquiry={editingInquiry}
                    users={users}
                    currentUser={currentUser}
                    eventTypes={eventTypes}
                    hotelPackages={hotelPackages}
                    onClose={() => setEditingInquiry(null)}
                    onSave={handleUpdateInquiry}
                />
            )}

            {/* --- DELETE CONFIRMATION MODAL --- */}
            {deletingInquiryId && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-100">Confirm Record Deletion</h3>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Are you sure you want to permanently delete inquiry record <strong className="text-slate-200">{deletingInquiryId}</strong>? This action cannot be undone.
                        </p>
                        <div className="flex justify-end space-x-3 pt-2">
                            <button
                                onClick={() => setDeletingInquiryId(null)}
                                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 hover:bg-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteInquiry(deletingInquiryId)}
                                className="px-4 py-2 bg-rose-600 text-white text-xs font-semibold rounded-xl hover:bg-rose-500 shadow-md"
                            >
                                Delete Inquiry
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- DELETE VISIT CONFIRMATION MODAL (ADMIN ONLY) --- */}
            {deletingVisitId && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-100">Confirm Visit Record Deletion</h3>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Are you sure you want to permanently delete visit record <strong className="text-slate-200">{deletingVisitId}</strong>? This action cannot be undone.
                        </p>
                        <div className="flex justify-end space-x-3 pt-2">
                            <button
                                onClick={() => setDeletingVisitId(null)}
                                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 hover:bg-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteVisit(deletingVisitId)}
                                className="px-4 py-2 bg-rose-600 text-white text-xs font-semibold rounded-xl hover:bg-rose-500 shadow-md"
                            >
                                Delete Visit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- CREATE / EDIT USER MODAL (ADMIN) --- */}
            {userModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <h3 className="text-lg font-bold text-slate-100">
                                {editingUser ? 'Edit User Account' : 'Create New System User'}
                            </h3>
                            <button onClick={() => setUserModalOpen(false)} className="text-slate-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveUser} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Full Name</label>
                                <input
                                    type="text"
                                    required
                                    value={userFormData.name}
                                    onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Email Address</label>
                                <input
                                    type="email"
                                    required
                                    value={userFormData.email}
                                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                                        Account Password {editingUser && <span className="text-slate-500 font-normal lowercase">(leave blank to keep unchanged)</span>}
                                    </label>
                                    <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none hover:text-slate-300">
                                        <input
                                            type="checkbox"
                                            checked={showUserPassword}
                                            onChange={(e) => setShowUserPassword(e.target.checked)}
                                            className="rounded border-slate-700 bg-slate-950 text-purple-500 focus:ring-0 w-3.5 h-3.5"
                                        />
                                        <span>Show password</span>
                                    </label>
                                </div>
                                <div className="relative">
                                    <input
                                        type={showUserPassword ? "text" : "password"}
                                        required={!editingUser}
                                        placeholder={editingUser ? "•••••••• (unchanged)" : "Enter a secure password"}
                                        value={userFormData.password || ''}
                                        onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-purple-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Role Permission</label>
                                <select
                                    value={userFormData.role}
                                    onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-purple-300 font-semibold focus:border-purple-500 focus:outline-none"
                                >
                                    <option value="officer">Marketing Officer (Field Sales)</option>
                                    <option value="management">Management (View Only All)</option>
                                    <option value="admin">Super Admin (Full Controls)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Department</label>
                                <input
                                    type="text"
                                    value={userFormData.department}
                                    onChange={(e) => setUserFormData({ ...userFormData, department: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                                />
                            </div>

                            <div className="flex justify-end space-x-3 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setUserModalOpen(false)}
                                    className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 hover:bg-slate-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-500 shadow-md"
                                >
                                    Save User Profile
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* FOOTER */}
            <footer className="bg-slate-950 border-t border-slate-800 py-4 mt-auto">
                <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-500">
                    Marketing Dashboard — Field Sales & Campaign Lead Management Portal &copy; 2026
                </div>
            </footer>

        </div>
    );
}

// --- SUB-COMPONENT: LOGIN PAGE ---
function LoginPage({ users, onLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [rememberMe, setRememberMe] = useState(true);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage('');

        const trimmedEmail = email.trim().toLowerCase();
        if (!isValidEmail(trimmedEmail)) {
            setErrorMessage('Please enter a valid email address.');
            return;
        }
        const found = users.find(u => u.email.toLowerCase() === trimmedEmail);

        if (!found) {
            setErrorMessage('Account not found with this email. Please check your credentials.');
            return;
        }

        // Validate password (supports both encrypted hashes and legacy plaintext)
        if (found.password) {
            const isValid = await verifyPassword(password, found.password);
            if (!isValid) {
                setErrorMessage('Incorrect password. Please try again.');
                return;
            }
        }

        onLogin(found);
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-4 selection:bg-amber-500 selection:text-slate-900 relative overflow-hidden">
            {/* Ambient Lighting */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="w-full max-w-md space-y-6 relative z-10 animate-fadeIn">
                {/* Brand Header */}
                <div className="text-center space-y-3">
                    <div className="inline-flex h-14 w-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 items-center justify-center shadow-xl shadow-amber-500/25 text-slate-950 font-bold text-2xl tracking-wider">
                        M
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold tracking-tight text-slate-100">
                            Marketing Dashboard
                        </h1>
                        <p className="text-xs text-slate-400 mt-1">
                            Field Sales & Campaign Lead Management Suite
                        </p>
                    </div>
                </div>

                {/* Login Form Box */}
                <div className="bg-slate-950/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
                    <div>
                        <h2 className="text-lg font-bold text-slate-100">Sign in to your account</h2>
                        <p className="text-xs text-slate-400 mt-0.5">Enter credentials to access your campaign workspace</p>
                    </div>

                    {errorMessage && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-start gap-2">
                            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                                Email Address
                            </label>
                            <div className="relative">
                                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                                <input
                                    type="email"
                                    required
                                    placeholder="e.g. sarah.j@grandhotel.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                                    Password
                                </label>
                                <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none hover:text-slate-300">
                                    <input
                                        type="checkbox"
                                        checked={showLoginPassword}
                                        onChange={(e) => setShowLoginPassword(e.target.checked)}
                                        className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 w-3.5 h-3.5"
                                    />
                                    <span>Show password</span>
                                </label>
                            </div>
                            <div className="relative">
                                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                                <input
                                    type={showLoginPassword ? "text" : "password"}
                                    required
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                            <label className="flex items-center gap-2 cursor-pointer text-slate-400 hover:text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0"
                                />
                                <span>Remember me</span>
                            </label>
                            <span className="text-slate-500 hover:text-amber-400 cursor-pointer">
                                Forgot password?
                            </span>
                        </div>

                        <button
                            type="submit"
                            className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 text-sm flex items-center justify-center gap-2 transition"
                        >
                            <LogIn className="w-4 h-4" />
                            <span>Sign In to Dashboard</span>
                        </button>
                    </form>
                </div>

                <div className="text-center text-[11px] text-slate-500">
                    ©All Rights reserved by JADE GREEN HAMBANTOTA (PVT) LTD &copy; 2026
                </div>
            </div>
        </div>
    );
}

// --- SUB-COMPONENT: EDIT INQUIRY FORM MODAL (STEP 02 UPDATE SYSTEM) ---
function EditInquiryModal({ inquiry, users, currentUser, eventTypes = [], hotelPackages = [], onClose, onSave }) {
    const [formData, setFormData] = useState({ ...inquiry });
    const [newFollowUpNote, setNewFollowUpNote] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData, newFollowUpNote);
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">

                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div>
                        <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                            {formData.id}
                        </span>
                        <h3 className="text-xl font-bold text-slate-100 mt-1">
                            Update Inquiry Details & Status
                        </h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">

                    {/* Status Selection */}
                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
                        <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
                            Current Event Status
                        </label>
                        <select
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 font-bold focus:outline-none focus:border-amber-500"
                        >
                            <option value="Pending / New">1. Pending / New (Initial Prospect)</option>
                            <option value="Nego.">2. Nego. (Active Discussion / Negotiation)</option>
                            <option value="Confirmed">3. Confirmed (Agreed & Reserved)</option>
                            <option value="Completed">4. Completed (Executed & Settled)</option>
                            <option value="Cancelled / Lost">5. Cancelled / Lost (Declined / Terminated)</option>
                        </select>
                    </div>

                    {/* Client basic details edit */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                Client Name
                            </label>
                            <input
                                type="text"
                                value={formData.clientName}
                                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                Contact Person
                            </label>
                            <input
                                type="text"
                                value={formData.contactPerson}
                                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                Phone
                            </label>
                            <input
                                type="text"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Event details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                Event Type
                            </label>
                            <select
                                value={formData.eventType || ''}
                                onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                            >
                                {eventTypes.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                Event Package
                            </label>
                            <select
                                value={formData.package || ''}
                                onChange={(e) => setFormData({ ...formData, package: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                            >
                                {hotelPackages.map(pkg => (
                                    <option key={pkg} value={pkg}>{pkg}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                Guest Count
                            </label>
                            <input
                                type="number"
                                value={formData.guestCount}
                                onChange={(e) => setFormData({ ...formData, guestCount: Number(e.target.value) })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                Target Date
                            </label>
                            <input
                                type="date"
                                value={formData.targetDate || ''}
                                onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* BUDGET SECTION: ESTIMATED BUDGET & FINALIZED BUDGET */}
                    <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                                Estimated Budget (LKR)
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="e.g. 350000"
                                value={formData.estimatedBudget ?? ''}
                                onChange={(e) => setFormData({ ...formData, estimatedBudget: e.target.value === '' ? '' : Number(e.target.value) })}
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none font-mono"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">Initial prospective amount discussed with client.</p>
                        </div>

                        {/* FINALIZED BUDGET FIELD - ACTIVATES WHEN CONFIRMED */}
                        {(formData.status === 'Confirmed' || formData.status === 'Completed' || formData.finalizedBudget !== undefined) && (
                            <div className="pt-3 border-t border-slate-800">
                                <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                        Finalized Budget (Actual Confirmed Revenue - LKR) *
                                    </span>
                                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold">
                                        Feeds Dashboard Target Progress
                                    </span>
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder={formData.estimatedBudget ? `e.g. ${formData.estimatedBudget}` : 'Enter agreed final contract amount in LKR'}
                                    value={formData.finalizedBudget ?? ''}
                                    onChange={(e) => setFormData({ ...formData, finalizedBudget: e.target.value === '' ? '' : Number(e.target.value) })}
                                    className="w-full bg-slate-900 border-2 border-amber-500/60 rounded-xl px-3.5 py-2.5 text-sm font-bold text-amber-300 placeholder-slate-600 focus:border-amber-400 focus:outline-none font-mono shadow-inner"
                                />
                                <p className="text-[11px] text-amber-300/80 mt-1">
                                    This finalized revenue is added directly to the Event Sales Target progress bar on the dashboard.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Follow-up Note Logger */}
                    <div>
                        <label className="block text-xs font-semibold text-amber-300 uppercase tracking-wider mb-1">
                            Add New Follow-up Log Note
                        </label>
                        <textarea
                            rows={2}
                            placeholder="Record recent phone conversation, site visit feedback or quote response..."
                            value={newFollowUpNote}
                            onChange={(e) => setNewFollowUpNote(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                        />
                    </div>

                    {/* Existing Follow-up History */}
                    {formData.followUpHistory && formData.followUpHistory.length > 0 && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                Follow-Up Log History
                            </label>
                            <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
                                {formData.followUpHistory.map((hist, idx) => (
                                    <div key={idx} className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                                        <div className="flex justify-between text-[11px] text-amber-400 font-semibold mb-1">
                                            <span>{hist.updatedBy}</span>
                                            <span>{hist.date}</span>
                                        </div>
                                        <p className="text-slate-300 leading-relaxed">{hist.note}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Action Footer */}
                    <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 hover:bg-slate-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg transition"
                        >
                            Update Inquiry Details
                        </button>
                    </div>

                </form>

            </div>
        </div>
    );
}

// --- SUB-COMPONENT: MONTHLY REPORTS VIEW (VISITS & INQUIRIES) ---
function MonthlyReportsView({
    visits,
    inquiries,
    allInquiries = [],
    currentUser,
    salesTarget,
    salesTargetMonth,
    reportMonth,
    setReportMonth,
    reportType,
    setReportType
}) {
    // Filter visits & inquiries by the chosen year-month (YYYY-MM)
    const monthlyVisits = useMemo(() => {
        return visits.filter(v => (v.date || v.createdAt || '').startsWith(reportMonth));
    }, [visits, reportMonth]);

    const monthlyInquiries = useMemo(() => {
        return inquiries.filter(i => (i.createdAt || i.targetDate || '').startsWith(reportMonth));
    }, [inquiries, reportMonth]);

    // Group-wide monthly inquiries (unified organization total for sales target)
    const groupMonthlyInquiries = useMemo(() => {
        const source = allInquiries.length > 0 ? allInquiries : inquiries;
        return source.filter(i => (i.createdAt || i.targetDate || '').startsWith(reportMonth));
    }, [allInquiries, inquiries, reportMonth]);

    // Financial calculations for the selected month (Group Target View)
    const confirmedGroupMonthlyInquiries = useMemo(() => {
        return groupMonthlyInquiries.filter(i => i.status === 'Confirmed' || i.status === 'Completed');
    }, [groupMonthlyInquiries]);

    const totalConfirmedRevenue = useMemo(() => {
        return confirmedGroupMonthlyInquiries.reduce((sum, inq) => {
            const amount = Number(inq.finalizedBudget) > 0 ? Number(inq.finalizedBudget) : (Number(inq.estimatedBudget) || 0);
            return sum + amount;
        }, 0);
    }, [confirmedGroupMonthlyInquiries]);

    const totalEstimatedPipeline = useMemo(() => {
        return groupMonthlyInquiries.reduce((sum, inq) => sum + (Number(inq.estimatedBudget) || 0), 0);
    }, [groupMonthlyInquiries]);

    // Inquiry status breakdown counts
    const inquiryStatusCounts = useMemo(() => {
        return {
            pending: groupMonthlyInquiries.filter(i => i.status === 'Pending / New' || i.status === 'Pending').length,
            nego: groupMonthlyInquiries.filter(i => i.status === 'Nego.' || i.status === 'In Progress').length,
            confirmed: groupMonthlyInquiries.filter(i => i.status === 'Confirmed').length,
            completed: groupMonthlyInquiries.filter(i => i.status === 'Completed').length,
            cancelled: groupMonthlyInquiries.filter(i => i.status === 'Cancelled / Lost' || i.status === 'Cancelled').length
        };
    }, [groupMonthlyInquiries]);

    // Unique visited companies in month
    const uniqueVisitedCompanies = useMemo(() => {
        return new Set(monthlyVisits.map(v => (v.companyName || '').trim().toLowerCase()).filter(Boolean)).size;
    }, [monthlyVisits]);

    // Export to CSV Function
    const handleExportCSV = () => {
        let csvContent = `JADE GREEN MARKETING - MONTHLY ACTIVITY REPORT (${reportMonth})\r\n`;
        csvContent += `Generated On: ${new Date().toLocaleString()}\r\n`;
        csvContent += `Generated By: ${currentUser.name} (${currentUser.role})\r\n\r\n`;

        if (reportType === 'all' || reportType === 'visits') {
            csvContent += `--- FIELD VISITS (${monthlyVisits.length} Records) ---\r\n`;
            csvContent += `Visit ID,Date,Time,Company/Organization,Contact Person,Phone,Email,Location,Officer,Remark\r\n`;
            monthlyVisits.forEach(v => {
                const row = [
                    v.id,
                    v.date,
                    v.time,
                    `"${(v.companyName || '').replace(/"/g, '""')}"`,
                    `"${(v.contactPerson || '').replace(/"/g, '""')}"`,
                    `"${(v.phone || '').replace(/"/g, '""')}"`,
                    `"${(v.email || '').replace(/"/g, '""')}"`,
                    `"${(v.clientLocation || '').replace(/"/g, '""')}"`,
                    `"${(v.officerName || '').replace(/"/g, '""')}"`,
                    `"${(v.remark || '').replace(/"/g, '""')}"`
                ];
                csvContent += row.join(',') + '\r\n';
            });
            csvContent += `\r\n`;
        }

        if (reportType === 'all' || reportType === 'inquiries') {
            csvContent += `--- SALES INQUIRIES (${monthlyInquiries.length} Records) ---\r\n`;
            csvContent += `Inquiry ID,Created Date,Client Company,Contact Person,Phone,Email,Location,Event Type,Package,Guests,Target Date,Estimated Budget (LKR),Finalized Budget (LKR),Status,Assigned Officer\r\n`;
            monthlyInquiries.forEach(i => {
                const row = [
                    i.id,
                    i.createdAt,
                    `"${(i.clientName || '').replace(/"/g, '""')}"`,
                    `"${(i.contactPerson || '').replace(/"/g, '""')}"`,
                    `"${(i.phone || '').replace(/"/g, '""')}"`,
                    `"${(i.email || '').replace(/"/g, '""')}"`,
                    `"${(i.location || '').replace(/"/g, '""')}"`,
                    `"${(i.eventType || '').replace(/"/g, '""')}"`,
                    `"${(i.package || '').replace(/"/g, '""')}"`,
                    i.guestCount || 0,
                    i.targetDate || '',
                    i.estimatedBudget || 0,
                    i.finalizedBudget || 0,
                    `"${i.status || ''}"`,
                    `"${(i.assignedOfficerName || '').replace(/"/g, '""')}"`
                ];
                csvContent += row.join(',') + '\r\n';
            });
            csvContent += `\r\n`;
            csvContent += `Total Confirmed Revenue: LKR ${totalConfirmedRevenue}\r\n`;
            csvContent += `Monthly Sales Target: LKR ${salesTarget}\r\n`;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Jade_Marketing_Report_${reportMonth}_${reportType}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Print / PDF Report
    const handlePrint = () => {
        window.print();
    };

    // Human readable month title
    const monthFormatted = useMemo(() => {
        try {
            const [y, m] = reportMonth.split('-');
            const d = new Date(Number(y), Number(m) - 1, 1);
            return d.toLocaleString('default', { month: 'long', year: 'numeric' });
        } catch (e) {
            return reportMonth;
        }
    }, [reportMonth]);

    return (
        <div className="space-y-6 animate-fadeIn pb-12">

            {/* Header with Monthly Controls */}
            <div className="bg-slate-950/90 rounded-2xl border border-slate-800 p-6 shadow-xl space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                    <div className="flex items-center space-x-3">
                        <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                            <FileText className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl sm:text-2xl font-bold text-slate-100">Monthly Performance Reports</h2>
                                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                                    All Users Access
                                </span>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                                Generate and export comprehensive monthly records for client visits and field sales inquiries
                            </p>
                        </div>
                    </div>

                    {/* Actions: Export CSV & Print */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <button
                            onClick={handleExportCSV}
                            className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl shadow text-xs transition"
                        >
                            <Download className="w-4 h-4" />
                            <span>Export CSV</span>
                        </button>
                        <button
                            onClick={handlePrint}
                            className="inline-flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold px-4 py-2.5 rounded-xl border border-slate-700 shadow text-xs transition"
                        >
                            <Printer className="w-4 h-4 text-amber-400" />
                            <span>Print / PDF</span>
                        </button>
                    </div>
                </div>

                {/* Filter Toolbar: Month Picker & Section Filter */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap">
                            <Calendar className="w-4 h-4 text-amber-400" />
                            Select Report Month:
                        </label>
                        <input
                            type="month"
                            value={reportMonth}
                            onChange={(e) => setReportMonth(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-amber-300 font-mono font-bold focus:outline-none focus:border-amber-500"
                        />
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <span className="text-xs text-slate-400 font-medium">Report Scope:</span>
                        <div className="inline-flex p-1 bg-slate-900 rounded-xl border border-slate-800">
                            <button
                                onClick={() => setReportType('all')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${reportType === 'all'
                                    ? 'bg-amber-500 text-slate-950 shadow'
                                    : 'text-slate-400 hover:text-slate-200'
                                    }`}
                            >
                                All Records
                            </button>
                            <button
                                onClick={() => setReportType('visits')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${reportType === 'visits'
                                    ? 'bg-amber-500 text-slate-950 shadow'
                                    : 'text-slate-400 hover:text-slate-200'
                                    }`}
                            >
                                Visits ({monthlyVisits.length})
                            </button>
                            <button
                                onClick={() => setReportType('inquiries')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${reportType === 'inquiries'
                                    ? 'bg-amber-500 text-slate-950 shadow'
                                    : 'text-slate-400 hover:text-slate-200'
                                    }`}
                            >
                                Inquiries ({monthlyInquiries.length})
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Monthly High-Level Executive Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Monthly Visits */}
                <div className="p-5 bg-slate-950/80 rounded-2xl border border-slate-800 relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Field Visits Logged</span>
                        <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                            <Compass className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-3xl font-black text-amber-400">{monthlyVisits.length}</span>
                        <span className="text-xs text-slate-400">{uniqueVisitedCompanies} Clients</span>
                    </div>
                    <span className="text-[11px] text-slate-500 mt-2 block">
                        Month: {monthFormatted}
                    </span>
                </div>

                {/* 2. Monthly Inquiries */}
                <div className="p-5 bg-slate-950/80 rounded-2xl border border-slate-800 relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Inquiries</span>
                        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                            <ClipboardList className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-3xl font-black text-blue-400">{monthlyInquiries.length}</span>
                        <span className="text-xs text-cyan-400 font-semibold">{inquiryStatusCounts.confirmed} Confirmed</span>
                    </div>
                    <span className="text-[11px] text-slate-500 mt-2 block">
                        Estimated: LKR {totalEstimatedPipeline.toLocaleString()}
                    </span>
                </div>

                {/* 3. Confirmed Revenue (Group Target) */}
                <div className="p-5 bg-slate-950/80 rounded-2xl border border-slate-800 relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Group Confirmed Revenue</span>
                        <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-2xl font-black text-emerald-400 font-mono">
                            LKR {totalConfirmedRevenue.toLocaleString()}
                        </span>
                    </div>
                    <span className="text-[11px] text-slate-500 mt-2 block">
                        Total team bookings in {monthFormatted}
                    </span>
                </div>

                {/* 4. Target Fulfillment */}
                <div className="p-5 bg-slate-950/80 rounded-2xl border border-slate-800 relative overflow-hidden">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Group Target Progress</span>
                        <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                            <Target className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                        <span className="text-2xl font-black text-amber-400 font-mono">
                            {salesTarget > 0 ? ((totalConfirmedRevenue / salesTarget) * 100).toFixed(1) : 0}%
                        </span>
                        <span className="text-[11px] text-slate-400">Target: LKR {salesTarget.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-slate-900 h-1.5 rounded-full mt-2.5 overflow-hidden">
                        <div
                            className="bg-amber-500 h-full rounded-full"
                            style={{ width: `${Math.min(100, salesTarget > 0 ? (totalConfirmedRevenue / salesTarget) * 100 : 0)}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* SECTION 1: MONTHLY FIELD VISITS TABLE */}
            {(reportType === 'all' || reportType === 'visits') && (
                <div className="bg-slate-950/90 rounded-2xl border border-slate-800 overflow-hidden shadow-xl space-y-3 p-5">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-amber-400" />
                            <h3 className="font-bold text-slate-100 text-base">
                                Field Visits Log Report — {monthFormatted}
                            </h3>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-800">
                                {monthlyVisits.length} visits
                            </span>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-900/90 border-b border-slate-800 font-bold text-slate-400 uppercase tracking-wider">
                                    <th className="py-3 px-3">Ref ID</th>
                                    <th className="py-3 px-3">Date & Time</th>
                                    <th className="py-3 px-3">Company / Client</th>
                                    <th className="py-3 px-3">Contact Person</th>
                                    <th className="py-3 px-3">Phone & Email</th>
                                    <th className="py-3 px-3">Visited Location</th>
                                    <th className="py-3 px-3">Field Officer</th>
                                    <th className="py-3 px-3">Remark</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {monthlyVisits.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-8 text-center text-slate-500 italic">
                                            No field visits recorded for the selected month ({monthFormatted}).
                                        </td>
                                    </tr>
                                ) : (
                                    monthlyVisits.map((v) => (
                                        <tr key={v.id} className="hover:bg-slate-900/40 transition">
                                            <td className="py-3 px-3 font-mono text-amber-400">{v.id}</td>
                                            <td className="py-3 px-3 font-mono text-slate-300">
                                                {v.date} <span className="text-slate-500">{v.time}</span>
                                            </td>
                                            <td className="py-3 px-3 font-semibold text-slate-100">{v.companyName}</td>
                                            <td className="py-3 px-3 text-slate-300">{v.contactPerson}</td>
                                            <td className="py-3 px-3 text-slate-400">
                                                <div>{v.phone}</div>
                                                <div className="text-[11px] text-slate-500">{v.email}</div>
                                            </td>
                                            <td className="py-3 px-3 text-slate-300">{v.clientLocation}</td>
                                            <td className="py-3 px-3">
                                                <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
                                                    {v.officerName}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-slate-400 max-w-xs truncate" title={v.remark}>
                                                {v.remark || '—'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* SECTION 2: MONTHLY INQUIRIES REPORT TABLE */}
            {(reportType === 'all' || reportType === 'inquiries') && (
                <div className="bg-slate-950/90 rounded-2xl border border-slate-800 overflow-hidden shadow-xl space-y-3 p-5">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2">
                            <ClipboardList className="w-4 h-4 text-amber-400" />
                            <h3 className="font-bold text-slate-100 text-base">
                                Sales Inquiries Pipeline Report — {monthFormatted}
                            </h3>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-800">
                                {monthlyInquiries.length} inquiries
                            </span>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="bg-slate-900/90 border-b border-slate-800 font-bold text-slate-400 uppercase tracking-wider">
                                    <th className="py-3 px-3">Ref ID</th>
                                    <th className="py-3 px-3">Client Company</th>
                                    <th className="py-3 px-3">Event Type & Package</th>
                                    <th className="py-3 px-3">Guests</th>
                                    <th className="py-3 px-3">Target Date</th>
                                    <th className="py-3 px-3">Est. Budget</th>
                                    <th className="py-3 px-3">Finalized Budget</th>
                                    <th className="py-3 px-3">Status</th>
                                    <th className="py-3 px-3">Officer</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {monthlyInquiries.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="py-8 text-center text-slate-500 italic">
                                            No inquiries recorded for the selected month ({monthFormatted}).
                                        </td>
                                    </tr>
                                ) : (
                                    monthlyInquiries.map((inq) => (
                                        <tr key={inq.id} className="hover:bg-slate-900/40 transition">
                                            <td className="py-3 px-3 font-mono text-amber-400">{inq.id}</td>
                                            <td className="py-3 px-3">
                                                <p className="font-semibold text-slate-100">{inq.clientName}</p>
                                                <p className="text-[11px] text-slate-400">{inq.contactPerson} • {inq.phone}</p>
                                            </td>
                                            <td className="py-3 px-3">
                                                <p className="font-medium text-amber-300">{inq.eventType}</p>
                                                <p className="text-[11px] text-slate-400">{inq.package}</p>
                                            </td>
                                            <td className="py-3 px-3 font-mono text-slate-300">{inq.guestCount}</td>
                                            <td className="py-3 px-3 font-mono text-slate-300">{inq.targetDate || 'TBD'}</td>
                                            <td className="py-3 px-3 font-mono text-slate-400">
                                                {inq.estimatedBudget ? `LKR ${Number(inq.estimatedBudget).toLocaleString()}` : '—'}
                                            </td>
                                            <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                                                {inq.finalizedBudget ? `LKR ${Number(inq.finalizedBudget).toLocaleString()}` : '—'}
                                            </td>
                                            <td className="py-3 px-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${inq.status === 'Confirmed' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                                                    inq.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                        inq.status === 'Nego.' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                                            inq.status === 'Cancelled / Lost' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                                                                'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                    }`}>
                                                    {inq.status}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-slate-300">
                                                {inq.assignedOfficerName}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

        </div>
    );
}