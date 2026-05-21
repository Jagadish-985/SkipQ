import { User, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut } from "firebase/auth";
import { auth, kitchenAuth, googleProvider } from "../lib/firebase";
import { useNavigate } from "react-router-dom";
import { Utensils, ChefHat, LogIn, Mail, ArrowRight, X, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, FormEvent, useEffect } from "react";

export default function GateScreen({ 
  customerUser, 
  kitchenUser 
}: { 
  customerUser: User | null; 
  kitchenUser: User | null; 
}) {
  const navigate = useNavigate();
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  const getAuthInstance = (target: string) => {
    return target === "/kitchen" ? kitchenAuth : auth;
  };

  const handleGoogleLogin = async (target: string) => {
    const activeAuth = getAuthInstance(target);
    if (!activeAuth.currentUser) {
      try {
        await signInWithPopup(activeAuth, googleProvider);
      } catch (err) {
        console.error(err);
        return;
      }
    }
    navigate(target);
  };

  const openEmailModal = (target: string) => {
    setPendingTarget(target);
    setShowEmailModal(true);
  };

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const activeAuth = pendingTarget ? getAuthInstance(pendingTarget) : auth;

    try {
      if (isRegistering) {
        const userCred = await createUserWithEmailAndPassword(activeAuth, email, password);
        await updateProfile(userCred.user, { displayName: name });
      } else {
        await signInWithEmailAndPassword(activeAuth, email, password);
      }
      
      if (pendingTarget) {
        navigate(pendingTarget);
      }
      setShowEmailModal(false);
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full space-y-8"
      >
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center text-white font-black text-3xl shadow-2xl shadow-orange-200 mb-6">
            S
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase mb-1">SkipQ</h1>
          <p className="text-[10px] font-black text-orange-500 uppercase tracking-[0.3em]">Smart Food Court v2.0</p>
        </div>
        
        <div className="grid grid-cols-1 gap-4 mt-8">
          {/* Employee Card */}
          <div className="bg-white border border-gray-100 rounded-3xl p-1 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden group">
            <div className="p-6">
              <div className="flex items-center space-x-4 mb-6">
                <div className="p-4 bg-orange-50 rounded-2xl text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-all">
                  <Utensils size={28} />
                </div>
                <div className="text-left animate-fade-in">
                  <h3 className="font-black text-xl text-gray-900 leading-none mb-1">Employee Order</h3>
                  <p className="text-sm text-gray-400 font-medium">Order breakfast, lunch & snacks</p>
                </div>
              </div>
              
              {customerUser ? (
                <div className="space-y-3 bg-orange-50/50 rounded-2xl p-4 border border-orange-100/50">
                  <p className="text-xs font-black text-orange-600 uppercase tracking-widest">
                    Welcome, {customerUser.displayName || customerUser.email?.split('@')[0]}
                  </p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none">Logged In Session</p>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <button
                      onClick={() => navigate("/home")}
                      className="flex items-center justify-center gap-1.5 py-3 bg-orange-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-orange-600 transition-all cursor-pointer shadow-md shadow-orange-500/10 active:scale-95"
                    >
                      Enter Portal
                    </button>
                    <button
                      onClick={() => signOut(auth)}
                      className="flex items-center justify-center gap-1.5 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-100 transition-all cursor-pointer active:scale-95"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleGoogleLogin("/home")}
                    className="flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 rounded-xl text-xs font-black uppercase tracking-widest hover:border-orange-500 hover:text-orange-500 transition-all cursor-pointer"
                  >
                    <LogIn size={14} /> Google
                  </button>
                  <button
                    onClick={() => openEmailModal("/home")}
                    className="flex items-center justify-center gap-2 py-3 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-orange-600 transition-all cursor-pointer"
                  >
                    <Mail size={14} /> Email
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Kitchen Card */}
          <div className="bg-white border border-gray-100 rounded-3xl p-1 shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden group">
            <div className="p-6">
              <div className="flex items-center space-x-4 mb-6">
                <div className="p-4 bg-slate-50 rounded-2xl text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all">
                  <ChefHat size={28} />
                </div>
                <div className="text-left">
                  <h3 className="font-black text-xl text-gray-900 leading-none mb-1">Kitchen Portal</h3>
                  <p className="text-sm text-gray-400 font-medium">Staff only terminal</p>
                </div>
              </div>
              
              {kitchenUser ? (
                <div className="space-y-3 bg-slate-50 rounded-2xl p-4 border border-slate-200/50">
                  <p className="text-xs font-black text-slate-700 uppercase tracking-widest">
                    Staff: {kitchenUser.displayName || kitchenUser.email?.split('@')[0]}
                  </p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none">Internal Access</p>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <button
                      onClick={() => navigate("/kitchen")}
                      className="flex items-center justify-center gap-1.5 py-3 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-850 transition-all cursor-pointer shadow-md shadow-gray-950/10 active:scale-95"
                    >
                      Enter Kitchen
                    </button>
                    <button
                      onClick={() => signOut(kitchenAuth)}
                      className="flex items-center justify-center gap-1.5 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-100 transition-all cursor-pointer active:scale-95"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleGoogleLogin("/kitchen")}
                    className="flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 rounded-xl text-xs font-black uppercase tracking-widest hover:border-slate-900 hover:text-slate-900 transition-all cursor-pointer"
                  >
                     <LogIn size={14} /> Google
                  </button>
                  <button
                    onClick={() => openEmailModal("/kitchen")}
                    className="flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    <Mail size={14} /> Staff ID
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="pt-8">
          <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest leading-loose">
            Enterprise scale supported
            <br />
            Internal MNC Infrastructure
          </p>
        </div>
      </motion.div>

      {/* Email Login Modal */}
      <AnimatePresence>
        {showEmailModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEmailModal(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed z-[60] bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-gray-900 leading-tight">
                  {isRegistering ? "Register Account" : "Access Portal"}
                </h2>
                <button onClick={() => setShowEmailModal(false)} className="text-gray-400 hover:text-gray-900">
                  <X />
                </button>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-4">
                {isRegistering && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Full Name</label>
                    <input 
                      type="text" 
                      required
                      placeholder="John Doe"
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 font-bold"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Corporation Email</label>
                  <input 
                    type="email" 
                    required
                    placeholder="name@mnc.com"
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 font-bold"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Security Password</label>
                  <input 
                    type="password" 
                    required
                    placeholder="••••••••"
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 font-bold"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {error && <p className="text-xs text-red-500 font-bold">{error}</p>}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gray-900 text-white rounded-xl py-4 font-black uppercase tracking-[0.2em] hover:bg-orange-500 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {loading ? "Authenticating..." : (isRegistering ? "Create Profile" : "Sign In Portal")}
                  <ArrowRight size={18} />
                </button>
              </form>

              <button 
                onClick={() => setIsRegistering(!isRegistering)}
                className="w-full mt-6 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-900 transition-colors"
              >
                {isRegistering ? "Already have account? Sign in" : "New user? Create an account"}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
