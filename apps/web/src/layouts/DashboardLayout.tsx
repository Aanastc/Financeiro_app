import React, { useEffect, useState, useRef } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowUpCircle,
  ArrowDownCircle,
  CreditCard,
  AlertTriangle,
  Target,
  Briefcase,
  Upload,
  LogOut,
  Users,
  Sun,
  Moon,
  ChevronDown,
  ChevronLeft,
  Brain,
  Wallet,
  Menu,
  X,
  Plus,
  ArrowLeftRight,
  Receipt,
  PiggyBank,
  Undo2
} from "lucide-react";
import { supabase } from "../../../../packages/services/supabase";
import { authService } from "../../../../packages/services/auth.service";
import EditProfileModal from "../components/EditProfileModal";
import { ImportarProvider } from "../contexts/ImportarContext";
import GlobalTransactionModal from "../components/GlobalTransactionModal";

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Menu Flutuante de Nova Movimentação
  const [isNewTxMenuOpen, setIsNewTxMenuOpen] = useState(false);
  const [isGlobalTxModalOpen, setIsGlobalTxModalOpen] = useState(false);

  // Sidebar Collapsible
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      const storedTheme = localStorage.getItem("theme");
      if (storedTheme) return storedTheme;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "light" ? "dark" : "light"));

  const fetchUser = async () => {
    const user = await authService.getCurrentUser();
    setUserProfile(user);
  };

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
      } else {
        await fetchUser();
      }
      setLoading(false);
    };
    checkUser();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // --- COMPONENTES DA SIDEBAR ---

  const NavItem = ({ to, icon: Icon, label, colorClass = "" }: any) => {
    const isActive = location.pathname === to || location.pathname.startsWith(to + "/");
    return (
      <Link
        to={to}
        className={`flex items-center gap-3 px-3 py-2 rounded-xl font-bold transition-all ${
          isActive
            ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none"
            : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
        } ${isSidebarCollapsed ? "justify-center px-0" : ""}`}
        title={isSidebarCollapsed ? label : undefined}
      >
        <Icon size={18} className={isActive ? "text-white" : colorClass} />
        {!isSidebarCollapsed && <span className="text-sm">{label}</span>}
      </Link>
    );
  };

  const NavGroup = ({ title, children }: any) => (
    <div className="mb-4">
      {!isSidebarCollapsed ? (
          <h4 className="px-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
            {title}
          </h4>
      ) : (
          <div className="h-px bg-slate-200 dark:bg-slate-800 mx-4 mb-3 mt-1.5" />
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full px-3 sm:px-4 py-5 overflow-hidden">
      {/* Brand */}
      <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-3'} mb-5 shrink-0 relative`}>
        <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200 dark:shadow-none shrink-0">
          <span className="text-white text-lg font-black">T</span>
        </div>
        {!isSidebarCollapsed && (
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">
            TECH FINANCE.
            </h2>
        )}
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto pr-1 pb-6 custom-scrollbar space-y-0.5">
        <NavGroup title="Visão Geral">
          <NavItem to="/home" icon={LayoutDashboard} label="Dashboard" />
        </NavGroup>

        <NavGroup title="Movimentações">
          <NavItem to="/entradas" icon={ArrowUpCircle} label="Entradas" colorClass="text-emerald-500" />
          <NavItem to="/gastos" icon={ArrowDownCircle} label="Gastos" colorClass="text-rose-500" />
          {/* Transferências ainda não tem página própria na propsta, mas se tiver, entra aqui */}
        </NavGroup>

        <NavGroup title="Dinheiro">
          <NavItem to="/contas" icon={Wallet} label="Contas" />
          <NavItem to="/cartoes" icon={CreditCard} label="Cartões" />
          <NavItem to="/faturas" icon={Receipt} label="Faturas" />
        </NavGroup>

        <NavGroup title="Planejamento">
          <NavItem to="/dividas" icon={AlertTriangle} label="Dívidas" colorClass="text-amber-500" />
          <NavItem to="/devedores" icon={Users} label="Devedores" />
          <NavItem to="/metas" icon={Target} label="Metas" colorClass="text-blue-500" />
        </NavGroup>

        <NavGroup title="Patrimônio">
          <NavItem to="/investimentos" icon={Briefcase} label="Investimentos" colorClass="text-purple-500" />
        </NavGroup>

        <NavGroup title="Ferramentas">
          <NavItem to="/importar" icon={Upload} label="Importar" />
          <NavItem to="/consultor" icon={Brain} label="Consultor IA" colorClass="text-pink-500" />
        </NavGroup>
      </nav>
    </div>
  );

  return (
    <ImportarProvider>
      <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 relative overflow-x-hidden">
        
        {/* DESKTOP SIDEBAR */}
        <aside className={`hidden md:flex flex-col ${isSidebarCollapsed ? 'w-20' : 'w-64'} border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0 z-20 transition-all duration-300 fixed inset-y-0 left-0 h-screen`}>
          <SidebarContent />
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="absolute -right-3 top-1/2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full p-1 text-slate-500 shadow-sm cursor-pointer z-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <ChevronLeft size={16} className={`transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
          </button>
        </aside>

        {/* MOBILE OVERLAY & SIDEBAR */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
            <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white dark:bg-slate-900 shadow-2xl transition-all h-full overflow-y-auto">
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="absolute top-5 right-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 z-10"
              >
                <X size={20} />
              </button>
              <SidebarContent />
            </div>
          </div>
        )}

        {/* MAIN CONTENT AREA */}
        <div className={`flex-1 flex flex-col min-w-0 ${isSidebarCollapsed ? 'md:pl-20' : 'md:pl-64'} w-full transition-all duration-300`}>
          
          {/* TOP HEADER */}
          <header className="sticky top-0 h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-30">
            <div className="flex items-center gap-4">
              <button 
                className="md:hidden p-2 -ml-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                <Menu size={24} />
              </button>
              <h1 className="text-lg font-black text-slate-800 dark:text-slate-100 truncate md:hidden">
                Tech Finance.
              </h1>
            </div>

            <div className="flex items-center gap-3 ml-auto">
              {/* Botão de Tema */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-all outline-none cursor-pointer"
                title={theme === "light" ? "Modo Escuro" : "Modo Claro"}
              >
                {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
              </button>

              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />

              {/* Dropdown do Perfil */}
              {userProfile && (
                <div className="relative">
                  <button
                    onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                    className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all outline-none cursor-pointer"
                  >
                    {userProfile.avatar_url ? (
                      <img src={userProfile.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full object-cover shadow-sm" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold shadow-sm text-sm">
                        {userProfile.nome ? userProfile.nome.charAt(0).toUpperCase() : "U"}
                      </div>
                    )}
                    <span className="hidden sm:inline font-bold text-sm text-slate-700 dark:text-slate-300 pr-1 truncate max-w-[120px]">{userProfile.nome}</span>
                    <ChevronDown size={14} className="text-slate-400 hidden sm:inline" />
                  </button>

                  {isProfileDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setIsProfileDropdownOpen(false)} />
                      <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl py-3 z-40 animate-in fade-in slide-in-from-top-2 duration-150">
                        <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800/80 mb-2">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Conta</p>
                          <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{userProfile.nome}</p>
                          {userProfile.email && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{userProfile.email}</p>}
                        </div>

                        <button
                          onClick={() => { setIsProfileDropdownOpen(false); setIsEditModalOpen(true); }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-left cursor-pointer"
                        >
                          Editar perfil
                        </button>

                        <button
                          onClick={handleLogout}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all text-left cursor-pointer"
                        >
                          <LogOut size={16} />
                          <span>Sair</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </header>

          {/* PAGE CONTENT */}
          <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 relative">
            <div className="max-w-6xl mx-auto w-full pb-24" id="main-outlet-wrapper">
              <Outlet context={{ userProfile, fetchUser }} />
            </div>
          </main>

        </div>

        {/* FLOATING ACTION BUTTON (NOVA MOVIMENTAÇÃO) */}
        <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-40">
          <div className="relative">
            {isNewTxMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsNewTxMenuOpen(false)} />
                <div className="absolute bottom-16 right-0 mb-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-2 z-40 animate-in slide-in-from-bottom-2 fade-in duration-200 origin-bottom-right">
                  <div className="px-3 py-2 mb-1">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Nova Movimentação</p>
                  </div>
                  
                  <button 
                    onClick={() => {
                        setIsNewTxMenuOpen(false);
                        setIsGlobalTxModalOpen(true);
                        // Idealmente passaríamos o "tipo" inicial (Entrada) para o Modal aqui
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors text-left font-bold text-sm"
                  >
                    <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                      <ArrowUpCircle size={18} />
                    </div>
                    Entrada
                  </button>
                  
                  <button 
                    onClick={() => {
                        setIsNewTxMenuOpen(false);
                        setIsGlobalTxModalOpen(true);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-700 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-400 transition-colors text-left font-bold text-sm"
                  >
                    <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                      <ArrowDownCircle size={18} />
                    </div>
                    Gasto
                  </button>

                  <button 
                    onClick={() => {
                        setIsNewTxMenuOpen(false);
                        setIsGlobalTxModalOpen(true);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left font-bold text-sm"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                      <ArrowLeftRight size={18} />
                    </div>
                    Transferência
                  </button>

                  <button className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-purple-50 dark:hover:bg-purple-900/20 text-slate-700 dark:text-slate-200 hover:text-purple-600 dark:hover:text-purple-400 transition-colors text-left font-bold text-sm">
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                      <Receipt size={18} />
                    </div>
                    Pagamento de Fatura
                  </button>

                  <div className="h-px w-full bg-slate-100 dark:bg-slate-800 my-1" />

                  <button className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors text-left font-bold text-sm">
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                      <PiggyBank size={18} />
                    </div>
                    Aporte / Resgate
                  </button>
                  
                </div>
              </>
            )}

            <button 
              onClick={() => setIsNewTxMenuOpen(!isNewTxMenuOpen)}
              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all z-40 ${
                isNewTxMenuOpen ? 'bg-slate-800 dark:bg-slate-700 rotate-45' : 'bg-indigo-600 hover:bg-indigo-500'
              }`}
            >
              <Plus size={28} />
            </button>
          </div>
        </div>

        <EditProfileModal 
          isOpen={isEditModalOpen} 
          onClose={() => setIsEditModalOpen(false)} 
          onUpdate={fetchUser} 
        />

        <GlobalTransactionModal 
            isOpen={isGlobalTxModalOpen} 
            onClose={() => setIsGlobalTxModalOpen(false)} 
            userId={userProfile?.id}
        />
      </div>
    </ImportarProvider>
  );
}
