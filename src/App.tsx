import React, { useState, useMemo, useEffect } from 'react';
import { Search, Download, Loader2, MapPin, Filter, Database, ArrowRight, ChevronUp, ChevronDown, Users, Globe, MessageSquare, X, Mail, Send, AlertCircle, Bookmark, BookmarkCheck, LogOut, LogIn, LayoutDashboard, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import axios from 'axios';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, onSnapshot, query, where, doc, deleteDoc, updateDoc } from 'firebase/firestore';

interface Lead {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  rating: number;
  reviews: number;
}

interface IntentLead {
  id: string;
  title: string;
  snippet: string;
  link: string;
  source: string;
  date: string;
}

interface SavedLead extends Lead {
  docId: string;
  status: 'new' | 'contacted' | 'converted' | 'rejected';
  priority?: 'none' | 'low' | 'medium' | 'high';
  createdAt: any;
}

interface SavedIntent extends IntentLead {
  docId: string;
  status: 'new' | 'contacted' | 'converted' | 'rejected';
  priority?: 'none' | 'low' | 'medium' | 'high';
  createdAt: any;
}

export default function App() {
  const [keywords, setKeywords] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [radius, setRadius] = useState('10');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Lead[]>([]);
  const [intentResults, setIntentResults] = useState<IntentLead[]>([]);
  const [intentSummary, setIntentSummary] = useState<{ sentiment: string; painPoints: string[] } | null>(null);
  const [mode, setMode] = useState<'business' | 'intent'>('business');
  const [activeTab, setActiveTab] = useState<'scout' | 'crm'>('scout');
  const [error, setError] = useState<string | null>(null);
  const [selectedIntent, setSelectedIntent] = useState<IntentLead | null>(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactError, setContactError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Lead; direction: 'asc' | 'desc' } | null>(null);
  const [processing, setProcessing] = useState<{ id: string; field: 'phone' | 'email' | 'website' } | null>(null);
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [campaignNiche, setCampaignNiche] = useState('Home Improvement');
  const [campaignOffer, setCampaignOffer] = useState('Free Quote & Consultation');
  const [isDeployingCampaign, setIsDeployingCampaign] = useState(false);
  const [campaignSuccess, setCampaignSuccess] = useState(false);

  // Template State
  const [templatePurpose, setTemplatePurpose] = useState<'Introduction' | 'Offering Help' | 'Direct Pitch'>('Introduction');
  const [templateTone, setTemplateTone] = useState<'Professional' | 'Casual' | 'Empathetic' | 'Direct'>('Professional');

  // Intent Search State
  const [intentType, setIntentType] = useState('recommendation');
  const [platforms, setPlatforms] = useState<string[]>(['reddit.com', 'facebook.com', 'quora.com', 'nextdoor.com']);

  // CRM State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [savedLeads, setSavedLeads] = useState<SavedLead[]>([]);
  const [savedIntents, setSavedIntents] = useState<SavedIntent[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }), []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user) {
      setSavedLeads([]);
      setSavedIntents([]);
      return;
    }

    const leadsQuery = query(collection(db, 'savedLeads'), where('userId', '==', user.uid));
    const unsubscribeLeads = onSnapshot(leadsQuery, (snapshot) => {
      const leadsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        docId: doc.id
      })) as SavedLead[];
      setSavedLeads(leadsData);
    }, (error) => {
      console.error("Error fetching saved leads:", error);
    });

    const intentsQuery = query(collection(db, 'savedIntents'), where('userId', '==', user.uid));
    const unsubscribeIntents = onSnapshot(intentsQuery, (snapshot) => {
      const intentsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        docId: doc.id
      })) as SavedIntent[];
      setSavedIntents(intentsData);
    }, (error) => {
      console.error("Error fetching saved intents:", error);
    });

    return () => {
      unsubscribeLeads();
      unsubscribeIntents();
    };
  }, [user, isAuthReady]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      if (activeTab === 'crm') setActiveTab('scout');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const saveBusinessLead = async (lead: Lead) => {
    if (!user) {
      // Use a custom modal or alert in a real app, but for simplicity here:
      alert("Please log in to save leads.");
      return;
    }
    setSavingId(lead.id);
    try {
      await addDoc(collection(db, 'savedLeads'), {
        ...lead,
        userId: user.uid,
        status: 'new',
        priority: 'none',
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error saving lead:", error);
      alert("Failed to save lead.");
    } finally {
      setSavingId(null);
    }
  };

  const saveIntentLead = async (intent: IntentLead) => {
    if (!user) {
      alert("Please log in to save leads.");
      return;
    }
    setSavingId(intent.id);
    try {
      await addDoc(collection(db, 'savedIntents'), {
        ...intent,
        userId: user.uid,
        status: 'new',
        priority: 'none',
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error saving intent:", error);
      alert("Failed to save intent.");
    } finally {
      setSavingId(null);
    }
  };

  const updateLeadStatus = async (collectionName: 'savedLeads' | 'savedIntents', docId: string, status: string) => {
    try {
      await updateDoc(doc(db, collectionName, docId), { status });
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const updateLeadPriority = async (collectionName: 'savedLeads' | 'savedIntents', docId: string, priority: string) => {
    try {
      await updateDoc(doc(db, collectionName, docId), { priority });
    } catch (error) {
      console.error("Error updating priority:", error);
    }
  };

  const deleteSavedLead = async (collectionName: 'savedLeads' | 'savedIntents', docId: string) => {
    if (!window.confirm("Are you sure you want to delete this lead?")) return;
    try {
      await deleteDoc(doc(db, collectionName, docId));
    } catch (error) {
      console.error("Error deleting lead:", error);
    }
  };

  const generateTemplateText = (purpose: string, tone: string) => {
    const topic = selectedIntent?.title ? `your post about "${selectedIntent.title.substring(0, 40)}..."` : 'your recent post';
    
    if (purpose === 'Introduction') {
      if (tone === 'Professional') return `Hello,\n\nI came across ${topic}. I am writing to introduce our business and the services we offer. We have extensive experience addressing this type of need and would appreciate the opportunity to discuss how we could be of benefit to you.\n\nSincerely,\n[Your Name]\n[Your Business]`;
      if (tone === 'Casual') return `Hi there!\n\nJust saw ${topic} and wanted to reach out. I run a local business specializing in this kind of work. If you're still looking for someone, I'd love to chat!\n\nBest,\n[Your Name]`;
      if (tone === 'Empathetic') return `Hi,\n\nI noticed ${topic}. I know how challenging it can be to find the right person for this. We've helped many folks in your exact situation, and I'd be happy to answer any questions you have, no pressure.\n\nWarmly,\n[Your Name]`;
      if (tone === 'Direct') return `Hello,\n\nI saw ${topic}. We handle this exact type of work regularly in the area. Let me know if you would like me to send over more information or an estimate.\n\nThanks,\n[Your Name]`;
    } else if (purpose === 'Offering Help') {
      if (tone === 'Professional') return `Hello,\n\nRegarding ${topic}, I noticed you might be seeking assistance. Our team specializes in providing solutions for these specific challenges. Please let us know if you would like to schedule a brief consultation.\n\nBest regards,\n[Your Name]`;
      if (tone === 'Casual') return `Hey!\n\nSaw ${topic} and thought I might be able to help out. Dealing with this is literally my day job! Let me know if you want to hop on a quick call and see if I can point you in the right direction.\n\nCheers,\n[Your Name]`;
      if (tone === 'Empathetic') return `Hi there,\n\nI read ${topic} and I completely understand how frustrating that can be. Dealing with this stuff is never fun. If you need a hand, our team specializes in taking this exact stress off your plate.\n\nTake care,\n[Your Name]`;
      if (tone === 'Direct') return `Hi,\n\nI can help you with the issue mentioned in ${topic}. We have immediate availability to get this sorted for you. Please reply if you'd like to get started.\n\nThanks,\n[Your Name]`;
    } else if (purpose === 'Direct Pitch') {
      if (tone === 'Professional') return `Hello,\n\nFollowing up on ${topic}, I would like to offer our professional services. We provide high-quality, reliable solutions for this requirement. I would be happy to provide a formal proposal if you are interested.\n\nSincerely,\n[Your Name]`;
      if (tone === 'Casual') return `Hi!\n\nJust responding to ${topic} - we can definitely get this done for you. We have great rates and can start soon. Let me know if you want a quick quote!\n\nThanks,\n[Your Name]`;
      if (tone === 'Empathetic') return `Hi,\n\nI know finding someone reliable for what you mentioned in ${topic} is tough. We pride ourselves on transparent pricing and quality work, specifically to make this process easier for you. Let me know if you'd like a free estimate.\n\nBest,\n[Your Name]`;
      if (tone === 'Direct') return `Hello,\n\nRegarding ${topic}: We can do this job. We offer competitive pricing and high-quality results. Let's schedule a time to review the details.\n\nBest,\n[Your Name]`;
    }
    return '';
  };

  const handleApplyTemplate = () => {
    const text = generateTemplateText(templatePurpose, templateTone);
    setContactMessage(text);
  };

  const sortedResults = useMemo(() => {
    if (!sortConfig) return results;

    return [...results].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [results, sortConfig]);

  const requestSort = (key: keyof Lead) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ column }: { column: keyof Lead }) => {
    if (!sortConfig || sortConfig.key !== column) return null;
    return sortConfig.direction === 'asc' ? <ChevronUp size={12} className="ml-1" /> : <ChevronDown size={12} className="ml-1" />;
  };

  const handleContactAction = (id: string, field: 'phone' | 'email' | 'website', value: string) => {
    if (!value || value === 'N/A') return;
    
    setProcessing({ id, field });
    
    const duration = field === 'website' ? 1200 : 800;
    
    setTimeout(() => {
      setProcessing(null);
      if (field === 'phone') {
        window.location.href = `tel:${value}`;
      } else if (field === 'email') {
        window.location.href = `mailto:${value}`;
      } else if (field === 'website') {
        const url = value.startsWith('http') ? value : `https://${value}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }, duration);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keywords) return;

    setLoading(true);
    setError(null);
    setResults([]);
    setIntentResults([]);
    setIntentSummary(null);

    try {
      if (mode === 'business') {
        // 1. Fetch raw search results from our backend proxy
        const response = await axios.post('/api/search', {
          keywords,
          targetAudience,
          radius,
          location
        });

        const rawData = response.data;

        if (!rawData.places || rawData.places.length === 0) {
          setError('No results found for your search.');
          setLoading(false);
          return;
        }

        // 2. Use Gemini to structure and clean the data
        const geminiResponse = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Extract and structure the following search results into a clean JSON array of leads. 
          Each lead should have: id (unique string), name, address, phone, email, website, rating (number), and reviews (number).
          
          CRITICAL: Attempt to find the business email address from the raw data (it might be in descriptions, snippets, or metadata). 
          If an email is not found, use "N/A".
          If any other field is missing, use an empty string or 0.
          
          Raw Data: ${JSON.stringify(rawData.places.slice(0, 15))}
          
          Return ONLY a JSON array.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  address: { type: Type.STRING },
                  phone: { type: Type.STRING },
                  email: { type: Type.STRING },
                  website: { type: Type.STRING },
                  rating: { type: Type.NUMBER },
                  reviews: { type: Type.NUMBER },
                },
                required: ["id", "name", "address", "phone", "email", "website", "rating", "reviews"]
              }
            }
          }
        });

        const structuredLeads = JSON.parse(geminiResponse.text);
        setResults(structuredLeads);
      } else {
        // Intent Scout Mode
        const response = await axios.post('/api/intent', {
          keywords,
          targetAudience,
          location,
          intentType,
          platforms
        });

        const rawData = response.data;

        if (!rawData.organic || rawData.organic.length === 0) {
          setError('No active search intent found for these keywords.');
          setLoading(false);
          return;
        }

        // Use Gemini to identify the most relevant "looking for" posts and summarize sentiment
        const geminiResponse = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Analyze these search results and identify posts where ${targetAudience ? targetAudience + 's (or similar users)' : 'users'} are expressing interest, seeking help, or looking for recommendations related to ${keywords}.
          
          1. Extract them into a JSON array of objects with: id, title, snippet, link, source (e.g. Reddit, Forum), and date.
          2. Provide an overall summary of the sentiment (e.g. frustrated, curious, urgent).
          3. List the top 3 common pain points or specific needs identified across these posts.
          
          Be inclusive: if a post seems even remotely like someone asking for help or discussing the topic in a seeking manner, include it.
          
          Raw Data: ${JSON.stringify(rawData.organic.slice(0, 15))}
          
          Return ONLY a JSON object with keys: "leads" (the array), "sentiment" (string), and "painPoints" (array of strings). 
          If no relevant posts are found, return an empty leads array and generic summary.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                leads: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      title: { type: Type.STRING },
                      snippet: { type: Type.STRING },
                      link: { type: Type.STRING },
                      source: { type: Type.STRING },
                      date: { type: Type.STRING },
                    },
                    required: ["id", "title", "snippet", "link", "source", "date"]
                  }
                },
                sentiment: { type: Type.STRING },
                painPoints: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["leads", "sentiment", "painPoints"]
            }
          }
        });

        const structuredData = JSON.parse(geminiResponse.text);
        if (structuredData.leads.length === 0) {
          setError('No clear intent signals found in the search results. Try more general keywords.');
        }
        setIntentResults(structuredData.leads);
        setIntentSummary({
          sentiment: structuredData.sentiment,
          painPoints: structuredData.painPoints
        });
      }
    } catch (err: any) {
      console.error('Search error:', err);
      const message = err.response?.data?.error || err.message || 'An unexpected error occurred.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (results.length === 0) return;

    const headers = ['Name', 'Address', 'Phone', 'Email', 'Website', 'Rating', 'Reviews'];
    const csvContent = [
      headers.join(','),
      ...results.map(lead => [
        `"${lead.name}"`,
        `"${lead.address}"`,
        `"${lead.phone}"`,
        `"${lead.email}"`,
        `"${lead.website}"`,
        lead.rating,
        lead.reviews
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_${keywords.replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);

    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactEmail)) {
      setContactError('Please enter a valid email address.');
      return;
    }

    if (!contactMessage.trim()) {
      setContactError('Message cannot be empty.');
      return;
    }

    setIsSending(true);
    // Simulate sending
    setTimeout(() => {
      setIsSending(false);
      setIsContactModalOpen(false);
      setContactEmail('');
      setContactMessage('');
      setContactError(null);
      // In a real app, you'd send this to your backend
    }, 1500);
  };

  const handleLaunchCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    setIsDeployingCampaign(true);
    setCampaignSuccess(false);

    // Simulate AI deployment delay
    setTimeout(() => {
      setIsDeployingCampaign(false);
      setCampaignSuccess(true);
      
      // Auto close after showing success
      setTimeout(() => {
        setIsCampaignModalOpen(false);
        setCampaignSuccess(false);
      }, 3000);
    }, 2000);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-line p-6 bg-bg sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-ink text-bg flex items-center justify-center rounded-sm">
              <Database size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tighter uppercase">LeadScout AI</h1>
              <p className="col-header">Autonomous Lead Generation Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex bg-ink/5 p-1 rounded-sm">
              <button
                onClick={() => setActiveTab('scout')}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors rounded-sm ${activeTab === 'scout' ? 'bg-ink text-bg shadow-sm' : 'hover:bg-ink/10'}`}
              >
                Scout
              </button>
              <button
                onClick={() => setActiveTab('crm')}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors rounded-sm flex items-center gap-2 ${activeTab === 'crm' ? 'bg-ink text-bg shadow-sm' : 'hover:bg-ink/10'}`}
              >
                <LayoutDashboard size={14} /> CRM
              </button>
            </div>

            <div className="flex items-center gap-4 border-l border-line/20 pl-6">
              <button 
                onClick={() => setIsCampaignModalOpen(true)}
                className="text-[10px] uppercase font-bold tracking-widest bg-ink text-bg px-3 py-1.5 rounded-sm hover:opacity-90 flex items-center gap-2"
              >
                <Database size={12} />
                Deploy AI Form
              </button>
              {user ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium opacity-60">{user.email}</span>
                  <button onClick={handleLogout} className="text-xs uppercase font-bold tracking-widest hover:underline flex items-center gap-1 opacity-60 hover:opacity-100">
                    <LogOut size={14} /> Logout
                  </button>
                </div>
              ) : (
                <button onClick={handleLogin} className="text-xs uppercase font-bold tracking-widest hover:underline flex items-center gap-1">
                  <LogIn size={14} /> Login
                </button>
              )}
            </div>
          </div>
        </div>

        {activeTab === 'scout' && (
          <div className="max-w-7xl mx-auto mt-6">
            <form onSubmit={handleSearch} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                  <label className="col-header">Target Audience</label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={14} />
                    <input
                      type="text"
                      value={targetAudience}
                      onChange={(e) => setTargetAudience(e.target.value)}
                      placeholder="e.g. Homeowner"
                      className="bg-transparent border border-line/30 px-9 py-2 text-sm focus:outline-none focus:border-line w-48"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="col-header">Service / Product</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={14} />
                    <input
                      type="text"
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      placeholder="e.g. Painting, Plumbing"
                      className="bg-transparent border border-line/30 px-9 py-2 text-sm focus:outline-none focus:border-line w-56"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="col-header">Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={14} />
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="City or Zip"
                      className="bg-transparent border border-line/30 px-9 py-2 text-sm focus:outline-none focus:border-line w-40"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="col-header">Radius (mi)</label>
                  <input
                    type="number"
                    value={radius}
                    onChange={(e) => setRadius(e.target.value)}
                    disabled={mode === 'intent'}
                    className="bg-transparent border border-line/30 px-3 py-2 text-sm focus:outline-none focus:border-line w-20 disabled:opacity-30"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="col-header">Scout Mode</label>
                  <div className="flex border border-line/30 p-1">
                    <button
                      type="button"
                      onClick={() => setMode('business')}
                      className={`px-3 py-1 text-[10px] uppercase font-bold transition-colors ${mode === 'business' ? 'bg-ink text-bg' : 'hover:bg-ink/5'}`}
                    >
                      Business
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('intent')}
                      className={`px-3 py-1 text-[10px] uppercase font-bold transition-colors ${mode === 'intent' ? 'bg-ink text-bg' : 'hover:bg-ink/5'}`}
                    >
                      Intent
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !keywords}
                  className="bg-ink text-bg px-6 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2 transition-all active:scale-95"
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                  {loading ? 'Scraping...' : 'Search'}
                </button>
              </div>

              {/* Advanced Intent Options */}
              {mode === 'intent' && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex flex-wrap items-end gap-4 pt-2 border-t border-line/10"
                >
                  <div className="flex flex-col gap-1">
                    <label className="col-header">Intent Type</label>
                    <select
                      value={intentType}
                      onChange={(e) => setIntentType(e.target.value)}
                      className="bg-transparent border border-line/30 px-3 py-2 text-sm focus:outline-none focus:border-line w-48"
                    >
                      <option value="recommendation">Recommendations / ISO</option>
                      <option value="hiring">Hiring / Wanted</option>
                      <option value="pain">Pain Points / Problems</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="col-header">Platforms</label>
                    <div className="flex items-center gap-2 border border-line/30 p-1.5">
                      {[
                        { id: 'reddit.com', label: 'Reddit' },
                        { id: 'facebook.com', label: 'Facebook' },
                        { id: 'quora.com', label: 'Quora' },
                        { id: 'nextdoor.com', label: 'Nextdoor' }
                      ].map(platform => (
                        <label key={platform.id} className="flex items-center gap-1 text-xs cursor-pointer px-2">
                          <input
                            type="checkbox"
                            checked={platforms.includes(platform.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPlatforms([...platforms, platform.id]);
                              } else {
                                setPlatforms(platforms.filter(p => p !== platform.id));
                              }
                            }}
                            className="accent-ink"
                          />
                          {platform.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </form>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'crm' ? (
            <motion.div
              key="crm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {!user ? (
                <div className="text-center p-12 border border-dashed border-line/30 rounded-lg">
                  <h2 className="text-xl font-bold mb-2">CRM Access Required</h2>
                  <p className="text-sm opacity-50 mb-4">Please log in to view and manage your saved leads.</p>
                  <button onClick={handleLogin} className="bg-ink text-bg px-6 py-2 text-sm font-medium hover:opacity-90">
                    Login with Google
                  </button>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Business Leads CRM */}
                  <div className="border border-line">
                    <div className="p-4 bg-ink/5 border-b border-line flex items-center justify-between">
                      <h2 className="font-bold uppercase tracking-widest text-sm">Saved Business Leads ({savedLeads.length})</h2>
                    </div>
                    {savedLeads.length === 0 ? (
                      <div className="p-8 text-center text-sm opacity-50">No business leads saved yet.</div>
                    ) : (
                      <div className="divide-y divide-line/10">
                        {savedLeads.map(lead => (
                          <div key={lead.docId} className="p-4 flex items-center justify-between hover:bg-ink/[0.02]">
                            <div>
                              <h3 className="font-bold text-sm">{lead.name}</h3>
                              <p className="text-xs opacity-60">{lead.email || 'No email'} • {lead.phone || 'No phone'}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col gap-1 items-end">
                                <select
                                  value={lead.priority || 'none'}
                                  onChange={(e) => updateLeadPriority('savedLeads', lead.docId, e.target.value)}
                                  className={`text-xs border p-1 focus:outline-none font-bold ${
                                    lead.priority === 'high' ? 'border-red-500 text-red-600 bg-red-50' :
                                    lead.priority === 'medium' ? 'border-yellow-500 text-yellow-600 bg-yellow-50' :
                                    lead.priority === 'low' ? 'border-blue-500 text-blue-600 bg-blue-50' :
                                    'border-line/30 bg-transparent opacity-60'
                                  }`}
                                >
                                  <option value="none">Priority: None</option>
                                  <option value="high">High</option>
                                  <option value="medium">Medium</option>
                                  <option value="low">Low</option>
                                </select>
                                <select
                                  value={lead.status}
                                  onChange={(e) => updateLeadStatus('savedLeads', lead.docId, e.target.value)}
                                  className="text-xs border border-line/30 bg-transparent p-1 focus:outline-none"
                                >
                                  <option value="new">Status: New</option>
                                  <option value="contacted">Status: Contacted</option>
                                  <option value="converted">Status: Converted</option>
                                  <option value="rejected">Status: Rejected</option>
                                </select>
                              </div>
                              <button onClick={() => deleteSavedLead('savedLeads', lead.docId)} className="text-red-500 hover:text-red-700 ml-2">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Intent Leads CRM */}
                  <div className="border border-line">
                    <div className="p-4 bg-ink/5 border-b border-line flex items-center justify-between">
                      <h2 className="font-bold uppercase tracking-widest text-sm">Saved Intent Signals ({savedIntents.length})</h2>
                    </div>
                    {savedIntents.length === 0 ? (
                      <div className="p-8 text-center text-sm opacity-50">No intent signals saved yet.</div>
                    ) : (
                      <div className="divide-y divide-line/10">
                        {savedIntents.map(intent => (
                          <div key={intent.docId} className="p-4 flex items-center justify-between hover:bg-ink/[0.02]">
                            <div className="max-w-2xl">
                              <h3 className="font-bold text-sm truncate">{intent.title}</h3>
                              <p className="text-xs opacity-60 truncate">{intent.snippet}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col gap-1 items-end">
                                <select
                                  value={intent.priority || 'none'}
                                  onChange={(e) => updateLeadPriority('savedIntents', intent.docId, e.target.value)}
                                  className={`text-xs border p-1 focus:outline-none font-bold ${
                                    intent.priority === 'high' ? 'border-red-500 text-red-600 bg-red-50' :
                                    intent.priority === 'medium' ? 'border-yellow-500 text-yellow-600 bg-yellow-50' :
                                    intent.priority === 'low' ? 'border-blue-500 text-blue-600 bg-blue-50' :
                                    'border-line/30 bg-transparent opacity-60'
                                  }`}
                                >
                                  <option value="none">Priority: None</option>
                                  <option value="high">High</option>
                                  <option value="medium">Medium</option>
                                  <option value="low">Low</option>
                                </select>
                                <select
                                  value={intent.status}
                                  onChange={(e) => updateLeadStatus('savedIntents', intent.docId, e.target.value)}
                                  className="text-xs border border-line/30 bg-transparent p-1 focus:outline-none"
                                >
                                  <option value="new">Status: New</option>
                                  <option value="contacted">Status: Contacted</option>
                                  <option value="converted">Status: Converted</option>
                                  <option value="rejected">Status: Rejected</option>
                                </select>
                              </div>
                              <button onClick={() => deleteSavedLead('savedIntents', intent.docId)} className="text-red-500 hover:text-red-700 ml-2">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          ) : loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-64 flex flex-col items-center justify-center gap-4 border border-dashed border-line/30 rounded-lg"
            >
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ scaleY: [1, 2, 1] }}
                    transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                    className="w-1 h-4 bg-ink"
                  />
                ))}
              </div>
              <p className="col-header animate-pulse">Analyzing SERP Data & Extracting Entities</p>
            </motion.div>
          ) : (mode === 'business' && results.length > 0) || (mode === 'intent' && intentResults.length > 0) ? (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-line"
            >
              <div className="flex items-center justify-between p-4 bg-ink/5 border-b border-line">
                <div className="flex items-center gap-4">
                  <span className="col-header">{mode === 'business' ? results.length : intentResults.length} {mode === 'business' ? 'Leads' : 'Intent Signals'} Identified</span>
                  <div className="h-4 w-[1px] bg-line/20" />
                  <span className="col-header">Query: {keywords}</span>
                </div>
                {mode === 'business' && (
                  <button
                    onClick={exportToCSV}
                    className="flex items-center gap-2 text-[11px] uppercase font-bold tracking-wider hover:underline"
                  >
                    <Download size={14} />
                    Export CSV
                  </button>
                )}
              </div>

              {mode === 'business' ? (
                <>
                  {/* Table Header */}
                  <div className="data-row bg-ink/5 border-b-2 border-line">
                    <div className="col-header">#</div>
                    <div 
                      className="col-header cursor-pointer hover:opacity-100 flex items-center transition-opacity"
                      onClick={() => requestSort('name')}
                    >
                      Business Name <SortIcon column="name" />
                    </div>
                    <div 
                      className="col-header cursor-pointer hover:opacity-100 flex items-center transition-opacity"
                      onClick={() => requestSort('address')}
                    >
                      Address <SortIcon column="address" />
                    </div>
                    <div 
                      className="col-header cursor-pointer hover:opacity-100 flex items-center transition-opacity"
                      onClick={() => requestSort('phone')}
                    >
                      Phone <SortIcon column="phone" />
                    </div>
                    <div 
                      className="col-header cursor-pointer hover:opacity-100 flex items-center transition-opacity"
                      onClick={() => requestSort('email')}
                    >
                      Email <SortIcon column="email" />
                    </div>
                    <div 
                      className="col-header cursor-pointer hover:opacity-100 flex items-center transition-opacity"
                      onClick={() => requestSort('website')}
                    >
                      Website <SortIcon column="website" />
                    </div>
                    <div 
                      className="col-header cursor-pointer hover:opacity-100 flex items-center transition-opacity"
                      onClick={() => requestSort('rating')}
                    >
                      Rating <SortIcon column="rating" />
                    </div>
                    <div className="col-header text-right">Actions</div>
                  </div>

                  {/* Table Body */}
                  <div className="divide-y divide-line/10">
                    {sortedResults.map((lead, index) => (
                      <div key={lead.id} className="data-row group">
                        <div className="data-value opacity-40">{(index + 1).toString().padStart(2, '0')}</div>
                        <div className="font-bold text-sm truncate">{lead.name}</div>
                        <div className="data-value truncate opacity-70">{lead.address}</div>
                        <div 
                          className={`data-value cursor-pointer hover:underline flex items-center gap-2 ${processing?.id === lead.id && processing?.field === 'phone' ? 'text-ink/40' : ''}`}
                          onClick={() => handleContactAction(lead.id, 'phone', lead.phone)}
                        >
                          {processing?.id === lead.id && processing?.field === 'phone' && <Loader2 size={10} className="animate-spin" />}
                          {lead.phone || 'N/A'}
                        </div>
                        <div 
                          className={`data-value truncate cursor-pointer hover:underline flex items-center gap-2 ${processing?.id === lead.id && processing?.field === 'email' ? 'text-ink/40' : ''}`}
                          onClick={() => handleContactAction(lead.id, 'email', lead.email)}
                        >
                          {processing?.id === lead.id && processing?.field === 'email' && <Loader2 size={10} className="animate-spin" />}
                          {lead.email || 'N/A'}
                        </div>
                        <div className="data-value truncate">
                          {lead.website ? (
                            <button 
                              onClick={() => handleContactAction(lead.id, 'website', lead.website)}
                              disabled={processing?.id === lead.id && processing?.field === 'website'}
                              className="hover:underline text-blue-600 flex items-center gap-2 disabled:opacity-50 disabled:no-underline"
                            >
                              {processing?.id === lead.id && processing?.field === 'website' && <Loader2 size={10} className="animate-spin" />}
                              {processing?.id === lead.id && processing?.field === 'website' ? 'Loading...' : lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                            </button>
                          ) : (
                            'N/A'
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="data-value font-bold">{lead.rating || '0.0'}</div>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <div 
                                key={star} 
                                className={`w-1 h-3 ${star <= Math.round(lead.rating) ? 'bg-ink' : 'bg-ink/10'}`} 
                              />
                            ))}
                          </div>
                          <span className="text-[10px] opacity-40">({lead.reviews})</span>
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={() => saveBusinessLead(lead)}
                            disabled={savingId === lead.id || savedLeads.some(s => s.id === lead.id)}
                            className="text-ink/40 hover:text-ink transition-colors disabled:opacity-50"
                            title="Save to CRM"
                          >
                            {savingId === lead.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : savedLeads.some(s => s.id === lead.id) ? (
                              <BookmarkCheck size={16} className="text-green-600" />
                            ) : (
                              <Bookmark size={16} />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="divide-y divide-line/10">
                  {/* Intent Summary Section */}
                  {intentSummary && (
                    <div className="p-6 bg-ink/[0.03] border-b border-line">
                      <div className="flex items-center gap-2 mb-4">
                        <AlertCircle size={16} className="text-ink/60" />
                        <h3 className="text-xs uppercase font-bold tracking-widest">Market Intelligence Summary</h3>
                      </div>
                      <div className="grid md:grid-cols-2 gap-8">
                        <div>
                          <p className="text-[10px] uppercase opacity-40 font-bold mb-1">Overall Sentiment</p>
                          <p className="text-sm font-medium italic">"{intentSummary.sentiment}"</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase opacity-40 font-bold mb-1">Common Pain Points</p>
                          <ul className="space-y-1">
                            {intentSummary.painPoints.map((point, i) => (
                              <li key={i} className="text-sm flex items-center gap-2">
                                <div className="w-1 h-1 bg-ink rounded-full" />
                                {point}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {intentResults.map((intent, index) => (
                    <div key={intent.id} className="p-6 hover:bg-ink/[0.02] transition-colors">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="px-2 py-0.5 bg-ink text-bg text-[10px] font-bold uppercase tracking-wider rounded-sm">
                            {intent.source}
                          </div>
                          <span className="text-[10px] opacity-40 font-mono">{intent.date}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => saveIntentLead(intent)}
                            disabled={savingId === intent.id || savedIntents.some(s => s.id === intent.id)}
                            className="text-ink/40 hover:text-ink transition-colors flex items-center gap-1 text-[10px] font-bold uppercase disabled:opacity-50"
                          >
                            {savingId === intent.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : savedIntents.some(s => s.id === intent.id) ? (
                              <BookmarkCheck size={14} className="text-green-600" />
                            ) : (
                              <Bookmark size={14} />
                            )}
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setSelectedIntent(intent);
                              setIsContactModalOpen(true);
                            }}
                            className="text-ink/40 hover:text-ink transition-colors flex items-center gap-1 text-[10px] font-bold uppercase"
                          >
                            <MessageSquare size={14} />
                            Contact
                          </button>
                          <a 
                            href={intent.link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-ink/40 hover:text-ink transition-colors"
                          >
                            <Globe size={14} />
                          </a>
                        </div>
                      </div>
                      <h3 className="font-bold text-lg mb-2 tracking-tight">{intent.title}</h3>
                      <p className="text-sm opacity-70 leading-relaxed mb-4">{intent.snippet}</p>
                      <button
                        onClick={() => window.open(intent.link, '_blank')}
                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:underline"
                      >
                        View Original Post <ArrowRight size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-12 text-center border border-dashed border-red-200 bg-red-50 rounded-lg"
            >
              <p className="text-red-600 font-mono text-sm">{error}</p>
              <button 
                onClick={() => setError(null)}
                className="mt-4 text-xs uppercase font-bold tracking-widest hover:underline"
              >
                Dismiss
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-96 flex flex-col items-center justify-center text-center p-12"
            >
              <div className="w-24 h-24 border border-line/20 rounded-full flex items-center justify-center mb-6">
                <Filter className="opacity-20" size={40} />
              </div>
              <h2 className="text-xl font-bold tracking-tight mb-2">Ready to Scout</h2>
              <p className="text-sm opacity-50 max-w-md mx-auto">
                Enter your target keywords and location above to begin autonomous lead extraction. 
                LeadScout will scrape search results and use AI to structure the data for your follow-up.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Contact Modal */}
      <AnimatePresence>
        {isContactModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsContactModalOpen(false)}
              className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-bg border border-line w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-line flex items-center justify-between bg-ink/5">
                <div className="flex items-center gap-3">
                  <Mail size={18} />
                  <h2 className="text-sm uppercase font-bold tracking-widest">Contact Lead</h2>
                </div>
                <button 
                  onClick={() => setIsContactModalOpen(false)}
                  className="hover:rotate-90 transition-transform"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleContactSubmit} className="p-6 space-y-4">
                {contactError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-sm flex items-center gap-2 text-red-600 text-xs">
                    <AlertCircle size={14} />
                    {contactError}
                  </div>
                )}
                <div className="p-3 bg-ink/5 border border-line/10 rounded-sm mb-4">
                  <p className="text-[10px] uppercase opacity-40 font-bold mb-1">Targeting Post</p>
                  <p className="text-xs font-medium truncate">{selectedIntent?.title}</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold opacity-40">Your Business Email</label>
                  <input
                    required
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="you@yourcompany.com"
                    className="w-full bg-transparent border border-line/30 p-3 text-sm focus:outline-none focus:border-line"
                  />
                </div>

                <div className="p-3 bg-ink/5 border border-line/10 rounded-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-widest opacity-60">Template Settings</span>
                    <button 
                      type="button" 
                      onClick={handleApplyTemplate}
                      className="text-[10px] uppercase font-bold tracking-widest hover:underline text-blue-600"
                    >
                      Fill Draft
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] uppercase font-bold opacity-40">Purpose</label>
                      <select
                        value={templatePurpose}
                        onChange={(e) => setTemplatePurpose(e.target.value as any)}
                        className="w-full bg-bg border border-line/30 p-2 text-xs focus:outline-none focus:border-line"
                      >
                        <option value="Introduction">Introduction</option>
                        <option value="Offering Help">Offering Help</option>
                        <option value="Direct Pitch">Direct Pitch</option>
                      </select>
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] uppercase font-bold opacity-40">Tone</label>
                      <select
                        value={templateTone}
                        onChange={(e) => setTemplateTone(e.target.value as any)}
                        className="w-full bg-bg border border-line/30 p-2 text-xs focus:outline-none focus:border-line"
                      >
                        <option value="Professional">Professional</option>
                        <option value="Casual">Casual</option>
                        <option value="Empathetic">Empathetic</option>
                        <option value="Direct">Direct</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold opacity-40">Message / Proposal</label>
                  <textarea
                    required
                    rows={6}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder="Explain how you can help with their specific pain points..."
                    className="w-full bg-transparent border border-line/30 p-3 text-sm focus:outline-none focus:border-line resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSending}
                  className="w-full bg-ink text-bg py-3 text-sm font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                >
                  {isSending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                  {isSending ? 'Sending Proposal...' : 'Send Contact Request'}
                </button>
                
                <p className="text-[9px] text-center opacity-40 uppercase tracking-tighter">
                  This request will be processed through the LeadScout AI Outreach System
                </p>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Campaign Modal */}
      <AnimatePresence>
        {isCampaignModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCampaignModalOpen(false)}
              className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-bg border border-line w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-line flex items-center justify-between bg-ink/5">
                <div className="flex items-center gap-3">
                  <Database size={18} />
                  <h2 className="text-sm uppercase font-bold tracking-widest">AI Campaign Deployment</h2>
                </div>
                <button 
                  onClick={() => setIsCampaignModalOpen(false)}
                  className="hover:rotate-90 transition-transform"
                >
                  <X size={20} />
                </button>
              </div>

              {!campaignSuccess ? (
                <form onSubmit={handleLaunchCampaign} className="p-6 space-y-5">
                  <div className="p-4 bg-ink/5 border border-line/10 rounded-sm">
                    <p className="text-xs leading-relaxed opacity-70">
                      Configure a Lead Capture Form. The LeadScout AI will automatically scan the selected platforms for active ISO (In Search Of) posts and reply with a link to this specific capture form.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold opacity-40">Target Niche / Service</label>
                      <input
                        required
                        type="text"
                        value={campaignNiche}
                        onChange={(e) => setCampaignNiche(e.target.value)}
                        placeholder="e.g. Home Improvement"
                        className="w-full bg-transparent border border-line/30 p-3 text-sm focus:outline-none focus:border-line"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold opacity-40">Special Offer / Incentive</label>
                      <input
                        required
                        type="text"
                        value={campaignOffer}
                        onChange={(e) => setCampaignOffer(e.target.value)}
                        placeholder="e.g. Free Estimate"
                        className="w-full bg-transparent border border-line/30 p-3 text-sm focus:outline-none focus:border-line"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold opacity-40">Platforms to Deploy On</label>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {['Reddit', 'Facebook Groups', 'Nextdoor'].map((plat) => (
                          <label key={plat} className="flex items-center gap-2 text-xs border border-line/30 p-2 cursor-pointer hover:bg-ink/5">
                            <input type="checkbox" defaultChecked className="accent-ink" />
                            {plat}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-line/10">
                    <button
                      type="submit"
                      disabled={isDeployingCampaign}
                      className="w-full bg-ink text-bg py-3 text-sm font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                    >
                      {isDeployingCampaign ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                      {isDeployingCampaign ? 'Deploying AI Agent...' : 'Generate Form & Activate AI'}
                    </button>
                    <p className="text-[9px] text-center opacity-40 uppercase tracking-tighter mt-3">
                      Lead forms are generated dynamically tailored to the ISO post context.
                    </p>
                  </div>
                </form>
              ) : (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                    <BookmarkCheck size={32} />
                  </div>
                  <h3 className="text-xl font-bold tracking-tight mb-2">Campaign Deployed!</h3>
                  <p className="text-sm opacity-70 max-w-sm mb-6">
                    A custom lead capture form for <strong>{campaignNiche}</strong> has been created. 
                    The LeadScout AI agent is now monitoring platforms to distribute it to qualified leads.
                  </p>
                  <div className="w-full p-4 bg-ink/5 border border-line/20 rounded-sm">
                     <p className="text-xs font-mono truncate text-blue-600">https://leadscout.ai/f/c-{Math.random().toString(36).substr(2, 6)}</p>
                     <p className="text-[10px] uppercase opacity-40 font-bold mt-2">Active Capture Link</p>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="p-6 border-t border-line bg-ink text-bg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex gap-4">
            <span className="col-header text-bg opacity-40">System Status: Nominal</span>
            <span className="col-header text-bg opacity-40">API: Serper + Gemini 3.0</span>
          </div>
          <p className="col-header text-bg opacity-40">© 2026 LeadScout AI Systems</p>
        </div>
      </footer>
    </div>
  );
}
