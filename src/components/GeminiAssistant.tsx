/**
 * Native Gemini Voice Assistant Widget
 *
 * Importer-specific AI assistant that:
 * - Explains how to use the app
 * - References user's batches, inquiries, and packages
 * - Voice-enabled with Gemini
 * - Context-aware for each organization
 */

import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface UserContext {
  batches: any[];
  inquiries: any[];
  packages: any[];
  organizationName: string;
  userName: string;
}

export default function GeminiAssistant() {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [userContext, setUserContext] = useState<UserContext | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // Load user context on mount
  useEffect(() => {
    if (currentUser && isOpen) {
      loadUserContext();
    }
  }, [currentUser, isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize voice recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputMessage(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  /**
   * Load user-specific context (batches, inquiries, packages)
   */
  const loadUserContext = async () => {
    if (!currentUser) return;

    try {
      // Load batches
      const batchesQuery = query(
        collection(db, 'batches'),
        where('organizationId', '==', currentUser.organizationId)
      );
      const batchesSnapshot = await getDocs(batchesQuery);
      const batches = batchesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Load screenshots/inquiries
      const screenshotsQuery = query(
        collection(db, 'screenshots'),
        where('organizationId', '==', currentUser.organizationId)
      );
      const screenshotsSnapshot = await getDocs(screenshotsQuery);
      const inquiries = screenshotsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Load packages
      const packagesQuery = query(
        collection(db, 'packages'),
        where('organizationId', '==', currentUser.organizationId)
      );
      const packagesSnapshot = await getDocs(packagesQuery);
      const packages = packagesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setUserContext({
        batches,
        inquiries,
        packages,
        organizationName: currentUser.organizationId,
        userName: currentUser.displayName || 'User'
      });

      console.log('📊 User context loaded:', { batches: batches.length, inquiries: inquiries.length, packages: packages.length });
    } catch (error) {
      console.error('Error loading user context:', error);
    }
  };

  /**
   * Generate system prompt with user context
   */
  const getSystemPrompt = (): string => {
    if (!userContext) {
      return `You are the ImportFlow AI Assistant. Help users understand how to use ImportFlow for El Salvador package import management.`;
    }

    return `You are the ImportFlow AI Assistant for ${userContext.userName} (${userContext.organizationName}).

## USER'S CURRENT DATA:

**Batches** (${userContext.batches.length} total):
${userContext.batches.map(b => `- ${b.customerName || b.id}: ${b.status}, ${b.screenshotCount || 0} screenshots`).join('\n') || 'No batches yet'}

**Inquiries/Screenshots** (${userContext.inquiries.length} total):
${userContext.inquiries.slice(0, 5).map(i => `- ${i.source}: ${i.extractionStatus}`).join('\n') || 'No inquiries yet'}

**Packages** (${userContext.packages.length} total):
${userContext.packages.slice(0, 5).map(p => `- ${p.trackingNumber}: ${p.status}`).join('\n') || 'No packages yet'}

## YOUR ROLE:
1. Help ${userContext.userName} use ImportFlow effectively
2. Reference their ACTUAL data (batches, inquiries, packages) above
3. Explain features clearly and concisely
4. Provide specific examples using their data

## IMPORTFLOW FEATURES:

**SMS Commands** (Works with ANY phone!):
- /create "Batch Name" - Create batch
- /delete batch-id - Delete batch
- /list - List batches
- /status batch-id - Get status
- /export batch-id - Export documents
- /help - Show commands

**Web App Pages**:
- Dashboard: Overview of all activities
- WhatsApp Inquiries: Process incoming WhatsApp screenshots
- ImportFlow Inquiries: Manual screenshot upload
- Batch Manager: Organize and export batches
- All Packages: Track packages

**AI Extraction**:
Google Gemini extracts order data from screenshots:
- Tracking numbers, order numbers
- Product names, quantities, prices
- HS codes for customs
- Order totals

**Export**:
- Google Doc with embedded images (for customs)
- Google Sheets with extracted data
- Delivery via SMS, WhatsApp, or Email

## CONVERSATION STYLE:
- Be friendly and concise
- Reference ${userContext.userName}'s actual data
- Provide specific next steps
- Use their batch IDs in examples
- Keep responses under 3 paragraphs

Answer the user's question now:`;
  };

  /**
   * Send message to Gemini
   */
  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const systemPrompt = getSystemPrompt();
      const fullPrompt = `${systemPrompt}\n\nUser: ${inputMessage}\n\nAssistant:`;

      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      const assistantMessage: Message = {
        role: 'assistant',
        content: text,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Optionally speak the response
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.1;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      console.error('Error calling Gemini:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Start voice recognition
   */
  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  /**
   * Stop voice recognition
   */
  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  /**
   * Quick suggestions
   */
  const quickSuggestions = [
    "How do I create a batch?",
    "What SMS commands are available?",
    "How does AI extraction work?",
    "Show me my batch status",
    "How do I export a batch?"
  ];

  const handleQuickSuggestion = (suggestion: string) => {
    setInputMessage(suggestion);
  };

  if (!currentUser) return null;

  return (
    <>
      {/* Floating Assistant Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 left-6 z-50 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-full p-4 shadow-2xl transition-all transform hover:scale-110 flex items-center gap-3 group"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="hidden group-hover:inline-block font-medium">AI Assistant</span>
        </button>
      )}

      {/* Assistant Widget */}
      {isOpen && (
        <div className={`fixed bottom-4 left-4 z-50 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl transition-all ${
          isMinimized ? 'w-80 h-16' : 'w-96 max-h-[calc(100vh-2rem)]'
        } flex flex-col`}>
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
              <div>
                <h3 className="font-bold">ImportFlow Assistant</h3>
                <p className="text-xs opacity-90">Powered by Gemini</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                {isMinimized ? '⬆️' : '⬇️'}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900 min-h-0">
                {messages.length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">🤖</div>
                    <h4 className="text-white font-bold mb-2">Hi {currentUser.displayName}!</h4>
                    <p className="text-slate-400 text-sm mb-4">
                      I'm your ImportFlow AI assistant. I can help you with:
                    </p>
                    <div className="text-left text-sm text-slate-400 space-y-1 max-w-xs mx-auto">
                      <p>• Understanding how to use the app</p>
                      <p>• Checking your batches and inquiries</p>
                      <p>• Learning SMS commands</p>
                      <p>• Exporting customs documents</p>
                    </div>
                    <p className="text-slate-500 text-xs mt-4">Try asking me anything or use voice!</p>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-white'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-xs opacity-60 mt-1">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-700 rounded-2xl px-4 py-3">
                      <div className="flex gap-2">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Suggestions */}
              {messages.length === 0 && (
                <div className="flex-shrink-0 px-4 pb-2 space-y-2">
                  <p className="text-xs text-slate-400 font-medium">Quick suggestions:</p>
                  <div className="flex flex-wrap gap-2">
                    {quickSuggestions.slice(0, 3).map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleQuickSuggestion(suggestion)}
                        className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-full transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="flex-shrink-0 p-4 bg-slate-800 rounded-b-2xl border-t border-slate-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Ask me anything..."
                    className="flex-1 bg-slate-700 text-white px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isLoading}
                  />
                  <button
                    onClick={isListening ? stopListening : startListening}
                    className={`p-3 rounded-xl transition-colors ${
                      isListening
                        ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                        : 'bg-purple-600 hover:bg-purple-700'
                    } text-white`}
                    title={isListening ? 'Stop listening' : 'Start voice input'}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={!inputMessage.trim() || isLoading}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl transition-colors font-medium"
                  >
                    Send
                  </button>
                </div>
                {isListening && (
                  <p className="text-xs text-red-400 mt-2 animate-pulse">🎤 Listening...</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
