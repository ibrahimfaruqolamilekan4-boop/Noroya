import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Zap, Smartphone, CreditCard, ChevronRight, Menu, X, Users, TrendingUp, HelpCircle, Star, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';

export default function LandingPage({ onAuth }: { onAuth: () => void }) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);

  const testimonials = [
    {
      name: "Tunde Bakare",
      role: "Corporate Partner",
      quote: "Noroya Data has changed my business entirely! I get data instantly and my clients are always happy. The best VTU platform in Nigeria.",
      rating: 5,
      avatar: "TB"
    },
    {
      name: "Chioma Nnaji",
      role: "Student",
      quote: "Super cheap data, very fast delivery! I recharge my Airtel lines here and it saves me thousands of Naira every semester.",
      rating: 5,
      avatar: "CN"
    },
    {
      name: "Ibrahim Yusuf",
      role: "Data Vendor",
      quote: "The API is extremely robust, and their customer support is top tier. 100% automated credit with instant resolution.",
      rating: 5,
      avatar: "IY"
    }
  ];

  const faqs = [
    {
      q: "How fast is service delivery?",
      a: "All services on Noroya Data are 100% automated. Your data, airtime, or bill payment is delivered instantly within 5 to 15 seconds."
    },
    {
      q: "Are the data plans compatible with all devices?",
      a: "Yes, our MTN, Airtel, Glo, and 9mobile data plans work flawlessly on all devices, including Androids, iPhones, iPads, modems, routers, and smart watches."
    },
    {
      q: "How do I fund my wallet?",
      a: "Immediately upon signing up, you are assigned unique, dedicated virtual bank accounts (Monnify Reserved Accounts). Simply transfer money to any of these accounts, and your wallet will be credited instantly."
    },
    {
      q: "What is your Referral Program?",
      a: "When you refer a friend using your unique referral code, you earn commissions on their first wallet fund and subsequent transactions. You can copy and share your invite link directly from your dashboard."
    },
    {
      q: "Is there customer support available?",
      a: "Absolutely! We provide round-the-clock support. You can reach out directly via our fully integrated Live AI Chat helper or tap the WhatsApp/Telegram support buttons inside your dashboard."
    }
  ];

  const networks = [
    { name: "MTN", color: "bg-yellow-400 text-slate-900 border-yellow-300", tag: "Corporate Gifting" },
    { name: "Airtel", color: "bg-red-600 text-white border-red-500", tag: "CG & Gifting" },
    { name: "Glo", color: "bg-green-600 text-white border-green-500", tag: "Heavy Gig" },
    { name: "9mobile", color: "bg-emerald-950 text-white border-emerald-800", tag: "Lite bundles" }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden relative font-sans">
      
      {/* Animated Subtle Floating Background Blobs */}
      <div className="absolute top-0 inset-x-0 h-[800px] overflow-hidden -z-10 pointer-events-none">
        <motion.div 
          animate={{
            x: [0, 80, -40, 0],
            y: [0, -50, 60, 0],
            scale: [1, 1.15, 0.9, 1]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-blue-400/10 rounded-full blur-[100px]"
        />
        <motion.div 
          animate={{
            x: [0, -60, 80, 0],
            y: [0, 80, -40, 0],
            scale: [1, 0.85, 1.1, 1]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-40 -right-40 w-[600px] h-[600px] bg-indigo-400/10 rounded-full blur-[120px]"
        />
      </div>

      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="text-white" size={24} />
              </div>
              <span className="text-xl font-bold tracking-tight">NOROYA<span className="text-blue-600 underline underline-offset-4 decoration-2">DATA</span></span>
            </div>
            
            <div className="hidden md:flex items-center gap-8 text-sm font-medium">
              <a href="#services" className="hover:text-blue-600 transition-colors">Services</a>
              <a href="#networks" className="hover:text-blue-600 transition-colors">Networks</a>
              <a href="#testimonials" className="hover:text-blue-600 transition-colors">Reviews</a>
              <a href="#faqs" className="hover:text-blue-600 transition-colors">FAQ</a>
              <button 
                onClick={onAuth}
                className="bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 hover:shadow-blue-300 transform hover:-translate-y-0.5"
              >
                Access Account
              </button>
            </div>

            <button className="md:hidden p-2 hover:bg-slate-50 rounded-xl" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="fixed top-16 inset-x-0 z-40 bg-white border-b border-slate-100 px-6 py-8 md:hidden shadow-lg"
          >
            <div className="flex flex-col gap-5 text-base font-bold">
              <a href="#services" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 py-1 transition-colors">Services</a>
              <a href="#networks" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 py-1 transition-colors">Networks</a>
              <a href="#testimonials" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 py-1 transition-colors">Reviews</a>
              <a href="#faqs" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 py-1 transition-colors">FAQ</a>
              <button 
                onClick={() => { onAuth(); setIsMenuOpen(false); }}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-all text-center mt-2 shadow-lg shadow-blue-100"
              >
                Access Account
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section className="pt-32 pb-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider rounded-full pointer-events-none">
              <Zap size={14} /> Cheap, Instant, Fully automated
            </div>
            
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.1] text-slate-900">
              Buy Cheap Data <br className="hidden sm:inline" />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-800">
                Instantly & Safely
              </span>
            </h1>
            
            <p className="text-base sm:text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
              Recharge your MTN, Airtel, Glo, and 9mobile lines in second intervals. Pay electricity bills, cable plans and exam tokens with maximum reliability.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                onClick={onAuth}
                className="bg-blue-600 text-white px-8 py-4 rounded-2xl text-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 hover:-translate-y-0.5 transform"
              >
                Get Cheap Data Now <ChevronRight size={20} />
              </button>
              <button 
                onClick={onAuth}
                className="bg-white border border-slate-200 text-slate-900 px-8 py-4 rounded-2xl text-lg font-bold hover:bg-slate-50 transition-all hover:border-slate-300"
              >
                Register Free
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Supported Carrier Logos / Networks Section */}
      <section id="networks" className="py-12 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-center text-xs font-black text-slate-400 uppercase tracking-widest mb-8">Supported Service Networks</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {networks.map((nw, idx) => (
              <motion.div
                key={idx}
                whileHover={{ y: -4, scale: 1.02 }}
                className={cn(
                  "p-5 rounded-3xl border text-center flex flex-col justify-center items-center shadow-sm relative overflow-hidden h-32",
                  nw.color
                )}
              >
                <span className="text-2xl font-black tracking-tighter">{nw.name}</span>
                <span className="text-[10px] font-black uppercase tracking-wider opacity-80 mt-1">{nw.tag}</span>
                
                {/* Visual Accent */}
                <div className="absolute right-2 bottom-2 font-black text-4xl opacity-5 select-none">{nw.name[0]}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { label: 'Active Retailers', value: '50,000+' },
            { label: 'Completed Deliveries', value: '1.2M+' },
            { label: 'Average Clear Time', value: '7 Seconds' },
            { label: 'Uptime Stability', value: '99.98%' },
          ].map((stat, i) => (
            <div key={i} className="text-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
              <div className="text-3xl font-black text-blue-600 mb-1">{stat.value}</div>
              <div className="text-xs text-slate-400 font-extrabold uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Core Services Features */}
      <section id="services" className="py-24 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-3">
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Our Core Services</h2>
            <p className="text-slate-500 max-w-lg mx-auto text-sm md:text-base">We provide full high-frequency automated delivery for everyday digital bills.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Smartphone className="text-blue-600" size={24} />}
              title="Airtime & Internet Data"
              description="Cheap, direct corporate and Corporate Gifting bundles loaded automatically within seconds on your lines."
            />
            <FeatureCard 
              icon={<Zap className="text-indigo-600" size={24} />}
              title="Cable TV & Electricity"
              description="Instantly resolve DSTV, GOTV, StarTimes recharges and purchase tokens for pre-paid meters."
            />
            <FeatureCard 
              icon={<CreditCard className="text-purple-600" size={24} />}
              title="Result Checking Exam Pins"
              description="WAEC, NECO, and NABTEB serial tokens are delivered directly to your transaction summary screen."
            />
          </div>
        </div>
      </section>

      {/* Why Us / Interactive Reseller Section */}
      <section className="py-24 bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-4 relative overflow-hidden">
        {/* Background blobs for depth */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-white/5 rounded-full blur-[140px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center relative z-10">
          <div className="space-y-8">
            <h2 className="text-4xl md:text-5xl font-black leading-tight tracking-tight">The Noroya Reseller Edge</h2>
            <p className="text-blue-100 leading-relaxed font-sans text-base max-w-lg">
              Start your own virtual telecom service or reseller platform with our automated APIs. Save bulk costs, refer friends and generate income at high clear speeds.
            </p>
            <div className="space-y-5">
              <CheckItem title="Smart Cloud Automation" description="Our servers operate 24/7 without delays or downtime." />
              <CheckItem title="Protected Virtual Accounts" description="Fully whitelisted bank partners to guarantee secure financial routes." />
              <CheckItem title="Zero hidden charges" description="Honest pricing indexes. What you pay is what you receive." />
            </div>
          </div>
          <div className="relative">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl text-slate-900 rotate-2 transform hover:rotate-0 transition-transform duration-500 border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <span className="font-extrabold text-xl text-slate-800">My Cash Wallet</span>
                <TrendingUp size={24} className="text-blue-600 animate-pulse" />
              </div>
              <div className="text-4xl font-black text-slate-900 mb-8">₦42,750.00</div>
              <div className="space-y-4">
                <div className="h-14 bg-slate-50 rounded-2xl flex items-center px-4 justify-between border border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <span className="text-sm font-bold text-slate-700">MTN 5GB CG Bundle</span>
                  </div>
                  <span className="text-sm text-rose-600 font-extrabold">-₦1,250.00</span>
                </div>
                <div className="h-14 bg-slate-50 rounded-2xl flex items-center px-4 justify-between border border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <span className="text-sm font-bold text-slate-700">WEMA Virtual Deposit</span>
                  </div>
                  <span className="text-sm text-emerald-600 font-extrabold">+₦10,000.00</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 bg-slate-50 px-4">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-5xl font-black text-slate-950 tracking-tight">Loved by Retailers</h2>
            <p className="text-slate-500 max-w-lg mx-auto text-sm">See reviews from real Nigerian corporate and small scale sub-vendors.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t, idx) => (
              <div key={idx} className="bg-white border border-slate-100 p-8 rounded-[2rem] shadow-sm flex flex-col justify-between hover:shadow-lg transition-all duration-300">
                <div className="space-y-4">
                  {/* Stars */}
                  <div className="flex gap-1">
                    {[...Array(t.rating)].map((_, i) => (
                      <Star key={i} className="text-amber-400 fill-amber-400" size={16} />
                    ))}
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed font-medium">"{t.quote}"</p>
                </div>
                
                <div className="flex items-center gap-4 mt-8 pt-6 border-t border-slate-100">
                  <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center font-bold text-indigo-600 text-sm">
                    {t.avatar}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-800">{t.name}</h4>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQs Section */}
      <section id="faqs" className="py-24 bg-white px-4">
        <div className="max-w-4xl mx-auto space-y-16">
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-5xl font-black text-slate-950 tracking-tight">Frequently Asked Questions</h2>
            <p className="text-slate-500 text-sm">Find fast answers to general questions about how our automation works.</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div 
                key={i} 
                className={cn(
                  "border border-slate-100 rounded-3xl overflow-hidden transition-all duration-300 bg-slate-50/50 hover:bg-slate-50/100",
                  openFaq === i ? "border-blue-100 bg-white shadow-md shadow-blue-50/20" : ""
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 text-left flex justify-between items-center font-bold text-slate-800"
                >
                  <span className="pr-4">{faq.q}</span>
                  <HelpCircle className={cn("text-slate-400 shrink-0 transition-transform duration-300", openFaq === i ? "transform rotate-180 text-blue-600" : "")} size={20} />
                </button>
                
                <AnimatePresence initial={false}>
                  {openFaq === i && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="px-6 pb-6 text-sm text-slate-500 leading-relaxed font-medium"
                    >
                      {faq.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 border-t border-slate-100 bg-slate-900 text-white px-4">
        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-12 mb-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="text-white" size={16} />
              </div>
              <span className="text-lg font-bold tracking-tight">NOROYA DATA</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
              The premier, ultra-reliable 24/7 digital utility payment ecosystem for data bundles, utilities, airtime and school pinning.
            </p>
          </div>
          
          <div>
            <h4 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-4">Core Links</h4>
            <div className="flex flex-col gap-2.5 text-sm text-slate-400 font-medium">
              <a href="#services" className="hover:text-white transition-colors">Services</a>
              <a href="#networks" className="hover:text-white transition-colors">Network Carriers</a>
              <a href="#testimonials" className="hover:text-white transition-colors">User Testimonials</a>
              <a href="#faqs" className="hover:text-white transition-colors">FAQs</a>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-sm text-slate-200 uppercase tracking-wider mb-4">Service Status</h4>
            <div className="p-4 bg-slate-800 rounded-2xl border border-slate-700/60 max-w-xs space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="font-black uppercase tracking-wider text-green-400">All Systems Operational</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Auto-dispatchers are running with normal latency parameters.</p>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-slate-500 text-xs">© 2026 Noroya Data. Designed for speed & modern aesthetics.</p>
          <div className="flex gap-6 text-xs text-slate-500 font-medium">
            <a href="#" className="hover:text-white transition-all">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-all">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-8 rounded-[2.5rem] border border-slate-100 hover:border-blue-100 hover:shadow-xl hover:shadow-blue-50/40 transition-all bg-white group duration-300">
      <div className="w-14 h-14 bg-slate-50 group-hover:bg-blue-50/80 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-all duration-300">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 text-slate-800 tracking-tight">{title}</h3>
      <p className="text-slate-500 leading-relaxed text-sm font-medium">{description}</p>
    </div>
  );
}

function CheckItem({ title, description }: { title: string, description: string }) {
  return (
    <div className="flex gap-4">
      <div className="mt-1 w-6 h-6 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
        <div className="w-2 h-2 bg-white rounded-full" />
      </div>
      <div>
        <h4 className="font-bold text-lg leading-tight">{title}</h4>
        <p className="text-blue-100 text-sm mt-0.5">{description}</p>
      </div>
    </div>
  );
}
