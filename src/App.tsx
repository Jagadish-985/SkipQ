/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { auth, kitchenAuth } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import CustomerHome from "./pages/CustomerHome";
import MyOrders from "./pages/MyOrders";
import KitchenDashboard from "./pages/KitchenDashboard";
import AdminMenu from "./pages/AdminMenu";
import GateScreen from "./pages/GateScreen";
import { Loader2 } from "lucide-react";

export default function App() {
  const [customerUser, setCustomerUser] = useState<User | null>(null);
  const [kitchenUser, setKitchenUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let loadedCustomer = false;
    let loadedKitchen = false;

    const checkComplete = () => {
      if (loadedCustomer && loadedKitchen) {
        setLoading(false);
      }
    };

    const unsubscribeCustomer = onAuthStateChanged(auth, (u) => {
      setCustomerUser(u);
      loadedCustomer = true;
      checkComplete();
    });

    const unsubscribeKitchen = onAuthStateChanged(kitchenAuth, (u) => {
      setKitchenUser(u);
      loadedKitchen = true;
      checkComplete();
    });

    return () => {
      unsubscribeCustomer();
      unsubscribeKitchen();
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<GateScreen customerUser={customerUser} kitchenUser={kitchenUser} />} />
        
        {/* Customer Routes */}
        <Route path="/home" element={customerUser ? <CustomerHome user={customerUser} /> : <Navigate to="/" />} />
        <Route path="/orders" element={customerUser ? <MyOrders user={customerUser} /> : <Navigate to="/" />} />
        
        {/* Kitchen Routes */}
        <Route path="/kitchen" element={kitchenUser ? <KitchenDashboard user={kitchenUser} /> : <Navigate to="/" />} />
        
        {/* Admin/Menu Management */}
        <Route path="/admin" element={(customerUser || kitchenUser) ? <AdminMenu user={(kitchenUser || customerUser)!} /> : <Navigate to="/" />} />
      </Routes>
    </Router>
  );
}
