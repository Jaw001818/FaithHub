import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Minus, RotateCcw, Play, Pause, Music, Info, ListMusic, Trash2, X, ChevronRight, FolderPlus, Folder, Book, Share2, Download, Image as ImageIcon, Sparkles, ChevronDown, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import html2canvas from 'html2canvas';
import { parseChordPro, transposeChord, NOTES, getRootNote, LineupItem, Folder as FolderType, BibleVerse, SearchResult, BIBLE_BOOKS, BIBLE_CHAPTER_COUNTS } from './types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Tab = 'chords' | 'bible';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chords');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [song, setSong] = useState<{ title: string; artist: string; content: string; key: string } | null>(null);
  const [transpose, setTranspose] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // Bible State
  const [bibleTopic, setBibleTopic] = useState('');
  const [bibleBook, setBibleBook] = useState('Genesis');
  const [bibleChapter, setBibleChapter] = useState('1');
  const [bibleVerse, setBibleVerse] = useState('1');
  const [bibleEndVerse, setBibleEndVerse] = useState('');
  const [showFullChapter, setShowFullChapter] = useState(false);
  const [bibleVersion, setBibleVersion] = useState('NIV');
  const [dailyVersion, setDailyVersion] = useState('NIV');
  const [bibleVerses, setBibleVerses] = useState<BibleVerse[]>([]);
  const [fullChapter, setFullChapter] = useState<{ reference: string, text: string } | null>(null);
  const [dailyVerse, setDailyVerse] = useState<BibleVerse | null>(null);
  const [designVerse, setDesignVerse] = useState<BibleVerse | null>(null);
  const [bibleMaxVerses, setBibleMaxVerses] = useState(31);
  
  const scrollInterval = useRef<number | null>(null);

  // Load data from localStorage
  useEffect(() => {
    const savedFolders = localStorage.getItem('chordflow_folders');
    if (savedFolders) {
      try {
        setFolders(JSON.parse(savedFolders));
      } catch (e) {
        console.error("Failed to parse folders", e);
      }
    } else {
      // Default folder
      setFolders([{ id: 'default', name: 'General', items: [] }]);
    }
  }, []);

  // Fetch daily verse when version changes
  useEffect(() => {
    fetchDailyVerse();
  }, [dailyVersion]);

  // Save folders to localStorage
  useEffect(() => {
    localStorage.setItem('chordflow_folders', JSON.stringify(folders));
  }, [folders]);

  // Update max verses when book or chapter changes
  useEffect(() => {
    if (bibleBook && bibleChapter) {
      updateMaxVerses();
    }
  }, [bibleBook, bibleChapter]);

  const updateMaxVerses = async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `How many verses are in ${bibleBook} chapter ${bibleChapter}? Return only the number as a JSON object with field "count".`,
        config: { responseMimeType: "application/json" }
      });
      const data = JSON.parse(response.text || '{"count": 31}');
      const count = parseInt(data.count);
      if (!isNaN(count)) {
        setBibleMaxVerses(count);
        if (parseInt(bibleVerse) > count) setBibleVerse('1');
        if (bibleEndVerse && parseInt(bibleEndVerse) > count) setBibleEndVerse('');
      }
    } catch (e) {
      console.error("Failed to fetch verse count", e);
    }
  };

  const fetchDailyVerse = async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Provide a beautiful, encouraging daily Bible verse in the ${dailyVersion} version. If it's a Filipino version like 'Ang Biblia' or 'MBBTAG', provide the text in Tagalog. Return a JSON object with fields: 'reference', 'text', 'version'.`,
        config: { responseMimeType: "application/json" }
      });
      const data = JSON.parse(response.text || '{}');
      setDailyVerse(data);
    } catch (e) {
      console.error("Failed to fetch daily verse", e);
    }
  };

  const searchSongs = async (query: string) => {
    if (!query) return;
    setLoading(true);
    setShowSearchResults(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Search for songs matching "${query}". Return a JSON array of objects, each with "title" and "artist". Provide up to 5 relevant results.`,
        config: { responseMimeType: "application/json" }
      });
      const results = JSON.parse(response.text || '[]');
      setSearchResults(results);
    } catch (error) {
      console.error("Error searching songs:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSongDetails = async (title: string, artist: string) => {
    setLoading(true);
    setShowSearchResults(false);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Provide the lyrics and chords for the song "${title}" by "${artist}" in a specific format. 
        Format: Use brackets for chords within the lyrics, like "Hello [C]world". 
        Return a JSON object with fields: "title", "artist", "content" (the lyrics/chords), and "originalKey".`,
        config: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(response.text || '{}');
      setSong({
        title: data.title || title,
        artist: data.artist || artist,
        content: data.content || '',
        key: data.originalKey || 'C'
      });
      setTranspose(0);
      setActiveTab('chords');
    } catch (error) {
      console.error("Error fetching song details:", error);
    } finally {
      setLoading(false);
    }
  };

  const findBibleVerses = async () => {
    if (!bibleTopic && !bibleBook) return;
    setLoading(true);
    setFullChapter(null);
    try {
      let prompt = "";
      if (bibleBook) {
        if (showFullChapter) {
          prompt = `Find the full text of ${bibleBook} chapter ${bibleChapter} in the ${bibleVersion} version. If it's a Filipino version like 'Ang Biblia' or 'MBBTAG', provide the text in Tagalog.`;
        } else {
          const verseRange = bibleEndVerse ? `${bibleVerse}-${bibleEndVerse}` : bibleVerse;
          prompt = `Find the specific Bible reference: ${bibleBook} ${bibleChapter}:${verseRange} in the ${bibleVersion} version. If it's a Filipino version like 'Ang Biblia' or 'MBBTAG', provide the text in Tagalog.`;
        }
      } else {
        prompt = `Find 3 relevant Bible verses about "${bibleTopic}" in the ${bibleVersion} version. If it's a Filipino version like 'Ang Biblia' or 'MBBTAG', provide the text in Tagalog.`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `${prompt} Return a JSON array of objects with fields: 'reference', 'text', 'version'.`,
        config: { responseMimeType: "application/json" }
      });
      const data = JSON.parse(response.text || '[]');
      setBibleVerses(Array.isArray(data) ? data : [data]);
    } catch (e) {
      console.error("Failed to find verses", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchFullChapter = async (reference: string) => {
    setLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Provide the full text of the chapter for the reference "${reference}" in the ${bibleVersion} version. If it's a Filipino version like 'Ang Biblia' or 'MBBTAG', provide the text in Tagalog. Return a JSON object with fields: 'reference' (e.g. John 3), 'text' (the full chapter text).`,
        config: { responseMimeType: "application/json" }
      });
      const data = JSON.parse(response.text || '{}');
      setFullChapter(data);
    } catch (e) {
      console.error("Failed to fetch full chapter", e);
    } finally {
      setLoading(false);
    }
  };

  const createFolder = () => {
    const name = prompt("Enter folder name:");
    if (name) {
      setFolders([...folders, { id: Date.now().toString(), name, items: [] }]);
    }
  };

  const addToFolder = (folderId: string) => {
    if (!song) return;
    const newItem: LineupItem = {
      id: Date.now().toString(),
      ...song
    };
    setFolders(folders.map(f => f.id === folderId ? { ...f, items: [...f.items, newItem] } : f));
    setIsSidebarOpen(true);
  };

  const removeFromFolder = (folderId: string, itemId: string) => {
    setFolders(folders.map(f => f.id === folderId ? { ...f, items: f.items.filter(i => i.id !== itemId) } : f));
  };

  const deleteFolder = (id: string) => {
    if (confirm("Delete this folder and all its songs?")) {
      setFolders(folders.filter(f => f.id !== id));
    }
  };

  const clearAllFolders = () => {
    if (confirm("Are you sure you want to clear all folders and songs? This will reset your lineup.")) {
      setFolders([{ id: 'default', name: 'General', items: [] }]);
    }
  };

  const saveVerseImage = async () => {
    const element = document.getElementById('verse-design');
    if (!element) return;
    try {
      const canvas = await html2canvas(element, {
        useCORS: true,
        scale: 2,
        backgroundColor: null,
      });
      const link = document.createElement('a');
      link.download = `bible-verse-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error("Failed to save image", e);
    }
  };

  const shareVerse = async () => {
    if (!designVerse) return;
    const text = `"${designVerse.text}" - ${designVerse.reference} (${designVerse.version})`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Bible Verse',
          text: text,
          url: window.location.href,
        });
      } catch (e) {
        console.log("Share cancelled or failed", e);
      }
    } else {
      // Fallback: Copy to clipboard
      navigator.clipboard.writeText(text);
      alert("Verse copied to clipboard!");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchSongs(searchQuery);
  };

  useEffect(() => {
    if (isScrolling) {
      scrollInterval.current = window.setInterval(() => {
        window.scrollBy(0, scrollSpeed);
      }, 50);
    } else {
      if (scrollInterval.current) clearInterval(scrollInterval.current);
    }
    return () => {
      if (scrollInterval.current) clearInterval(scrollInterval.current);
    };
  }, [isScrolling, scrollSpeed]);

  const parsedLines = song ? parseChordPro(song.content, transpose) : [];

  const handleKeyChange = (newKey: string) => {
    if (!song) return;
    const originalRoot = getRootNote(song.key);
    const targetRoot = getRootNote(newKey);
    let originalIndex = NOTES.indexOf(originalRoot);
    if (originalIndex === -1) originalIndex = 0;
    let targetIndex = NOTES.indexOf(targetRoot);
    if (targetIndex === -1) targetIndex = 0;
    setTranspose(targetIndex - originalIndex);
  };

  const currentKey = song ? transposeChord(song.key, transpose) : 'C';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] selection:bg-blue-500/30 flex overflow-hidden">
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? (window.innerWidth < 640 ? '100%' : '320px') : '0px',
          x: isSidebarOpen ? 0 : -320
        }}
        className="fixed lg:relative h-screen bg-[#111] border-r border-white/10 z-[70] overflow-hidden flex flex-col"
      >
        <div className="p-4 border-b border-white/10 flex flex-col gap-4 min-w-[320px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListMusic className="w-5 h-5 text-blue-400" />
              <h2 className="font-bold text-lg text-white">Lineup</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={clearAllFolders} className="p-2 hover:bg-red-500/10 text-white/40 hover:text-red-400 rounded-full transition-colors" title="Clear All">
                <LogOut className="w-5 h-5" />
              </button>
              <button onClick={createFolder} className="p-2 hover:bg-white/5 rounded-full transition-colors" title="New Folder">
                <FolderPlus className="w-5 h-5" />
              </button>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/5 rounded-full lg:hidden">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Filter lineup..." 
              className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
            />
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-w-[320px] p-2 space-y-4">
          {folders.map(folder => {
            const filteredItems = folder.items.filter(item => 
              item.title.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
              item.artist.toLowerCase().includes(sidebarSearch.toLowerCase())
            );

            if (sidebarSearch && filteredItems.length === 0) return null;

            return (
              <div key={folder.id} className="space-y-1">
                <div className="flex items-center justify-between px-2 py-1 group">
                  <div className="flex items-center gap-2 text-white/40">
                    <Folder className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{folder.name}</span>
                  </div>
                  <button 
                    onClick={() => deleteFolder(folder.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                
                {filteredItems.length === 0 ? (
                  <p className="text-[10px] text-white/20 px-4 italic">No matches</p>
                ) : (
                  filteredItems.map((item, idx) => (
                    <div 
                      key={item.id}
                      className={`group flex items-center gap-2 p-3 rounded-xl transition-all cursor-pointer ${song?.title === item.title ? 'bg-blue-600/20 border border-blue-500/30' : 'hover:bg-white/5 border border-transparent'}`}
                      onClick={() => {
                        setSong(item);
                        setTranspose(0);
                        setActiveTab('chords');
                        if (window.innerWidth < 1024) setIsSidebarOpen(false);
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm truncate">{item.title}</h4>
                        <p className="text-xs text-white/40 truncate">{item.artist}</p>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromFolder(folder.id, item.id);
                        }}
                        className="p-2 text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <div className="flex-1 h-screen overflow-y-auto relative flex flex-col">
        {/* Sticky Header */}
        <header className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/10 px-4 py-3">
          <div className="max-w-4xl mx-auto flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className={`p-2 rounded-lg transition-colors ${isSidebarOpen ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                >
                  <ListMusic className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-4 bg-white/5 rounded-full p-1">
                  <button 
                    onClick={() => setActiveTab('chords')}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeTab === 'chords' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
                  >
                    Chords
                  </button>
                  <button 
                    onClick={() => setActiveTab('bible')}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeTab === 'bible' ? 'bg-amber-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
                  >
                    Bible
                  </button>
                </div>
              </div>

              <div className="flex-1 max-w-md relative">
                <form onSubmit={handleSearch} className="relative">
                  <input
                    type="text"
                    placeholder="Search songs..."
                    className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                </form>

                {/* Search Results Dropdown */}
                <AnimatePresence>
                  {showSearchResults && searchResults.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[100]"
                    >
                      <div className="p-2 border-b border-white/5 flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold px-2">Search Results</span>
                        <button onClick={() => setShowSearchResults(false)} className="p-1 hover:bg-white/5 rounded-full">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto">
                        {searchResults.map((res, i) => (
                          <button 
                            key={i}
                            onClick={() => fetchSongDetails(res.title, res.artist)}
                            className="w-full text-left p-3 hover:bg-white/5 flex items-center justify-between group"
                          >
                            <div>
                              <h4 className="font-bold text-sm">{res.title}</h4>
                              <p className="text-xs text-white/40">{res.artist}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-blue-400 transition-all" />
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsScrolling(!isScrolling)}
                  className={`p-2 rounded-full transition-colors ${isScrolling ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                >
                  {isScrolling ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {song && activeTab === 'chords' && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-white/5"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center bg-white/5 rounded-lg p-1">
                    <button onClick={() => setTranspose(t => t - 1)} className="p-1.5 hover:bg-white/10 rounded-md"><Minus className="w-4 h-4" /></button>
                    <div className="px-3 flex flex-col items-center min-w-[80px]">
                      <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Transpose</span>
                      <select 
                        value={getRootNote(currentKey)}
                        onChange={(e) => handleKeyChange(e.target.value)}
                        className="bg-transparent font-mono font-bold text-blue-400 focus:outline-none cursor-pointer appearance-none text-center"
                      >
                        {NOTES.map(note => <option key={note} value={note} className="bg-[#1a1a1a] text-white">{note}</option>)}
                      </select>
                    </div>
                    <button onClick={() => setTranspose(t => t + 1)} className="p-1.5 hover:bg-white/10 rounded-md"><Plus className="w-4 h-4" /></button>
                  </div>
                  
                  <button onClick={() => setTranspose(0)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/60"><RotateCcw className="w-4 h-4" /></button>

                  <div className="relative group/folder">
                    <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20">
                      <Plus className="w-4 h-4" />
                      Add to Folder
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <div className="absolute top-full left-0 mt-2 w-48 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden opacity-0 invisible group-hover/folder:opacity-100 group-hover/folder:visible transition-all z-[100]">
                      <div className="p-2 border-b border-white/5">
                        <button 
                          onClick={createFolder}
                          className="w-full text-left p-2 hover:bg-white/5 text-xs font-bold text-blue-400 flex items-center gap-2"
                        >
                          <FolderPlus className="w-3 h-3" />
                          New Folder
                        </button>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {folders.map(f => (
                          <button 
                            key={f.id}
                            onClick={() => addToFolder(f.id)}
                            className="w-full text-left p-3 hover:bg-white/5 text-sm"
                          >
                            {f.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Scroll Speed</span>
                    <input type="range" min="0.5" max="5" step="0.5" value={scrollSpeed} onChange={(e) => setScrollSpeed(parseFloat(e.target.value))} className="w-24 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Capo</span>
                    <span className="font-mono font-bold text-orange-400">{transpose < 0 ? `Fret ${Math.abs(transpose)}` : 'None'}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-8 pb-32 flex-1 w-full">
          <AnimatePresence mode="wait">
            {activeTab === 'chords' ? (
              loading ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                  <p className="text-white/40 font-medium animate-pulse">Tuning the strings...</p>
                </motion.div>
              ) : song ? (
                <motion.div key="song" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                  <div className="space-y-1">
                    <h2 className="text-4xl font-bold tracking-tight text-white">{song.title}</h2>
                    <p className="text-xl text-white/40 italic">{song.artist}</p>
                  </div>
                  <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 sm:p-10 shadow-2xl">
                    <div className="font-mono text-lg leading-relaxed overflow-x-auto whitespace-pre">
                      {parsedLines.map((line, idx) => (
                        <div key={idx} className="mb-4 group">
                          {line.chords.trim() && <div className="text-blue-400 font-bold h-6 select-none">{line.chords}</div>}
                          <div className="text-white/80">{line.lyrics || (line.chords.trim() ? "" : "\n")}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-32 text-center gap-6">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center"><Music className="w-10 h-10 text-white/20" /></div>
                  <h3 className="text-2xl font-bold text-white/80">Ready for your set?</h3>
                  <div className="flex flex-wrap justify-center gap-2 mt-4">
                    {['Let It Be', 'Wonderwall', 'Hallelujah', 'Creep'].map(s => <button key={s} onClick={() => { setSearchQuery(s); searchSongs(s); }} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm transition-all">{s}</button>)}
                  </div>
                </motion.div>
              )
            ) : (
              /* Bible Tab Content */
              <motion.div key="bible" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
                {/* Daily Word Section */}
                <section className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-6 h-6 text-amber-400" />
                      <h2 className="text-2xl font-serif italic text-amber-200">Daily Word</h2>
                    </div>
                    <div className="flex items-center gap-2 bg-amber-900/20 rounded-lg p-1">
                      <span className="text-[10px] uppercase tracking-widest text-amber-400/60 font-bold px-2">Version</span>
                      <select 
                        value={dailyVersion}
                        onChange={(e) => setDailyVersion(e.target.value)}
                        className="bg-transparent text-amber-200 text-xs font-bold focus:outline-none cursor-pointer"
                      >
                        {['NIV', 'KJV', 'ESV', 'NASB', 'NLT', 'NKJV', 'ASV', 'Ang Biblia', 'MBBTAG'].map(v => (
                          <option key={v} value={v} className="bg-[#1a1a15]">{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {dailyVerse && (
                    <div className="bg-[#1a1a15] border border-amber-900/30 rounded-3xl p-8 shadow-2xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl rounded-full" />
                      <p className="text-2xl font-serif text-amber-50/90 leading-relaxed italic mb-6">"{dailyVerse.text}"</p>
                      <div className="flex items-center justify-between">
                        <span className="text-amber-400/60 font-medium tracking-widest uppercase text-xs">{dailyVerse.reference} ({dailyVerse.version})</span>
                        <button 
                          onClick={() => setDesignVerse(dailyVerse)}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 rounded-full text-sm font-bold transition-all border border-amber-600/20"
                        >
                          <ImageIcon className="w-4 h-4" />
                          Generate Design
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                <div className="h-px bg-white/5 w-full" />

                {/* Verse Finder Section */}
                <section className="space-y-8">
                  <div className="bg-white/5 rounded-3xl p-8 border border-white/10">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                      <Book className="w-5 h-5 text-blue-400" />
                      Verse Finder
                    </h3>
                    
                    <div className="space-y-6">
                      {/* Search Mode Toggle */}
                      <div className="flex gap-4 p-1 bg-black/40 rounded-xl w-fit">
                        <button 
                          onClick={() => { setBibleBook('Genesis'); setBibleTopic(''); }}
                          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${bibleBook ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white'}`}
                        >
                          Specific Reference
                        </button>
                        <button 
                          onClick={() => { setBibleBook(''); }}
                          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${!bibleBook ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white'}`}
                        >
                          Topic Search
                        </button>
                      </div>

                      {/* Quick Selection Grids */}
                      {bibleBook && (
                        <div className={`grid grid-cols-1 ${showFullChapter ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-6`}>
                          <div className="space-y-3">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold">Book</p>
                            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-black/20 rounded-2xl custom-scrollbar">
                              {BIBLE_BOOKS.map(book => (
                                <button 
                                  key={book}
                                  onClick={() => {
                                    setBibleBook(book);
                                    setBibleChapter('1');
                                    setBibleVerse('1');
                                    setBibleEndVerse('');
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${bibleBook === book ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white'}`}
                                >
                                  {book}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold">Chapter</p>
                            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-black/20 rounded-2xl custom-scrollbar">
                              {Array.from({ length: BIBLE_CHAPTER_COUNTS[bibleBook] || 50 }, (_, i) => i + 1).map(n => (
                                <button 
                                  key={n}
                                  onClick={() => {
                                    setBibleChapter(n.toString());
                                    setBibleVerse('1');
                                    setBibleEndVerse('');
                                  }}
                                  className={`w-10 h-10 flex items-center justify-center rounded-lg text-[10px] font-bold transition-all border ${bibleChapter === n.toString() ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white'}`}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>

                          {!showFullChapter && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-bold">Verses (Click range)</p>
                                {(bibleVerse !== '1' || bibleEndVerse) && (
                                  <button onClick={() => { setBibleVerse('1'); setBibleEndVerse(''); }} className="text-[8px] text-blue-400 font-bold hover:underline">Reset</button>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 bg-black/20 rounded-2xl custom-scrollbar">
                                {Array.from({ length: bibleMaxVerses }, (_, i) => i + 1).map(n => {
                                  const isStart = bibleVerse === n.toString();
                                  const isEnd = bibleEndVerse === n.toString();
                                  const inRange = bibleEndVerse && n > parseInt(bibleVerse) && n < parseInt(bibleEndVerse);
                                  
                                  return (
                                    <button 
                                      key={n}
                                      onClick={() => {
                                        const val = n.toString();
                                        if (!bibleEndVerse && parseInt(val) > parseInt(bibleVerse)) {
                                          setBibleEndVerse(val);
                                        } else {
                                          setBibleVerse(val);
                                          setBibleEndVerse('');
                                        }
                                      }}
                                      className={`w-10 h-10 flex items-center justify-center rounded-lg text-[10px] font-bold transition-all border 
                                        ${isStart || isEnd ? 'bg-blue-600 border-blue-500 text-white' : 
                                          inRange ? 'bg-blue-600/40 border-blue-500/40 text-white' : 
                                          'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-white'}`}
                                    >
                                      {n}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        {!bibleBook ? (
                          <div className="md:col-span-8">
                            <input 
                              type="text" 
                              placeholder="Search by topic (e.g. Love, Strength, Peace)..."
                              className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                              value={bibleTopic}
                              onChange={(e) => setBibleTopic(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && findBibleVerses()}
                            />
                          </div>
                        ) : (
                          <>
                            <div className="md:col-span-3">
                              <select 
                                className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none cursor-pointer text-white/60"
                                value={bibleBook}
                                onChange={(e) => setBibleBook(e.target.value)}
                              >
                                {BIBLE_BOOKS.map(book => (
                                  <option key={book} value={book} className="bg-[#1a1a1a]">{book}</option>
                                ))}
                              </select>
                            </div>
                            <div className="md:col-span-1">
                              <select 
                                className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none cursor-pointer text-white/60"
                                value={bibleChapter}
                                onChange={(e) => setBibleChapter(e.target.value)}
                              >
                                {Array.from({ length: 150 }, (_, i) => i + 1).map(n => (
                                  <option key={n} value={n} className="bg-[#1a1a1a]">{n}</option>
                                ))}
                              </select>
                            </div>
                            {!showFullChapter && (
                              <>
                                <div className="md:col-span-1">
                                  <select 
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none cursor-pointer text-white/60"
                                    value={bibleVerse}
                                    onChange={(e) => setBibleVerse(e.target.value)}
                                  >
                                    {Array.from({ length: 176 }, (_, i) => i + 1).map(n => (
                                      <option key={n} value={n} className="bg-[#1a1a1a]">{n}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="md:col-span-1">
                                  <select 
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none cursor-pointer text-white/60"
                                    value={bibleEndVerse}
                                    onChange={(e) => setBibleEndVerse(e.target.value)}
                                  >
                                    <option value="" className="bg-[#1a1a1a]">To</option>
                                    {Array.from({ length: 176 }, (_, i) => i + 1).map(n => (
                                      <option key={n} value={n} className="bg-[#1a1a1a]">{n}</option>
                                    ))}
                                  </select>
                                </div>
                              </>
                            )}
                            <div className="md:col-span-2 flex items-center gap-2 px-2">
                              <input 
                                type="checkbox" 
                                id="fullChapter"
                                checked={showFullChapter}
                                onChange={(e) => setShowFullChapter(e.target.checked)}
                                className="w-4 h-4 rounded border-white/10 bg-black/40 text-blue-600 focus:ring-blue-500/50"
                              />
                              <label htmlFor="fullChapter" className="text-xs font-bold text-white/40 uppercase tracking-widest cursor-pointer">Full Chapter</label>
                            </div>
                          </>
                        )}
                        
                        <div className="md:col-span-2">
                          <select 
                            className="w-full h-full bg-black/40 border border-white/10 rounded-2xl py-4 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none cursor-pointer text-white/60"
                            value={bibleVersion}
                            onChange={(e) => setBibleVersion(e.target.value)}
                          >
                            {['NIV', 'KJV', 'ESV', 'NASB', 'NLT', 'NKJV', 'ASV', 'Ang Biblia', 'MBBTAG'].map(v => (
                              <option key={v} value={v} className="bg-[#1a1a1a]">{v}</option>
                            ))}
                          </select>
                        </div>

                        <div className="md:col-span-2">
                          <button 
                            onClick={findBibleVerses}
                            disabled={loading || (!bibleTopic && !bibleBook)}
                            className="w-full h-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-900/20 py-4"
                          >
                            {loading ? '...' : 'Find'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {bibleVerses.map((v, i) => (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 flex flex-col justify-between group hover:bg-white/[0.05] transition-all"
                      >
                        <p className="text-lg text-white/80 italic mb-6 leading-relaxed">"{v.text}"</p>
                        <div className="flex items-center justify-between">
                          <span className="text-white/40 font-bold text-xs tracking-widest uppercase">{v.reference}</span>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => fetchFullChapter(v.reference)}
                            className="p-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-full transition-all opacity-0 group-hover:opacity-100"
                            title="Read Full Chapter"
                          >
                            <Book className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => copyToClipboard(`"${v.text}" - ${v.reference}`)}
                            className="p-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-full transition-all opacity-0 group-hover:opacity-100"
                            title="Copy Verse"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setDesignVerse(v)}
                            className="p-2 bg-white/5 hover:bg-blue-600 text-white rounded-full transition-all opacity-0 group-hover:opacity-100"
                            title="Generate Design"
                          >
                            <ImageIcon className="w-4 h-4" />
                          </button>
                        </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Full Chapter Display */}
                  <AnimatePresence>
                    {fullChapter && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="bg-white/[0.02] border border-white/10 rounded-3xl p-8 shadow-2xl relative"
                      >
                        <button 
                          onClick={() => setFullChapter(null)}
                          className="absolute top-4 right-4 p-2 hover:bg-white/5 rounded-full"
                        >
                          <X className="w-5 h-5" />
                        </button>
                        <h3 className="text-2xl font-serif italic text-amber-200 mb-6">{fullChapter.reference}</h3>
                        <div className="text-lg text-white/70 leading-relaxed whitespace-pre-wrap font-serif">
                          {fullChapter.text}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Design Modal */}
      <AnimatePresence>
        {designVerse && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl"
          >
            <div className="max-w-xl w-full space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">Social Media Design</h3>
                <button onClick={() => setDesignVerse(null)} className="p-2 hover:bg-white/10 rounded-full"><X className="w-6 h-6" /></button>
              </div>

              {/* The Design Card */}
              <div className="aspect-square w-full rounded-3xl overflow-hidden relative shadow-2xl" id="verse-design">
                {/* Background (Sunlight/Sky effect) */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#fdfcfb] via-[#e2d1c3] to-[#fdfcfb]">
                  <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')]" />
                  {/* Sun effect */}
                  <div className="absolute -top-20 -right-20 w-[400px] h-[400px] bg-gradient-to-br from-amber-200/40 to-transparent blur-[120px] rounded-full" />
                  <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-white/40 to-transparent" />
                </div>
                
                <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
                  <div className="mb-8">
                    <Sparkles className="w-10 h-10 text-amber-800/20 mx-auto" />
                  </div>
                  <p className="text-3xl font-serif italic text-amber-950 leading-tight mb-10 drop-shadow-sm">"{designVerse.text}"</p>
                  <div className="w-16 h-[1px] bg-amber-900/20 mb-8" />
                  <span className="text-amber-900/60 font-bold tracking-[0.3em] uppercase text-[10px]">{designVerse.reference}</span>
                  <p className="mt-2 text-[8px] text-amber-900/30 uppercase tracking-widest font-bold">ChordFlow Bible</p>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={shareVerse}
                  className="flex-1 py-4 bg-white text-black rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-white/90 transition-all"
                >
                  <Share2 className="w-5 h-5" />
                  Share Verse
                </button>
                <button 
                  onClick={saveVerseImage}
                  className="flex-1 py-4 bg-white/10 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-white/20 transition-all"
                >
                  <Download className="w-5 h-5" />
                  Save Image
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Scroll Controls */}
      {isScrolling && (
        <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-2 scale-125 origin-bottom-right">
          <button onClick={() => setIsScrolling(false)} className="w-12 h-12 bg-red-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-red-700 transition-colors"><Pause className="w-6 h-6" /></button>
        </div>
      )}
    </div>
  );
}
