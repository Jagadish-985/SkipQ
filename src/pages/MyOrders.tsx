import React, { useEffect, useState } from "react";
import { User } from "firebase/auth";
import { db, OperationType, handleFirestoreError } from "../lib/firebase";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { ArrowLeft, Clock, CheckCircle2, ChevronRight, Package, Utensils } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { formatCurrency, cn } from "../lib/utils";

interface Order {
  id: string;
  status: string;
  pickupCode: string;
  items: any[];
  totalAmount: number;
  createdAt: any;
}

export default function MyOrders({ user }: { user: User }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(
      collection(db, "orders"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const orderData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Order[];
        // Sort by createdAt desc in JavaScript to avoid composite index requirement
        orderData.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });
        setOrders(orderData);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, "orders")
    );

    return () => unsubscribe();
  }, [user.uid]);

  const activeOrders = orders.filter(o => o.status !== 'picked_up');
  const pastOrders = orders.filter(o => o.status === 'picked_up');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-white border-b border-gray-100 p-6 sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate("/home")}
            className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-black text-gray-900 uppercase tracking-tight">My Orders</h1>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-8 max-w-xl mx-auto w-full">
        {/* Active Orders Section */}
        {activeOrders.length > 0 && (
          <section>
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Active Orders ({activeOrders.length})</h2>
            <div className="space-y-4">
              {activeOrders.map((order) => (
                <OrderCard key={order.id} order={order} isActive />
              ))}
            </div>
          </section>
        )}

        {/* Past Orders Section */}
        <section>
          <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Past Orders</h2>
          {pastOrders.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-dashed border-gray-200 text-center">
              <Package size={40} className="mx-auto text-gray-200 mb-4" />
              <p className="text-sm font-bold text-gray-400">No past orders yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pastOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function OrderCard({ order, isActive = false }: { order: Order; isActive?: boolean; key?: React.Key }) {
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'pending': return { label: 'Received', color: 'text-orange-500', bg: 'bg-orange-50' };
      case 'accepted': return { label: 'In Kitchen', color: 'text-blue-500', bg: 'bg-blue-50' };
      case 'preparing': return { label: 'Cooking', color: 'text-blue-600', bg: 'bg-blue-100' };
      case 'cooked': return { label: 'Ready to Pickup', color: 'text-green-600', bg: 'bg-green-100' };
      case 'picked_up': return { label: 'Fulfilled', color: 'text-gray-400', bg: 'bg-gray-50' };
      default: return { label: status, color: 'text-gray-400', bg: 'bg-gray-50' };
    }
  };

  const status = getStatusDisplay(order.status);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-white rounded-3xl p-5 border border-gray-100 shadow-sm overflow-hidden",
        isActive && "ring-2 ring-orange-500 ring-offset-2"
      )}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">ID #{order.id.slice(-5)}</span>
          <p className="text-xs text-gray-500 font-medium">
            {order.createdAt?.toDate ? new Date(order.createdAt.toDate()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Just now'}
          </p>
        </div>
        <div className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest", status.bg, status.color)}>
          {status.label}
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {order.items.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center text-sm">
            <span className="text-gray-900 font-bold">{item.quantity}x {item.name}</span>
            <span className="text-gray-500">{formatCurrency(item.price * item.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Paid</p>
            <p className="text-sm font-black text-gray-900">{formatCurrency(order.totalAmount)}</p>
          </div>
          {isActive && (
            <div className="bg-gray-900 text-white px-3 py-1.5 rounded-xl text-center">
              <p className="text-[8px] font-black uppercase tracking-widest leading-none opacity-60">Pickup Code</p>
              <p className="text-lg font-black leading-none mt-1 tracking-widest">
                {order.status === 'pending' ? '••••' : order.pickupCode}
              </p>
            </div>
          )}
        </div>
        
        {isActive && order.status === 'cooked' && (
          <div className="flex items-center gap-1.5 text-green-600 animate-pulse">
            <CheckCircle2 size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Collect Now</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
