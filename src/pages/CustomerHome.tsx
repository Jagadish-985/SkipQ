import { User } from "firebase/auth";
import React, { useEffect, useState } from "react";
import { db, OperationType, handleFirestoreError } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy, where, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Search, Filter, ShoppingBag, LogOut, ChevronRight, Info, Package, Bell, BellRing, Check, BellOff, CheckCircle2, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, formatCurrency } from "../lib/utils";
import { auth } from "../lib/firebase";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import CartDrawer from "../components/CartDrawer";

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  isVeg: boolean;
  isAvailable: boolean;
  imageUrl: string;
}

export default function CustomerHome({ user }: { user: User }) {
  const navigate = useNavigate();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "veg" | "non-veg">("all");
  const [cart, setCart] = useState<{ item: MenuItem; quantity: number }[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [activeSubscriptions, setActiveSubscriptions] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [cartFeedback, setCartFeedback] = useState<{ id: number; itemId: string }[]>([]);

  // Active Subscriptions Listener
  useEffect(() => {
    const q = query(
      collection(db, "menu_subscriptions"),
      where("userId", "==", user.uid),
      where("status", "==", "pending")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveSubscriptions(items);
    }, (err) => {
      console.error("Error fetching subscriptions:", err);
    });
    return () => unsubscribe();
  }, [user.uid]);

  // Notifications Inbox Listener
  useEffect(() => {
    const q = query(
      collection(db, "user_notifications"),
      where("userId", "==", user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort in memory by createdAt desc
      items.sort((a: any, b: any) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
      setNotifications(items);
    }, (err) => {
      console.error("Error fetching notifications:", err);
    });
    return () => unsubscribe();
  }, [user.uid]);

  useEffect(() => {
    localStorage.setItem("last_portal", "employee");
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "orders"), 
      where("userId", "==", user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort by createdAt desc in JavaScript
      items.sort((a: any, b: any) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
      // Find the most recent active order (not picked_up)
      const active = items.find((o: any) => o.status !== "picked_up");
      setActiveOrder(active || null);
    }, (err) => {
      console.error("Error fetching active order:", err);
    });
    return () => unsubscribe();
  }, [user.uid]);

  useEffect(() => {
    const q = query(collection(db, "menu"), orderBy("name"));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
        setMenuItems(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, "menu")
    );
    return () => unsubscribe();
  }, []);

  const filteredItems = menuItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" ? true : (filter === "veg" ? item.isVeg : !item.isVeg);
    return matchesSearch && matchesFilter;
  });

  const handleSubscribe = async (item: MenuItem) => {
    try {
      await addDoc(collection(db, "menu_subscriptions"), {
        itemId: item.id,
        itemName: item.name,
        userId: user.uid,
        userEmail: user.email || `${user.uid}@mnc.com`,
        userName: user.displayName || user.email?.split('@')[0] || "Customer",
        status: "pending",
        createdAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "menu_subscriptions");
    }
  };

  const handleUnsubscribe = async (subId: string) => {
    try {
      await deleteDoc(doc(db, "menu_subscriptions", subId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `menu_subscriptions/${subId}`);
    }
  };

  const handleDismissNotification = async (notificationId: string) => {
    try {
      await deleteDoc(doc(db, "user_notifications", notificationId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `user_notifications/${notificationId}`);
    }
  };

  const handleClearAllNotifications = async () => {
    try {
      const promises = notifications.map(notif => deleteDoc(doc(db, "user_notifications", notif.id)));
      await Promise.all(promises);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "user_notifications");
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.item.id === item.id);
      if (existing) {
        return prev.map(i => i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { item, quantity: 1 }];
    });

    const fId = Date.now() + Math.random();
    setCartFeedback(prev => [...prev, { id: fId, itemId: item.id }]);
    setTimeout(() => {
      setCartFeedback(prev => prev.filter(f => f.id !== fId));
    }, 800);
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.item.id === itemId);
      if (existing && existing.quantity > 1) {
        return prev.map(i => i.item.id === itemId ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return prev.filter(i => i.item.id !== itemId);
    });
  };

  const cartTotal = cart.reduce((acc, curr) => acc + (curr.item.price * curr.quantity), 0);
  const cartCount = cart.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white px-4 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Welcome, {user.displayName || user.email?.split('@')[0]}</span>
            <div className="flex items-center text-sm font-bold text-gray-900">
              MNC Food Court • Floor 4 <ChevronRight size={14} className="ml-1 text-orange-500" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowNotifications(prev => !prev)}
              className="relative w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 focus:outline-none hover:bg-gray-200 transition-colors"
            >
              {notifications.length > 0 ? (
                <BellRing size={20} className="text-orange-500 animate-pulse" />
              ) : (
                <Bell size={20} />
              )}
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white font-black text-[8px] px-1.5 py-0.5 rounded-full ring-2 ring-white">
                  {notifications.length}
                </span>
              )}
            </button>
            <button 
              onClick={() => navigate("/orders")}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 focus:outline-none"
            >
              <Package size={20} />
            </button>
            <button 
              onClick={() => signOut(auth)}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 focus:outline-none"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search for dishes..."
            className="w-full bg-gray-100 border-none rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-orange-500 transition-all outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filters */}
        <div className="flex space-x-2 mt-4 overflow-x-auto pb-1 no-scrollbar">
          {(["all", "veg", "non-veg"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1 text-[10px] rounded-full font-bold border transition-all capitalize",
                filter === f 
                  ? f === 'veg' ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-900 text-white border-gray-900"
                  : "bg-gray-100 text-gray-700 border-gray-200"
              )}
            >
              {f === 'veg' ? 'VEG ONLY' : f === 'non-veg' ? 'NON-VEG' : 'ALL'}
            </button>
          ))}
        </div>
      </header>

      {/* Hero Banner (Zomato Style) */}
      <div className="px-4 mt-6">
        <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-3xl p-6 text-white overflow-hidden relative">
          <div className="relative z-10">
            <h2 className="text-2xl font-bold mb-1">Welcome, {user.displayName || user.email?.split('@')[0] || 'Employee'}!</h2>
            <p className="text-white/85 text-xs">Ready to serve you fresh and delightful meals today.</p>
          </div>
          <Utensils className="absolute -bottom-4 -right-4 w-32 h-32 text-white/10 rotate-12" />
        </div>
      </div>

      {/* Menu List */}
      <main className="px-4 mt-8">
        <AnimatePresence>
          {activeOrder && (() => {
            const steps = [
              { label: "Placed", desc: "Order submitted" },
              { label: "Accepted", desc: "Approved by Staff" },
              { label: "Preparing", desc: "In the Kitchen" },
              { label: "Cooked", desc: "Chef Finished" },
              { label: "Ready for Pickup", desc: "At the Counter" }
            ];

            const getStepIndex = (status: string) => {
              switch (status) {
                case "pending": return 0;
                case "accepted": return 1;
                case "preparing": return 2;
                case "cooked": return 4; // Highlighting Ready for Pickup!
                default: return 0;
              }
            };

            const currentStepIndex = getStepIndex(activeOrder.status);
            const isCooked = activeOrder.status === 'cooked';

            return (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mb-8"
              >
                <div className={cn(
                  "p-6 text-white rounded-3xl shadow-xl overflow-hidden relative transition-all duration-300 border",
                  isCooked
                    ? "bg-gradient-to-br from-emerald-600 to-teal-700 shadow-emerald-500/20 border-emerald-400/20"
                    : activeOrder.status === 'preparing'
                    ? "bg-gradient-to-br from-orange-500 to-red-600 shadow-orange-500/20 border-orange-400/20"
                    : activeOrder.status === 'accepted'
                    ? "bg-gradient-to-br from-[#1e293b] to-amber-950/40 shadow-slate-900/40 border-slate-700/50"
                    : "bg-gradient-to-br from-slate-950 via-[#131d31] to-orange-950/30 shadow-slate-950/60 border-slate-800/80"
                )}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Active Order Tracker</span>
                      <h4 className="text-xl font-black tracking-tight mt-0.5">
                        {activeOrder.status === 'pending' && 'ORDER PLACED'}
                        {activeOrder.status === 'accepted' && 'ORDER ACCEPTED'}
                        {activeOrder.status === 'preparing' && 'PREPARING YOUR DISHES...'}
                        {activeOrder.status === 'cooked' && 'DELICIOUS & READY FOR PICKUP!'}
                      </h4>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-75 block">ID LAST 3</span>
                      <span className="text-base font-black tracking-tight">#{activeOrder.id.slice(-3)}</span>
                    </div>
                  </div>

                  {/* 5-Stage Progressive Timeline */}
                  <div className="my-8 relative">
                    <div className="absolute left-2 right-2 top-3 -translate-y-1/2 h-1 bg-white/10 rounded-full z-0 overflow-hidden">
                      <motion.div
                        className={cn(
                          "h-full shadow-[0_0_8px_rgba(255,255,255,0.7)]",
                          isCooked ? "bg-emerald-400" : "bg-orange-400"
                        )}
                        initial={{ width: 0 }}
                        animate={{
                          width: `${(currentStepIndex / 4) * 100}%`
                        }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </div>

                    <div className="relative flex justify-between items-center z-10">
                      {steps.map((step, idx) => {
                        const isCompleted = idx < currentStepIndex;
                        const isActive = idx === currentStepIndex;
                        const isFuture = idx > currentStepIndex;

                        return (
                          <div key={idx} className="flex flex-col items-center">
                            <motion.div
                              className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 font-bold text-[9px] shadow-md z-10",
                                isCompleted
                                  ? (isCooked ? "bg-emerald-400 text-teal-900" : "bg-white text-orange-600")
                                  : isActive
                                  ? (isCooked ? "bg-white text-emerald-600 ring-4 ring-emerald-400/30 scale-110" : "bg-white text-orange-600 ring-4 ring-orange-500/30 scale-110")
                                  : "bg-slate-900/80 text-white/40 border border-white/10"
                              )}
                              animate={isActive ? { scale: [1, 1.15, 1] } : {}}
                              transition={isActive ? { repeat: Infinity, duration: 2, ease: "easeInOut" } : {}}
                            >
                              {isCompleted ? (
                                <Check size={11} strokeWidth={3} />
                              ) : isActive ? (
                                <span className={cn(
                                  "w-2 h-2 rounded-full",
                                  isCooked ? "bg-emerald-500 animate-ping" : "bg-orange-500 animate-ping"
                                )} />
                              ) : (
                                <span>{idx + 1}</span>
                              )}
                            </motion.div>
                            <span className={cn(
                              "text-[8px] font-black uppercase tracking-wider mt-2.5 transition-all text-center max-w-[55px] leading-tight",
                              isActive
                                ? "text-white opacity-100 font-black scale-102"
                                : isCompleted
                                ? "text-white/85 font-semibold"
                                : "text-white/35 font-medium"
                            )}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className={cn(
                    "flex items-center justify-between p-4 rounded-2xl",
                    isCooked ? "bg-emerald-500/20 border border-emerald-400/20" : "bg-white/5 border border-white/10"
                  )}>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-0.5">Pick-up Security Code</span>
                      <div className={cn(
                        "text-3xl font-black tracking-[0.2em] leading-none mt-1",
                        isCooked 
                          ? "text-white font-mono animate-pulse" 
                          : activeOrder.status !== 'pending'
                          ? "text-white/80 font-mono"
                          : "text-white/35"
                      )}>
                        {activeOrder.status !== 'pending' ? activeOrder.pickupCode : '••••'}
                      </div>
                    </div>
                    <div className="text-right max-w-[150px]">
                      <p className="text-[10px] font-bold leading-relaxed opacity-90">
                        {activeOrder.status === 'pending'
                          ? '👨‍🍳 We are matching the queue, preparing with culinary care.'
                          : isCooked
                          ? '✅ Done! Show this code to the counter for validation & lookup.'
                          : '🍳 Kitchen has received and started preparing! Code is ready.'
                        }
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/10 flex justify-center">
                    <button
                      onClick={() => navigate("/orders")}
                      className="text-[10px] font-black uppercase tracking-widest bg-white/10 border border-white/10 px-4 py-2 rounded-full hover:bg-white/20 hover:border-white/20 transition-all flex items-center gap-2 cursor-pointer"
                    >
                      View Order Receipt History <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Recommended for You</h3>
          <Filter size={14} className="text-gray-300" />
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-20">
            <ShoppingBag className="mx-auto text-gray-200 w-16 h-16 mb-4" />
            <p className="text-gray-500">No items found matching your filters.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => {
              const matchesSub = activeSubscriptions.find((s) => s.itemId === item.id);
              return (
                <motion.div
                  layout
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 border-b border-gray-50 pb-4 transition-all",
                    !item.isAvailable && "opacity-80 bg-gray-100/40 rounded-2xl p-2 border-none"
                  )}
                >
                  <div className="w-16 h-16 flex-shrink-0 relative">
                    <img 
                      src={item.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=200"} 
                      alt={item.name}
                      className={cn("w-full h-full object-cover rounded-xl bg-gray-100", !item.isAvailable && "filter grayscale")}
                    />
                    {!item.isAvailable && (
                      <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
                        <span className="text-[8px] font-black tracking-widest text-white uppercase bg-black/60 px-1 py-0.5 rounded">SOLD OUT</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className={cn(
                        "w-3 h-3 border flex items-center justify-center rounded-sm p-[1px]",
                        item.isVeg ? "border-green-600" : "border-red-600"
                      )}>
                        <div className={cn("w-full h-full rounded-full", item.isVeg ? "bg-green-600" : "bg-red-600")} />
                      </div>
                      <p className="text-sm font-bold text-gray-800">{item.name}</p>
                    </div>
                    <p className="text-[10px] text-gray-400 italic line-clamp-1">{item.description}</p>
                    <p className="text-sm font-bold text-orange-600 mt-1">
                      {formatCurrency(item.price)}
                    </p>
                  </div>
                  
                  <div className="flex-shrink-0 relative">
                    <AnimatePresence>
                      {cartFeedback.filter(f => f.itemId === item.id).map(f => (
                        <motion.span
                          key={f.id}
                          initial={{ opacity: 1, y: 15, scale: 0.6, rotate: -10 }}
                          animate={{ opacity: 0, y: -45, scale: 1.3, rotate: 10 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.65, ease: "easeOut" }}
                          className="absolute -top-4 left-1/2 -translate-x-1/2 text-white font-black text-xs pointer-events-none z-50 select-none bg-orange-500 py-1 px-2.5 rounded-full shadow-lg shadow-orange-500/30"
                        >
                          +1
                        </motion.span>
                      ))}
                    </AnimatePresence>
                    {!item.isAvailable ? (
                      matchesSub ? (
                        <button
                          onClick={() => handleUnsubscribe(matchesSub.id)}
                          className="px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-[10px] font-black tracking-wider uppercase active:scale-95 transition-all flex items-center gap-1 shadow-sm shadow-green-100"
                        >
                          <Check size={10} strokeWidth={3} />
                          ALERTON
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSubscribe(item)}
                          className="px-2.5 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] font-black tracking-wider uppercase active:scale-95 transition-all flex items-center gap-1 hover:bg-orange-600 shadow-sm"
                        >
                          <Bell size={10} />
                          NOTIFY ME
                        </button>
                      )
                    ) : cart.find(i => i.item.id === item.id) ? (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg flex items-center p-1">
                        <button 
                          onClick={() => removeFromCart(item.id)}
                          className="w-6 h-6 flex items-center justify-center text-orange-600 font-bold"
                        >
                          -
                        </button>
                        <span className="px-2 text-xs font-bold text-orange-600">
                          {cart.find(i => i.item.id === item.id)?.quantity}
                        </span>
                        <button 
                          onClick={() => addToCart(item)}
                          className="w-6 h-6 flex items-center justify-center text-orange-600 font-bold"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(item)}
                        className="px-4 py-1.5 bg-orange-50 text-orange-600 border border-orange-200 rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-all"
                      >
                        ADD
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Cart Button */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-4 right-4 z-40"
          >
            <button
              onClick={() => setIsCartOpen(true)}
              className="w-full bg-green-600 hover:bg-green-500 active:scale-98 transition-all text-white rounded-2xl p-4 flex items-center justify-between shadow-xl shadow-green-600/30"
            >
              <div className="flex flex-col items-start leading-tight">
                <motion.span 
                  key={`items-${cartCount}`}
                  initial={{ scale: 0.8 }}
                  animate={{ scale: [1, 1.25, 1] }}
                  transition={{ duration: 0.3 }}
                  className="text-[10px] font-bold uppercase tracking-wider opacity-90 bg-green-700/80 px-2 py-0.5 rounded-full mb-1"
                >
                  {cartCount} ITEMS
                </motion.span>
                <motion.span 
                  key={`total-${cartTotal}`}
                  initial={{ opacity: 0.8 }}
                  animate={{ scale: [1, 1.05, 1], opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="text-base font-bold whitespace-nowrap"
                >
                  {formatCurrency(cartTotal)} plus taxes
                </motion.span>
              </div>
              <motion.div 
                key={`text-${cartCount}`}
                initial={{ scale: 0.9 }}
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 0.3 }}
                className="flex items-center font-bold text-lg uppercase tracking-tight"
              >
                VIEW CART <ChevronRight size={20} className="ml-1 animate-bounce" style={{ animationDuration: '1.5s' }} />
              </motion.div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <CartDrawer 
        isOpen={isCartOpen} 
        onClose={() => setIsCartOpen(false)} 
        cart={cart}
        setCart={setCart}
        user={user}
      />

      {/* Notifications Drawer/Modal */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex justify-end"
            onClick={() => setShowNotifications(false)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-6"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <Bell className="text-orange-500" size={22} />
                  <h3 className="text-lg font-black text-gray-900 tracking-tight">Notification Center</h3>
                </div>
                <button 
                  onClick={() => setShowNotifications(false)}
                  className="p-1 rounded-full hover:bg-gray-100 text-gray-500 font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Subscriptions & Inbox tabs */}
              <div className="flex-1 overflow-y-auto space-y-6">
                {/* Section 1: Active Subscriptions */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Active Stock Alerts ({activeSubscriptions.length})</span>
                  </h4>
                  {activeSubscriptions.length === 0 ? (
                    <p className="text-xs text-gray-400 bg-gray-50 p-4 rounded-xl border border-dashed border-gray-200 text-center">
                      No active alerts. Add notification alerts on sold out dishes.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activeSubscriptions.map((sub) => (
                        <div key={sub.id} className="bg-orange-50/50 border border-orange-100 p-3 rounded-xl flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-gray-800">{sub.itemName}</span>
                            <span className="text-[10px] text-orange-600 font-semibold tracking-wide uppercase mt-0.5">PENDING STOCK AVAILABILITY</span>
                          </div>
                          <button 
                            onClick={() => handleUnsubscribe(sub.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                            title="Cancel subscription"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 2: Inbox Logs */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Back-In-Stock Messages
                    </h4>
                    {notifications.length > 0 && (
                      <button 
                        onClick={handleClearAllNotifications}
                        className="text-[10px] font-bold text-orange-600 hover:underline"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-gray-400 bg-gray-50 p-4 rounded-xl border border-dashed border-gray-200 text-center">
                      Your notification inbox is empty.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {notifications.map((notif) => (
                        <div key={notif.id} className="bg-white border border-gray-100 shadow-sm p-4 rounded-xl flex items-start gap-3 relative overflow-hidden group">
                          <div className="w-2 h-2 mt-1.5 bg-green-500 rounded-full flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-xs text-gray-700 leading-normal">{notif.message}</p>
                            <span className="text-[9px] text-gray-400 block mt-1">
                              {notif.createdAt?.seconds 
                                ? new Date(notif.createdAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) 
                                : 'Just now'}
                            </span>
                          </div>
                          <button 
                            onClick={() => handleDismissNotification(notif.id)}
                            className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-50 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Dismiss alert"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="border-t pt-4 text-center">
                <p className="text-[10px] text-gray-400 font-medium">
                  We send real-time alerts the millisecond kitchen updates availability.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Utensils(props: any) {
  return (
    <svg 
      {...props}
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    >
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  );
}
