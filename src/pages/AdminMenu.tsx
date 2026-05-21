import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, signOut } from "firebase/auth";
import { db as defaultDb, auth as defaultAuth, kitchenDb, kitchenAuth, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, getDocs, where } from "firebase/firestore";
import { Plus, Trash2, Edit2, Save, X, Utensils, IndianRupee, Image as ImageIcon, Check, Ban, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, formatCurrency } from "../lib/utils";

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

export default function AdminMenu({ user }: { user: User }) {
  const db = kitchenAuth.currentUser ? kitchenDb : defaultDb;
  const auth = kitchenAuth.currentUser ? kitchenAuth : defaultAuth;
  const navigate = useNavigate();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState<Partial<MenuItem>>({
    name: "",
    description: "",
    price: 0,
    category: "Main",
    isVeg: true,
    isAvailable: true,
    imageUrl: ""
  });
  const [isFetchingImage, setIsFetchingImage] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  const autoFetchImage = async (itemName: string): Promise<string> => {
    if (!itemName) return "";
    try {
      setIsFetchingImage(true);
      const res = await fetch(`/api/fetch-dish-image?name=${encodeURIComponent(itemName)}`);
      const data = await res.json();
      if (data.imageUrl) {
        return data.imageUrl;
      }
    } catch (error) {
      console.error("Error auto-fetching image:", error);
    } finally {
      setIsFetchingImage(false);
    }
    return "";
  };

  const handleStartEdit = (item: MenuItem) => {
    setEditingItem(item);
    setIsAdding(false);
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editingItem.name || !editingItem.price) return;
    try {
      let finalImageUrl = editingItem.imageUrl || "";
      if (!finalImageUrl) {
        finalImageUrl = await autoFetchImage(editingItem.name);
      }
      const itemRef = doc(db, "menu", editingItem.id);
      await updateDoc(itemRef, {
        name: editingItem.name,
        description: editingItem.description,
        price: Number(editingItem.price),
        isVeg: editingItem.isVeg,
        imageUrl: finalImageUrl,
        isAvailable: editingItem.isAvailable,
        category: editingItem.category || "Main"
      });
      setEditingItem(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `menu/${editingItem.id}`);
    }
  };

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

  const handleAdd = async () => {
    if (!newItem.name || !newItem.price) return;
    try {
      let finalImageUrl = newItem.imageUrl || "";
      if (!finalImageUrl) {
        finalImageUrl = await autoFetchImage(newItem.name);
      }
      await addDoc(collection(db, "menu"), {
        ...newItem,
        imageUrl: finalImageUrl,
        createdAt: serverTimestamp(),
      });
      setIsAdding(false);
      setNewItem({ name: "", description: "", price: 0, category: "Main", isVeg: true, isAvailable: true, imageUrl: "" });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "menu");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await deleteDoc(doc(db, "menu", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `menu/${id}`);
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      const nextAvailable = !item.isAvailable;
      await updateDoc(doc(db, "menu", item.id), {
        isAvailable: nextAvailable
      });

      // If the item became available, notify all pending subscribers
      if (nextAvailable) {
        try {
          const subscriptionsQuery = query(
            collection(db, "menu_subscriptions"),
            where("itemId", "==", item.id),
            where("status", "==", "pending")
          );
          const snapshot = await getDocs(subscriptionsQuery);
          
          for (const sDoc of snapshot.docs) {
            const subData = sDoc.data();
            
            // Create a user-specific notification
            await addDoc(collection(db, "user_notifications"), {
              userId: subData.userId,
              itemId: item.id,
              itemName: item.name,
              message: `🎉 Great news! "${item.name}" is now back in stock! Tap to order.`,
              read: false,
              createdAt: serverTimestamp()
            });

            // Mark subscription as notified
            await updateDoc(doc(db, "menu_subscriptions", sDoc.id), {
              status: "notified"
            });
          }
        } catch (subErr) {
          console.error("Failed to notify subscribers:", subErr);
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `menu/${item.id}`);
    }
  };

  const handleToggleSeeding = async () => {
    const samples = [
      { name: "Chole Bhature", description: "Fluffy fried bread with spicy chickpea curry", price: 120, category: "Mains", isVeg: true, isAvailable: true, imageUrl: "https://images.unsplash.com/photo-1626132646522-0a1b63bd5662?auto=format&fit=crop&q=80&w=400" },
      { name: "Paneer Tikka Roll", description: "Grilled cottage cheese with mint chutney in a wrap", price: 140, category: "Rolls", isVeg: true, isAvailable: true, imageUrl: "https://images.unsplash.com/photo-1626776876729-bab4369a5a54?auto=format&fit=crop&q=80&w=400" },
      { name: "Chicken Biryani", description: "Aromatic basmati rice with tender chicken and spices", price: 220, category: "Rice", isVeg: false, isAvailable: true, imageUrl: "https://images.unsplash.com/photo-1563379091339-03b21bc4a4f8?auto=format&fit=crop&q=80&w=400" },
      { name: "Masala Dosa", description: "Crispy rice crepe with tempered mashed potatoes", price: 90, category: "South Indian", isVeg: true, isAvailable: true, imageUrl: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&q=80&w=400" }
    ];
    
    for (const item of samples) {
      await addDoc(collection(db, "menu"), { ...item, createdAt: serverTimestamp() });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white border-b border-gray-200 p-6 sticky top-0 z-20">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate("/kitchen")}
              className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-all"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">Menu Manager</h1>
              <p className="text-sm text-gray-500">Logged in as {user.displayName || user.email}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => signOut(auth)}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Sign Out
            </button>
            {menuItems.length === 0 && (
              <button 
                onClick={handleToggleSeeding}
                className="text-xs font-bold text-orange-600 bg-orange-50 px-4 py-4 rounded-2xl border border-orange-100"
              >
                SEED SAMPLE DATA
              </button>
            )}
            <button 
              onClick={() => {
                setIsAdding(true);
                setEditingItem(null);
              }}
              className="bg-orange-500 text-white p-4 rounded-2xl flex items-center shadow-lg shadow-orange-100 hover:bg-orange-600 transition-all font-bold"
            >
              <Plus size={24} className="mr-2" /> NEW ITEM
            </button>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-4xl mx-auto space-y-6">
        <AnimatePresence mode="popLayout">
          {isAdding && (
            <motion.div
              key="add-form"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-3xl p-8 shadow-xl border border-orange-100"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-gray-900">Create New Food Item</h2>
                <button onClick={() => setIsAdding(false)}><X className="text-gray-400" /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Item Name</label>
                    <div className="relative">
                      <Utensils className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="e.g. Paneer Butter Masala"
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 pl-12 pr-4 focus:border-orange-500 outline-none font-medium"
                        value={newItem.name}
                        onChange={e => setNewItem({...newItem, name: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Description</label>
                    <textarea 
                      placeholder="Ingredients and taste profile..."
                      className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 px-4 focus:border-orange-500 outline-none font-medium h-32"
                      value={newItem.description}
                      onChange={e => setNewItem({...newItem, description: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Price (₹)</label>
                    <div className="relative">
                      <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        type="number" 
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 pl-12 pr-4 focus:border-orange-500 outline-none font-bold text-xl"
                        value={newItem.price}
                        onChange={e => setNewItem({...newItem, price: Number(e.target.value)})}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border-2 border-gray-100">
                    <span className="font-bold text-gray-700">Vegetarian?</span>
                    <button 
                      onClick={() => setNewItem({...newItem, isVeg: !newItem.isVeg})}
                      className={cn(
                        "w-12 h-6 rounded-full p-1 transition-all",
                        newItem.isVeg ? "bg-green-500" : "bg-gray-300"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 bg-white rounded-full transition-all",
                        newItem.isVeg ? "translate-x-6" : "translate-x-0"
                      )} />
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Image URL (Optional)</label>
                      <button 
                        type="button" 
                        onClick={async () => {
                          if (!newItem.name) {
                            alert("Please enter the item name first to fetch its image!");
                            return;
                          }
                          const url = await autoFetchImage(newItem.name);
                          if (url) {
                            setNewItem(prev => ({ ...prev, imageUrl: url }));
                          }
                        }}
                        disabled={isFetchingImage}
                        className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 disabled:opacity-55 active:scale-95 transition-all cursor-pointer"
                      >
                        {isFetchingImage ? "✨ Fetching..." : "✨ Auto-Fetch from Google"}
                      </button>
                    </div>
                    <div className="relative">
                      <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="https://..."
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 pl-12 pr-16 focus:border-orange-500 outline-none font-medium text-sm truncate"
                        value={newItem.imageUrl || ""}
                        onChange={e => setNewItem({...newItem, imageUrl: e.target.value})}
                      />
                      {newItem.imageUrl && (
                        <button
                          type="button"
                          onClick={() => setNewItem(prev => ({ ...prev, imageUrl: "" }))}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 hover:text-gray-600 cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex space-x-4">
                <button 
                  onClick={handleAdd}
                  className="flex-1 bg-gray-900 text-white py-5 rounded-2xl font-bold text-xl flex items-center justify-center shadow-2xl shadow-gray-200 active:scale-95 transition-all animate-pulse"
                >
                  <Save className="mr-2" /> SAVE ITEM
                </button>
                <button 
                  onClick={() => setIsAdding(false)}
                  className="px-10 bg-gray-100 text-gray-500 py-5 rounded-2xl font-bold text-xl active:scale-95 transition-all"
                >
                  CANCEL
                </button>
              </div>
            </motion.div>
          )}

          {editingItem && (
            <motion.div
              key="edit-form"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-3xl p-8 shadow-xl border border-blue-100"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <Edit2 size={16} />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Edit Food Item: <span className="text-blue-600">{editingItem.name}</span></h2>
                </div>
                <button onClick={() => setEditingItem(null)} className="cursor-pointer hover:bg-gray-100 p-2 rounded-full transition-colors"><X className="text-gray-400" /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Item Name</label>
                    <div className="relative">
                      <Utensils className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="e.g. Paneer Butter Masala"
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 pl-12 pr-4 focus:border-blue-500 outline-none font-medium"
                        value={editingItem.name || ""}
                        onChange={e => setEditingItem({...editingItem, name: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Description</label>
                    <textarea 
                      placeholder="Ingredients and taste profile..."
                      className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 px-4 focus:border-blue-500 outline-none font-medium h-32"
                      value={editingItem.description || ""}
                      onChange={e => setEditingItem({...editingItem, description: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Price (₹)</label>
                    <div className="relative">
                      <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        type="number" 
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 pl-12 pr-4 focus:border-blue-500 outline-none font-bold text-xl"
                        value={editingItem.price || ""}
                        onChange={e => setEditingItem({...editingItem, price: Number(e.target.value)})}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border-2 border-gray-100">
                    <span className="font-bold text-gray-700">Vegetarian?</span>
                    <button 
                      onClick={() => setEditingItem({...editingItem, isVeg: !editingItem.isVeg})}
                      className={cn(
                        "w-12 h-6 rounded-full p-1 transition-all cursor-pointer",
                        editingItem.isVeg ? "bg-green-500" : "bg-gray-300"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 bg-white rounded-full transition-all",
                        editingItem.isVeg ? "translate-x-6" : "translate-x-0"
                      )} />
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Image URL (Optional)</label>
                      <button 
                        type="button" 
                        onClick={async () => {
                          if (!editingItem.name) {
                            alert("Please enter the item name first to fetch its image!");
                            return;
                          }
                          const url = await autoFetchImage(editingItem.name);
                          if (url) {
                            setEditingItem(prev => prev ? ({ ...prev, imageUrl: url }) : null);
                          }
                        }}
                        disabled={isFetchingImage}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 disabled:opacity-55 active:scale-95 transition-all cursor-pointer"
                      >
                        {isFetchingImage ? "✨ Fetching..." : "✨ Auto-Fetch from Google"}
                      </button>
                    </div>
                    <div className="relative">
                      <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="https://..."
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 pl-12 pr-16 focus:border-blue-500 outline-none font-medium text-sm truncate"
                        value={editingItem.imageUrl || ""}
                        onChange={e => setEditingItem({...editingItem, imageUrl: e.target.value})}
                      />
                      {editingItem.imageUrl && (
                        <button
                          type="button"
                          onClick={() => setEditingItem(prev => prev ? ({ ...prev, imageUrl: "" }) : null)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 hover:text-gray-600 cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex space-x-4">
                <button 
                  onClick={handleSaveEdit}
                  className="flex-1 bg-gray-900 text-white py-5 rounded-2xl font-bold text-xl flex items-center justify-center shadow-2xl shadow-gray-200 active:scale-95 transition-all cursor-pointer"
                >
                  <Save className="mr-2" /> UPDATE ITEM
                </button>
                <button 
                  onClick={() => setEditingItem(null)}
                  className="px-10 bg-gray-100 text-gray-500 py-5 rounded-2xl font-bold text-xl active:scale-95 transition-all cursor-pointer"
                >
                  CANCEL
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
          {menuItems.map(item => (
            <div key={item.id} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex items-center group">
              <div className="w-20 h-20 rounded-2xl bg-gray-100 overflow-hidden mr-4 border-2 border-gray-50 flex-shrink-0">
                 {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                 ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                       <Utensils size={32} />
                    </div>
                 )}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                   <div className={cn("w-3 h-3 border border-gray-200 rounded-sm", item.isVeg ? "bg-green-600" : "bg-red-600")} />
                   <h3 className="font-bold text-gray-900 leading-none truncate w-40">{item.name}</h3>
                </div>
                <p className="text-gray-500 font-bold mt-1">{formatCurrency(item.price)}</p>
                <div className="flex items-center justify-between w-full mt-3">
                   <div className="flex items-center space-x-3 bg-gray-50 px-3 py-1.5 rounded-2xl border border-gray-100">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-wider",
                        item.isAvailable ? "text-green-600" : "text-gray-400"
                      )}>
                        {item.isAvailable ? "Available" : "Unavailable"}
                      </span>
                      <button 
                         onClick={() => toggleAvailability(item)}
                         className={cn(
                           "w-10 h-6 rounded-full p-1 transition-all duration-200 cursor-pointer flex items-center",
                           item.isAvailable ? "bg-green-500" : "bg-gray-300"
                         )}
                      >
                        <motion.div 
                          className="w-4 h-4 bg-white rounded-full shadow-sm"
                          animate={{ x: item.isAvailable ? 16 : 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        />
                      </button>
                   </div>
                    <div className="flex items-center space-x-1">
                      <button 
                         onClick={() => handleStartEdit(item)}
                         className="text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all p-2 rounded-xl cursor-pointer"
                         title="Edit Item"
                      >
                        <Edit2 size={20} />
                      </button>
                      <button 
                         onClick={() => handleDelete(item.id)}
                         className="text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all p-2 rounded-xl cursor-pointer"
                         title="Delete Item"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
