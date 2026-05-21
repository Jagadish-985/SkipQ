import React, { useEffect, useState, useRef } from "react";
import { kitchenDb as db, kitchenAuth as auth, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy, updateDoc, doc, serverTimestamp, where, limit, deleteDoc } from "firebase/firestore";
import { LogOut, CheckCircle, Clock, ChefHat, BellRing, UtensilsCrossed, History, ArrowLeft, Search, Calendar, Trash2, Volume2, X } from "lucide-react";
import { User, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn, formatCurrency } from "../lib/utils";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  customerName: string;
  items: OrderItem[];
  status: "pending" | "accepted" | "preparing" | "cooked" | "picked_up";
  pickupCode: string;
  totalAmount: number;
  createdAt: any;
  updatedAt: any;
  timeline?: {
    pending?: any;
    accepted?: any;
    preparing?: any;
    cooked?: any;
    picked_up?: any;
  };
  handledBy?: {
    uid: string;
    name: string;
    email: string;
  };
}

export default function KitchenDashboard({ user }: { user: User }) {
  interface KitchenBanner {
    id: string;
    customerName: string;
    itemsSummary: string;
    createdAt: number;
  }

  const [orders, setOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [otpErrorOrder, setOtpErrorOrder] = useState<string | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [banners, setBanners] = useState<KitchenBanner[]>([]);
  
  const isFirstRun = useRef(true);
  const navigate = useNavigate();

  const playNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      
      // Tone 1: D5 Synth
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.4);

      // Tone 2: A5 Synth staggered by 100ms
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880.00, now + 0.1);
      gain2.gain.setValueAtTime(0.12, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.5);
    } catch (e) {
      console.error("Audio synth error", e);
    }
  };

  const triggerPendingNotification = (id: string, customerName: string, items: any[]) => {
    playNotificationSound();
    
    const itemsSummary = items.map((i: any) => `${i.quantity}x ${i.name}`).join(", ");
    const newBanner: KitchenBanner = {
      id,
      customerName: customerName || "Guest",
      itemsSummary,
      createdAt: Date.now()
    };
    
    setBanners(prev => {
      // Avoid duplicate alert cards
      if (prev.some(b => b.id === id)) return prev;
      return [newBanner, ...prev];
    });
    
    // Auto remove after 6 seconds
    setTimeout(() => {
      setBanners(prev => prev.filter(b => b.id !== id));
    }, 6000);
  };

  useEffect(() => {
    localStorage.setItem("last_portal", "kitchen");
  }, []);

  // Unified Orders Listener (handles both active and history)
  useEffect(() => {
    const q = query(
      collection(db, "orders"), 
      orderBy("createdAt", "desc"),
      limit(200)
    );
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        
        // 1. History Orders are those with status === "picked_up" (already sorted by createdAt desc)
        const history = items.filter(o => o.status === "picked_up");
        setHistoryOrders(history);
        
        // 2. Active Orders are those with status !== "picked_up"
        const active = items.filter(o => o.status !== "picked_up");
        // Sort active orders by status level priority, then by createdAt asc (FIFO)
        const statusPriority: Record<string, number> = {
          "pending": 1,
          "accepted": 2,
          "preparing": 3,
          "cooked": 4
        };
        active.sort((a, b) => {
          const priorityA = statusPriority[a.status] || 99;
          const priorityB = statusPriority[b.status] || 99;
          if (priorityA !== priorityB) {
            return priorityA - priorityB;
          }
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeA - timeB;
        });
        
        setOrders(active);
        setLoading(false);

        // Process additions for new pending orders
        const changes = snapshot.docChanges();
        if (isFirstRun.current) {
          isFirstRun.current = false;
        } else {
          changes.forEach(change => {
            if (change.type === "added") {
              const orderData = change.doc.data() as Order;
              if (orderData.status === "pending") {
                triggerPendingNotification(change.doc.id, orderData.customerName, orderData.items);
              }
            }
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, "orders")
    );
    return () => unsubscribe();
  }, []);

  const updateStatus = async (orderId: string, newStatus: Order["status"]) => {
    try {
      await updateDoc(doc(db, "orders", orderId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        [`timeline.${newStatus}`]: serverTimestamp(),
        handledBy: {
          uid: user.uid,
          name: user.displayName || 'Unknown Staff',
          email: user.email || 'no-email',
        }
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const deleteOrder = async (orderId: string) => {
    try {
      await deleteDoc(doc(db, "orders", orderId));
      setOrderToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `orders/${orderId}`);
    }
  };

  const clearActiveOrders = async () => {
    try {
      const deletePromises = orders.map(order => 
        deleteDoc(doc(db, "orders", order.id))
      );
      await Promise.all(deletePromises);
      setShowClearConfirm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "orders");
    }
  };

  const pendingOrders = orders.filter(o => o.status === "pending");
  const inProgressOrders = orders.filter(o => ["accepted", "preparing"].includes(o.status));
  const readyOrders = orders.filter(o => o.status === "cooked");

  // Enhanced search filters matching Customer Name, Order ID last 3, and Pickup Code
  const matchedActive = orders.filter(o => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return false;
    return (
      (o.customerName && o.customerName.toLowerCase().includes(q)) ||
      o.id.toLowerCase().includes(q) ||
      o.id.slice(-3).toLowerCase().includes(q) ||
      (o.pickupCode && o.pickupCode.toLowerCase().includes(q))
    );
  });

  const matchedHistory = historyOrders.filter(o => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return false;
    return (
      (o.customerName && o.customerName.toLowerCase().includes(q)) ||
      o.id.toLowerCase().includes(q) ||
      o.id.slice(-3).toLowerCase().includes(q) ||
      (o.pickupCode && o.pickupCode.toLowerCase().includes(q))
    );
  });

  const filteredHistory = historyOrders.filter(o => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (o.customerName && o.customerName.toLowerCase().includes(q)) ||
      o.id.toLowerCase().includes(q) ||
      o.id.slice(-3).toLowerCase().includes(q) ||
      (o.pickupCode && o.pickupCode.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 font-sans overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-[#1e293b] border-b border-slate-800 p-6 flex justify-between items-center shadow-lg relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
            <UtensilsCrossed size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight uppercase">
              {showHistory ? "Order Archives" : "Kitchen Portal"}
            </h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              {showHistory ? "Historical Records" : "Stall #01 • Active Terminal"}
            </p>
          </div>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="hidden md:flex flex-col text-right mr-2">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Employee Session</span>
            <span className="text-xs font-bold text-white">{user.displayName || user.email}</span>
          </div>
          
          <button 
            onClick={() => {
              setShowHistory(!showHistory);
              setSearchQuery(""); // Auto-clear search query when switching views
            }}
            className={cn(
              "px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-xl transition-all border flex items-center gap-2",
              showHistory 
                ? "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700" 
                : "bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500"
            )}
          >
            {showHistory ? (
              <><ArrowLeft size={16} /> Back to Kitchen</>
            ) : (
              <><History size={16} /> View History</>
            )}
          </button>
          
          {!showHistory && (
            <>
              <button 
                onClick={() => {
                  const testId = "tst-" + Math.floor(100 + Math.random() * 900);
                  triggerPendingNotification(testId, "Test Customer", [
                    { id: "1", name: "Sautéed Hakka Noodles", quantity: 2 },
                    { id: "2", name: "Zesty Paneer Tikka", quantity: 1 }
                  ]);
                }}
                className="px-4 py-3 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 hover:text-orange-300 rounded-xl font-bold text-xs uppercase tracking-widest shadow-xl transition-all border border-orange-500/20 flex items-center gap-2"
                title="Test sound notification & slide-in banner alert"
              >
                <Volume2 size={16} /> <span className="hidden xl:inline">Test Alert</span>
              </button>
              <button 
                onClick={() => setShowClearConfirm(true)}
                className="px-6 py-3 bg-red-950/40 text-red-400 hover:text-white hover:bg-red-900/50 rounded-xl font-bold text-xs uppercase tracking-widest shadow-xl transition-all border border-red-900/40 hover:border-red-500/50 flex items-center gap-2 group disabled:opacity-50 disabled:pointer-events-none"
                disabled={orders.length === 0}
              >
                <Trash2 size={16} className="text-red-400 group-hover:text-white" /> Clear Queue ({orders.length})
              </button>
              <button 
                onClick={() => navigate("/admin")}
                className="px-6 py-3 bg-slate-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-xl hover:bg-slate-600 transition-all border border-slate-600"
              >
                Manage Menu
              </button>
            </>
          )}

          <button 
            onClick={() => signOut(auth)}
            className="w-12 h-12 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-all"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Persistent Prominent Dashboard Search Bar */}
      <div className="bg-[#1e293b]/70 border-b border-slate-800/80 p-4 px-8 flex flex-col md:flex-row gap-4 justify-between items-center relative z-10 backdrop-blur-md">
        <div className="relative w-full max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-500" size={18} />
          <input 
            type="text" 
            placeholder="Search Active/Past Orders by Customer, ID last 3 digits, or Pickup Code..." 
            className="w-full bg-[#0f172a] border-2 border-slate-800 focus:border-orange-500 rounded-2.5xl py-3 pl-12 pr-24 text-sm font-bold text-white placeholder:text-slate-500 focus:outline-none focus:ring-0 transition-all shadow-inner"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-800 hover:bg-slate-705 text-slate-300 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {searchQuery ? (
          <div className="flex items-center gap-2 text-xs bg-orange-500/10 border border-orange-500/20 text-orange-400 px-4 py-2 rounded-xl font-bold animate-pulse">
            <BellRing size={14} className="text-orange-500" />
            <span>Interactive Search Matches Enabled</span>
          </div>
        ) : (
          <div className="flex gap-4 items-center text-xs font-black text-slate-500 uppercase tracking-widest">
            <span>Stall Stats:</span>
            <span className="text-orange-400 bg-orange-400/5 px-2 py-1 rounded border border-orange-500/10">{pendingOrders.length} New</span>
            <span className="text-blue-400 bg-blue-400/5 px-2 py-1 rounded border border-blue-500/10">{inProgressOrders.length} Cooking</span>
            <span className="text-emerald-400 bg-emerald-400/5 px-2 py-1 rounded border border-emerald-500/10">{readyOrders.length} Pickup</span>
          </div>
        )}
      </div>

      <main className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {searchQuery.trim() !== "" ? (
            <motion.div
              key="universal-search"
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              className="h-full overflow-y-auto p-8"
            >
              <div className="max-w-7xl mx-auto w-full">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
                  <div>
                    <h2 className="text-xl font-black text-white tracking-tight uppercase flex items-center gap-3">
                      <Search className="text-orange-500" size={24} />
                      Prominent Kitchen Results
                    </h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                      Displaying active and historical matches for "{searchQuery}"
                    </p>
                  </div>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold uppercase tracking-widest border border-slate-700 transition-all"
                  >
                    Reset Filter
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-12">
                  {/* Category A: Active matching queue */}
                  <div className="space-y-6">
                    <h3 className="text-xs font-black text-orange-400 uppercase tracking-[0.2em] flex items-center gap-2 pb-2 border-b border-slate-800/60">
                      <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-ping" />
                      Active Queue ({matchedActive.length})
                    </h3>

                    {matchedActive.length === 0 ? (
                      <div className="bg-slate-800/10 border-2 border-dashed border-slate-800/40 rounded-3xl p-10 text-center text-slate-500">
                        <p className="font-extrabold text-xs uppercase tracking-wider">No matching active orders</p>
                        <p className="text-[10px] text-slate-600 mt-1">Check past archives for completed items.</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {matchedActive.map((order) => {
                          let sColor = "border-orange-500";
                          let sBg = "bg-orange-500/5";
                          let sText = "New Order";
                          let sTextColor = "text-orange-400";
                          let actionLabel = "Start Preparing";
                          let actionColor = "bg-orange-600 hover:bg-orange-500";
                          let showCode = false;

                          if (order.status === "accepted" || order.status === "preparing") {
                            sColor = "border-blue-500";
                            sBg = "bg-blue-500/5";
                            sText = "Cooking";
                            sTextColor = "text-blue-400";
                            actionLabel = "Order Ready";
                            actionColor = "bg-blue-600 hover:bg-blue-500";
                          } else if (order.status === "cooked") {
                            sColor = "border-emerald-500";
                            sBg = "bg-emerald-500/5";
                            sText = "Call Customer";
                            sTextColor = "text-emerald-400";
                            actionLabel = "Mark Picked Up";
                            actionColor = "bg-emerald-600 hover:bg-emerald-500";
                            showCode = true;
                          }

                          return (
                            <div key={order.id} className="relative">
                              <div className="absolute top-4 right-16 bg-orange-500/10 text-orange-400 border border-orange-500/10 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md z-10">
                                ACTIVE QUEUE
                              </div>
                              <OrderCard 
                                order={order} 
                                statusColor={sColor}
                                statusBg={sBg}
                                statusText={sText}
                                statusTextColor={sTextColor}
                                onAction={() => {
                                  if (order.status === "pending") {
                                    updateStatus(order.id, "accepted");
                                  } else if (order.status === "accepted" || order.status === "preparing") {
                                    updateStatus(order.id, "cooked");
                                  } else if (order.status === "cooked") {
                                    updateStatus(order.id, "picked_up");
                                  }
                                }}
                                actionLabel={actionLabel}
                                actionColor={actionColor}
                                showCode={showCode}
                                isNew={order.status === "pending"}
                                onOtpError={(name) => setOtpErrorOrder(name)}
                                onDelete={() => setOrderToDelete(order)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Category B: Archive matching queue */}
                  <div className="space-y-6">
                    <h3 className="text-xs font-black text-emerald-400 uppercase tracking-[0.2em] flex items-center gap-2 pb-2 border-b border-slate-800/60">
                      <CheckCircle size={14} className="text-emerald-400" />
                      Archived / Completed ({matchedHistory.length})
                    </h3>

                    {matchedHistory.length === 0 ? (
                      <div className="bg-slate-800/10 border-2 border-dashed border-slate-800/40 rounded-3xl p-10 text-center text-slate-500">
                        <p className="font-extrabold text-xs uppercase tracking-wider">No matching completed records</p>
                        <p className="text-[10px] text-slate-600 mt-1">Verify customer name spelling or security code digits.</p>
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[85vh] overflow-y-auto pr-1 no-scrollbar">
                        {matchedHistory.map((order) => (
                          <div key={order.id} className="bg-[#1e293b] p-6 rounded-3xl border border-slate-800 hover:border-slate-600 transition-colors relative group">
                            <div className="absolute top-4 right-4 bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg">
                              COMPLETED
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex flex-col items-center justify-center border border-slate-800 flex-shrink-0">
                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Order</span>
                                <span className="text-lg font-black text-white">#{order.id.slice(-3)}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-base font-black text-white tracking-tight uppercase leading-none truncate">{order.customerName}</p>
                                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md font-mono">CODE: {order.pickupCode}</span>
                                </div>
                                <p className="text-xs font-bold text-slate-400 mt-1.5 truncate max-w-[320px]">
                                  {order.items.map(i => `${i.quantity}x ${i.name}`).join(", ")}
                                </p>
                                <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                                  <span className="flex items-center gap-1 bg-slate-800/40 px-2 py-0.5 rounded border border-slate-700/20">
                                    <Clock size={10} /> {new Date(order.createdAt?.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {order.handledBy && (
                                    <span className="flex items-center gap-1 bg-emerald-500/5 text-emerald-400/80 px-2 py-0.5 rounded border border-emerald-500/5">
                                      <ChefHat size={10} /> {order.handledBy.name.split(' ')[0]}
                                    </span>
                                  )}
                                  <span className="text-emerald-500 font-black">{formatCurrency(order.totalAmount)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : !showHistory ? (
            <motion.div 
               key="active"
               initial={{ opacity: 0, x: -20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="h-full overflow-x-auto p-8 flex gap-8"
            >
              {/* COLUMN 1: NEW */}
              <section className="flex-shrink-0 w-[400px] flex flex-col gap-6">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                    Incoming ({pendingOrders.length})
                  </h2>
                </div>
                <div className="flex-1 overflow-y-auto space-y-6 no-scrollbar pb-10">
                  <AnimatePresence>
                    {pendingOrders.map(order => (
                      <OrderCard 
                        key={order.id} 
                        order={order} 
                        statusColor="border-[#f97316]"
                        statusBg="bg-[#f97316]/5"
                        statusText="New Order"
                        statusTextColor="text-orange-400"
                        onAction={() => updateStatus(order.id, "accepted")}
                        actionLabel="Start Preparing"
                        actionColor="bg-orange-600 hover:bg-orange-500"
                        isNew
                        onDelete={() => setOrderToDelete(order)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </section>

              {/* COLUMN 2: COOKING */}
              <section className="flex-shrink-0 w-[420px] flex flex-col gap-6">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    Cooking ({inProgressOrders.length})
                  </h2>
                </div>
                <div className="flex-1 overflow-y-auto space-y-6 no-scrollbar pb-10">
                  <AnimatePresence>
                    {inProgressOrders.map(order => (
                      <OrderCard 
                        key={order.id} 
                        order={order} 
                        statusColor="border-blue-500"
                        statusBg="bg-blue-500/5"
                        statusText="Cooking"
                        statusTextColor="text-blue-400"
                        onAction={() => updateStatus(order.id, "cooked")}
                        actionLabel="Order Ready"
                        actionColor="bg-blue-600 hover:bg-blue-500"
                        onDelete={() => setOrderToDelete(order)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </section>

              {/* COLUMN 3: READY */}
              <section className="flex-shrink-0 w-[400px] flex flex-col gap-6">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Ready for Pickup ({readyOrders.length})
                  </h2>
                </div>
                <div className="flex-1 overflow-y-auto space-y-6 no-scrollbar pb-10">
                  <AnimatePresence>
                    {readyOrders.map(order => (
                      <OrderCard 
                        key={order.id} 
                        order={order} 
                        statusColor="border-emerald-500"
                        statusBg="bg-emerald-500/5"
                        statusText="Call Customer"
                        statusTextColor="text-emerald-400"
                        onAction={() => updateStatus(order.id, "picked_up")}
                        actionLabel="Mark Picked Up"
                        actionColor="bg-emerald-600 hover:bg-emerald-500"
                        showCode
                        onOtpError={(name) => setOtpErrorOrder(name)}
                        onDelete={() => setOrderToDelete(order)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            </motion.div>
          ) : (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="h-full flex flex-col p-8"
            >
              <div className="max-w-6xl mx-auto w-full flex flex-col h-full">
                <div className="flex justify-between items-center mb-8 bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50">
                  <div className="flex items-center gap-4 flex-1 max-w-md">
                    <Search className="text-slate-500" size={20} />
                    <input 
                      type="text" 
                      placeholder="Search ID, Name or Code..." 
                      className="bg-transparent border-none text-white placeholder:text-slate-500 focus:ring-0 w-full font-bold"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 leading-none mb-1">Archived Records</p>
                      <p className="text-2xl font-black text-white leading-none">{historyOrders.length}</p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-10">
                  {filteredHistory.map((order) => (
                    <div key={order.id} className="bg-[#1e293b] p-6 rounded-3xl border border-slate-800 flex items-center justify-between hover:border-slate-600 transition-colors">
                      <div className="flex items-center gap-8">
                        <div className="w-20 h-20 bg-slate-900 rounded-2xl flex flex-col items-center justify-center border border-slate-800">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Order</span>
                          <span className="text-xl font-black text-white">#{order.id.slice(-3)}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <p className="text-lg font-black text-white tracking-tight uppercase leading-none">{order.customerName}</p>
                            <span className="h-4 w-px bg-slate-800" />
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-tighter truncate max-w-[300px]">
                              {order.items.map(i => `${i.quantity}x ${i.name}`).join(", ")}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-6 mt-3">
                            {/* Visual Timeline */}
                            <div className="flex items-center gap-1">
                              {['pending', 'accepted', 'cooked', 'picked_up'].map((s, idx) => {
                                const time = order.timeline?.[s as keyof typeof order.timeline];
                                return (
                                  <React.Fragment key={s}>
                                    {idx > 0 && <div className={cn("w-4 h-0.5 rounded-full", time ? "bg-emerald-500/30" : "bg-slate-800")} />}
                                    <div className="group relative">
                                      <div className={cn(
                                        "w-2 h-2 rounded-full",
                                        time ? "bg-emerald-500" : "bg-slate-800"
                                      )} />
                                      {time && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900 text-[8px] font-black py-1 px-2 rounded-md border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                                          {s.toUpperCase()}: {new Date(time.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                      )}
                                    </div>
                                  </React.Fragment>
                                );
                              })}
                            </div>

                            <div className="flex items-center gap-4 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                              <span className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-1 rounded-lg border border-slate-700/30">
                                <Calendar size={12} className="text-slate-400" /> {new Date(order.createdAt?.toDate()).toLocaleDateString()}
                              </span>
                              <span className="flex items-center gap-1.5 bg-slate-800/50 px-2 py-1 rounded-lg border border-slate-700/30">
                                <Clock size={12} className="text-slate-400" /> {new Date(order.createdAt?.toDate()).toLocaleTimeString()}
                              </span>
                              {order.handledBy && (
                                <span className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500/80 px-2 py-1 rounded-lg border border-emerald-500/10">
                                  <ChefHat size={12} /> {order.handledBy.name.split(' ')[0]}
                                </span>
                              )}
                              <span className="bg-slate-900 text-slate-300 px-3 py-1 rounded-lg border border-slate-700 font-mono">CODE: {order.pickupCode}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-emerald-500">{formatCurrency(order.totalAmount)}</p>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">COMPLETED</p>
                      </div>
                    </div>
                  ))}
                  {filteredHistory.length === 0 && (
                    <div className="text-center py-20 opacity-30">
                      <History size={64} className="mx-auto mb-4" />
                      <p className="text-xl font-black uppercase tracking-widest">No matching records found</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Stats */}
      <div className="bg-[#1e293b] border-t border-slate-800 p-4 px-10 flex justify-between items-center text-slate-400">
        <div className="flex gap-12">
          <div>
            <p className="text-[10px] uppercase font-black tracking-widest opacity-60 mb-1">Queue Depth</p>
            <p className="text-2xl font-black text-white">{orders.length}</p>
          </div>
          <div className="w-px h-10 bg-slate-800" />
          <div>
            <p className="text-[10px] uppercase font-black tracking-widest opacity-60 mb-1">Session Total</p>
            <p className="text-2xl font-black text-white">{formatCurrency(historyOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0))}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-black tracking-widest opacity-60 mb-1">System Health</p>
          <div className="flex items-center gap-2 text-emerald-500">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-xs">ONLINE • STABLE</span>
          </div>
        </div>
      </div>

      {/* Incorrect OTP Modal */}
      <AnimatePresence>
        {otpErrorOrder && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOtpErrorOrder(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed z-[60] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 border border-red-500/30 w-full max-w-sm rounded-[2rem] p-8 text-center shadow-2xl shadow-red-500/10"
            >
              <div className="w-16 h-16 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-2xl font-black">
                ⚠
              </div>
              <h3 className="text-xl font-black text-white tracking-tight uppercase mb-2">Wrong OTP</h3>
              <p className="text-sm text-slate-400 font-bold leading-relaxed mb-8">
                The OTP entered for <span className="text-orange-400 font-extrabold">{otpErrorOrder}</span> is wrong.
                <br />
                Please enter the correct OTP.
              </p>
              <button
                onClick={() => setOtpErrorOrder(null)}
                className="w-full bg-red-600 hover:bg-red-500 text-white rounded-xl py-4 font-black uppercase tracking-[0.2em] shadow-xl shadow-red-600/10 hover:shadow-red-500/20 transition-all border border-red-500 text-xs"
              >
                Enter Correct OTP
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Single Order Confirmation Modal */}
      <AnimatePresence>
        {orderToDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOrderToDelete(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed z-[60] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 border border-red-500/30 w-full max-w-sm rounded-[2rem] p-8 text-center shadow-2xl shadow-red-500/10"
            >
              <div className="w-16 h-16 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-xl">
                <Trash2 size={24} />
              </div>
              <h3 className="text-xl font-black text-white tracking-tight uppercase mb-2">Delete Order?</h3>
              <p className="text-sm text-slate-400 font-bold leading-relaxed mb-6">
                Are you sure you want to delete order <span className="text-orange-400 font-extrabold">#{orderToDelete.id.slice(-3)}</span>?
                <br />
                This action is permanent and cannot be undone.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => deleteOrder(orderToDelete.id)}
                  className="w-full bg-red-600 hover:bg-red-500 text-white rounded-xl py-4 font-black uppercase tracking-[0.2em] shadow-xl shadow-red-600/10 hover:shadow-red-500/20 transition-all border border-red-500 text-xs"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setOrderToDelete(null)}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl py-4 font-black uppercase tracking-[0.2em] transition-all border border-slate-700 text-xs"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Clear All Active Orders Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowClearConfirm(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed z-[60] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 border border-red-500/30 w-full max-w-sm rounded-[2rem] p-8 text-center shadow-2xl shadow-red-500/15"
            >
              <div className="w-16 h-16 bg-red-500/20 text-red-500 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6 text-xl animate-pulse">
                ⚠
              </div>
              <h3 className="text-xl font-black text-white tracking-tight uppercase mb-2">Clear Active Queue?</h3>
              <p className="text-sm text-slate-400 font-bold leading-relaxed mb-6">
                This will delete <span className="text-red-400 font-extrabold">{orders.length} active orders</span> from the kitchen entirely.
                <br />
                This is non-reversible. Are you absolutely sure?
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={clearActiveOrders}
                  className="w-full bg-red-600 hover:bg-red-500 text-white rounded-xl py-4 font-black uppercase tracking-[0.2em] shadow-xl shadow-red-600/10 hover:shadow-red-500/20 transition-all border border-red-500 text-xs"
                >
                  Yes, Clear All Orders
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl py-4 font-black uppercase tracking-[0.2em] transition-all border border-slate-700 text-xs"
                >
                  Keep My Queue
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Banner Notifications Overlay */}
      <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-4 w-full max-w-sm pointer-events-none">
        <AnimatePresence>
          {banners.map((banner) => (
            <motion.div
              key={banner.id}
              initial={{ opacity: 0, y: -50, scale: 0.9, x: 50 }}
              animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.85, x: 100, transition: { duration: 0.25 } }}
              className="pointer-events-auto bg-[#1e293b]/95 backdrop-blur-md border-2 border-orange-500 rounded-3xl shadow-[0_25px_60px_rgba(249,115,22,0.25)] overflow-hidden flex flex-col divide-y divide-slate-800/60"
            >
              <div className="p-4 bg-orange-500/10 flex items-center justify-between gap-3 px-6">
                <div className="flex items-center gap-2 text-orange-400 font-bold text-xs uppercase tracking-widest">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                  </span>
                  <span className="font-black text-[10px]">NEW INCOMING ORDER!</span>
                </div>
                <button
                  onClick={() => setBanners(prev => prev.filter(b => b.id !== banner.id))}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="p-6 flex items-start gap-4">
                <div className="w-14 h-14 bg-slate-900 rounded-2xl flex flex-col items-center justify-center border border-slate-800 flex-shrink-0">
                  <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none">ORDER</span>
                  <span className="text-base font-black text-white">#{banner.id.slice(-3)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-black text-white uppercase tracking-tight truncate leading-none mb-1">
                    {banner.customerName || "Walk-In Customer"}
                  </h4>
                  <p className="text-xs font-semibold text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {banner.itemsSummary}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function OrderCard({ 
  order, 
  onAction, 
  actionLabel, 
  actionColor, 
  statusColor,
  statusBg,
  statusText,
  statusTextColor,
  showCode = false,
  isNew = false,
  onOtpError,
  onDelete
}: { 
  order: Order; 
  onAction: () => void | Promise<void>; 
  actionLabel: string;
  actionColor: string;
  statusColor: string;
  statusBg: string;
  statusText: string;
  statusTextColor: string;
  showCode?: boolean;
  isNew?: boolean;
  key?: React.Key;
  onOtpError?: (name: string) => void;
  onDelete?: () => void;
}) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0, x: 200 }}
      layout
      className={cn(
        "bg-[#1e293b] rounded-[2rem] border-t-[8px] shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden",
        statusColor,
        statusBg,
        isNew && "ring-4 ring-orange-500/20"
      )}
    >
      <div className="p-8">
        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest mr-2">Order</span>
              <span className="text-5xl font-black text-white">#{order.id.slice(-3)}</span>
              <span className={cn("text-xs font-black uppercase tracking-tighter", statusTextColor)}>{statusText}</span>
            </div>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-2">
              Ordered {new Date(order.createdAt?.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete Order"
              className="p-3 bg-red-500/10 text-red-400 hover:text-white hover:bg-red-650 border border-red-500/20 hover:border-red-600 rounded-2xl transition-all cursor-pointer shadow-md active:scale-95"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>

        <div className="space-y-4 mb-8">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-start gap-4 pb-4 border-b border-slate-800/50 last:border-0 last:pb-0">
              <div className="flex items-start gap-4">
                <span className="text-3xl font-black text-orange-500 leading-none">{item.quantity}</span>
                <span className="text-2xl font-bold text-slate-200 leading-tight uppercase max-w-[200px]">{item.name}</span>
              </div>
            </div>
          ))}
        </div>

        {showCode && (
          <div className="mb-6 space-y-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block px-1">Customer Verification Code</span>
            <input 
              type="password"
              placeholder="••••••"
              maxLength={6}
              className="w-full bg-slate-900 border-2 border-slate-700 rounded-2xl py-4 px-6 text-center text-3xl font-black tracking-[0.4em] text-white placeholder:text-slate-700 focus:border-emerald-500/50 focus:outline-none transition-all cursor-text font-mono"
              id={`verify-${order.id}`}
              onKeyPress={(e) => {
                if (!/[0-9]/.test(e.key)) e.preventDefault();
              }}
            />
          </div>
        )}

        <button
          onClick={() => {
            if (showCode) {
              const input = document.getElementById(`verify-${order.id}`) as HTMLInputElement;
              if (input.value === order.pickupCode) {
                onAction();
              } else {
                input.classList.add('border-red-500', 'animate-shake');
                setTimeout(() => input.classList.remove('border-red-500', 'animate-shake'), 500);
                input.value = "";
                input.focus();
                if (onOtpError) {
                  onOtpError(order.customerName);
                }
              }
            } else {
              onAction();
            }
          }}
          className={cn(
            "w-full py-6 rounded-2xl text-2xl font-black shadow-[0_10px_20px_rgba(0,0,0,0.2)] uppercase tracking-tighter active:scale-[0.96] transition-all transform",
            actionColor,
            "text-white border-b-4 border-black/20"
          )}
        >
          {showCode ? "Verify & Hand Over" : actionLabel}
        </button>
      </div>
    </motion.div>
  );
}

