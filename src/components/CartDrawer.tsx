import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingBag, CreditCard, ChevronRight, CheckCircle2 } from "lucide-react";
import { User } from "firebase/auth";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import React, { useState } from "react";
import { formatCurrency, cn } from "../lib/utils";
import { QRCodeSVG } from "qrcode.react";

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

interface CartItem {
  item: MenuItem;
  quantity: number;
}

export default function CartDrawer({ 
  isOpen, 
  onClose, 
  cart, 
  setCart,
  user 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  user: User;
}) {
  const [step, setStep] = useState<"review" | "payment" | "success">("review");
  const [loading, setLoading] = useState(false);
  const [orderDetails, setOrderDetails] = useState<any>(null);

  const subtotal = cart.reduce((acc, curr) => acc + (curr.item.price * curr.quantity), 0);
  const taxes = subtotal * 0.05; // 5% GST
  const total = subtotal + taxes;

  const handlePlaceOrder = async () => {
    setLoading(true);
    try {
      const pickupCode = Math.floor(100000 + Math.random() * 900000).toString();
      const orderRef = await addDoc(collection(db, "orders"), {
        userId: user.uid,
        customerName: user.displayName || user.email?.split('@')[0],
        items: cart.map(i => ({ id: i.item.id, name: i.item.name, quantity: i.quantity, price: i.item.price })),
        totalAmount: total,
        status: "pending",
        pickupCode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        timeline: {
          pending: serverTimestamp()
        }
      });
      
      setOrderDetails({ id: orderRef.id, code: pickupCode });
      setStep("success");
      setCart([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "orders");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
    if (step === "success") {
      setStep("review");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 max-h-[90vh] overflow-y-auto flex flex-col no-scrollbar"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-gray-900">
                {step === "review" && "Checkout"}
                {step === "payment" && "UPI Payment"}
                {step === "success" && "Order Placed!"}
              </h2>
              <button 
                onClick={handleClose}
                className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 flex-1">
              {step === "review" && (
                <>
                  <div className="space-y-4">
                    {cart.map((i) => (
                      <div key={i.item.id} className="flex items-center justify-between pb-3 border-b border-gray-50 border-dashed last:border-0 last:pb-0">
                        <div className="flex items-center space-x-3">
                          <div className={cn(
                            "w-3 h-3 border flex items-center justify-center rounded-sm p-[1px]",
                            i.item.isVeg ? "border-green-600" : "border-red-600"
                          )}>
                            <div className={cn("w-full h-full rounded-full", i.item.isVeg ? "bg-green-600" : "bg-red-600")} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-800 leading-tight">{i.item.name}</p>
                            <p className="text-[10px] text-gray-400 font-bold mt-0.5 uppercase tracking-wide">{i.quantity} x {formatCurrency(i.item.price)}</p>
                          </div>
                        </div>
                        <p className="text-sm font-bold text-gray-900">{formatCurrency(i.item.price * i.quantity)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 space-y-2">
                    <div className="flex justify-between text-xs text-gray-400 font-bold uppercase tracking-widest">
                      <span>Subtotal</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 font-bold uppercase tracking-widest">
                      <span>Taxes & Charges</span>
                      <span>{formatCurrency(taxes)}</span>
                    </div>
                    <div className="flex justify-between text-xl font-black text-gray-900 pt-2 border-t border-gray-100 mt-4">
                      <span>To Pay</span>
                      <span>{formatCurrency(total)}</span>
                    </div>
                  </div>
                </>
              )}

              {step === "payment" && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="bg-blue-50 p-6 rounded-3xl mb-6 flex flex-col items-center border border-blue-100 shadow-sm">
                    <div className="bg-white p-4 rounded-2xl shadow-inner border border-blue-100 mb-4">
                      <QRCodeSVG 
                        value={`upi://pay?pa=stall@okaxis&pn=MNCFoodCourt&am=${total.toFixed(2)}&cu=INR`}
                        size={180}
                      />
                    </div>
                    <p className="text-sm text-blue-800 font-medium">Scan to pay at MNC Stall</p>
                    <p className="text-xl font-black text-blue-900 mt-1">{formatCurrency(total)}</p>
                  </div>
                  
                  <div className="w-full grid grid-cols-2 gap-4 mb-8">
                    <button className="flex flex-col items-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/e/e1/Google_Pay_Logo.svg" alt="GPay" className="h-6 mb-2" />
                      <span className="text-[10px] font-bold text-gray-500">GOOGLE PAY</span>
                    </button>
                    <button className="flex flex-col items-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/2/24/PhonePe_Logo.svg" alt="PhonePe" className="h-6 mb-2" />
                      <span className="text-[10px] font-bold text-gray-500">PHONEPE</span>
                    </button>
                  </div>
                </div>
              )}

              {step === "success" && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-6 border-4 border-green-50 shadow-inner">
                    <CheckCircle2 size={56} />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">Order Successful</h3>
                  <p className="text-gray-500 text-sm mb-8 leading-relaxed max-w-xs">
                    Your order is being sent to the kitchen. We'll notify you when it's ready!
                  </p>
                  
                  <button 
                    onClick={handleClose}
                    className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold text-lg shadow-xl shadow-gray-200"
                  >
                    Track Order Status
                  </button>
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="p-6 pt-0 bg-white shadow-[0_-8px_30px_rgb(0,0,0,0.04)]">
              {step === "review" && (
                <button
                  onClick={() => setStep("payment")}
                  className="w-full py-5 bg-orange-600 text-white rounded-2xl font-bold text-lg flex items-center justify-between px-6 shadow-xl shadow-orange-100"
                >
                  <div className="text-left leading-none">
                    <span className="text-[10px] uppercase tracking-widest opacity-80 block font-bold">Checkout Total</span>
                    <span className="text-xl font-black">{formatCurrency(total)}</span>
                  </div>
                  <div className="flex items-center text-sm font-bold uppercase tracking-widest">
                    Pay Now <ChevronRight size={18} className="ml-1" />
                  </div>
                </button>
              )}
              {step === "payment" && (
                <button
                  onClick={handlePlaceOrder}
                  disabled={loading}
                  className="w-full py-4 bg-green-600 text-white rounded-2xl font-bold text-lg flex items-center justify-center shadow-xl shadow-green-100 disabled:opacity-50"
                >
                  {loading ? (
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full"
                    />
                  ) : (
                    "PROCEED TO PAY & ORDER"
                  )}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
