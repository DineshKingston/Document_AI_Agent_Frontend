/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import FileUpload from './FileUpload';
import SearchBar from './SearchBar';
import SearchResults from './SearchResults';
import mammoth from 'mammoth';
import pdfToText from 'react-pdftotext';
import AIChat from './AIChat';
import HistorySidebar from './HistorySidebar';
import { API_BASE_URL } from '../config';

const Dashboard = ({ user, onLogout }) => {
  // ONE SESSION FOR ALL ACTIVITIES
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [currentSessionData, setCurrentSessionData] = useState(null);
  const [currentDayKey, setCurrentDayKey] = useState(null);
  
  // All activities in the same session
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentSessionMessages, setCurrentSessionMessages] = useState([]);
  
  // UI states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  // Initialize ONE unified session on login
  useEffect(() => {
    if (user?.userId) {
      initializeUnifiedSession();
    }
  }, [user?.userId]);

  // Handle dark mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  // Handle mobile drawer
  useEffect(() => {
    if (mobileDrawerOpen) {
      document.body.classList.add('drawer-open');
    } else {
      document.body.classList.remove('drawer-open');
    }
    return () => {
      document.body.classList.remove('drawer-open');
    };
  }, [mobileDrawerOpen]);

  // FIXED: Create ONE unified session for ALL activities
  const initializeUnifiedSession = async () => {
  setSessionLoading(true);
  setError('');

  try {
    console.log('🆕 Creating ONE unified session for user:', user.userId);
    const response = await fetch(`${API_BASE_URL}/api/history/session/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.userId,
        sessionType: 'UNIFIED_SESSION',
        sessionTitle: `Work Session ${new Date().toLocaleString()}`
      })
    });

    if (response.ok) {
      const data = await response.json();
      
      setCurrentSessionId(data.sessionId || data.session?.id);
      setCurrentSessionData(data.session);
      setCurrentDayKey(data.session?.dayKey);

      clearAllSessionData();

      // ✅ PERSONALIZED WELCOME MESSAGE
      const welcomeMessage = {
        id: Date.now(),
        type: 'ai',
        content: `🎯 **Welcome back, ${user?.username || 'User'}!**\n\nYour unified work session has started:\n• 📁 All document uploads\n• 🔍 All search activities\n• 💬 All AI conversations\n\n**Everything in ONE session for ${user?.username}!**`,
        timestamp: new Date()
      };
      setCurrentSessionMessages([welcomeMessage]);

      console.log('✅ Unified session created:', data.sessionId || data.session?.id);
    } else {
      throw new Error('Failed to create unified session');
    }
  } catch (error) {
    console.error('Error creating unified session:', error);
    setError('Failed to create unified session');
  } finally {
    setSessionLoading(false);
  }
};


  // Clear all session data
  const clearAllSessionData = () => {
    setUploadedFiles([]);
    setSearchResults([]);
    setSearchTerm('');
    setCurrentSessionMessages([]);
    setError('');
    
    // Clear AI backend
    fetch(`${API_BASE_URL}/api/ai/documents`, { method: 'DELETE' })
      .catch(err => console.warn('Failed to clear AI backend:', err));
  };

  // Sanitize metadata for Java backend
  const sanitizeMetadata = (metadata) => {
    const sanitized = { ...metadata };
    
    // Convert numbers to proper types
    if (typeof sanitized.fileSize === 'number') {
      sanitized.fileSize = Math.floor(sanitized.fileSize);
    }
    if (typeof sanitized.documentId !== 'string') {
      sanitized.documentId = String(sanitized.documentId);
    }
    if (typeof sanitized.userId !== 'string') {
      sanitized.userId = String(sanitized.userId);
    }
    
    // Remove undefined values
    Object.keys(sanitized).forEach(key => {
      if (sanitized[key] === undefined || sanitized[key] === null) {
        delete sanitized[key];
      }
    });
    
    return sanitized;
  };

  // Validate file types
  const validateFileType = (file) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];
    return allowedTypes.includes(file.type) || 
           allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
  };

  // Read file content
  const readFileContent = async (file) => {
    return new Promise(async (resolve, reject) => {
      try {
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith('.docx')) {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          resolve(result.value);
        } else if (fileName.endsWith('.pdf')) {
          try {
            const text = await pdfToText(file);
            resolve(text);
          } catch (pdfError) {
            resolve(`[PDF file: ${file.name}] - Could not extract text.`);
          }
        } else if (fileName.endsWith('.doc')) {
          resolve(`[DOC file: ${file.name}] - DOC files have limited support.`);
        } else if (file.type === 'text/plain' || fileName.endsWith('.txt')) {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Failed to read text file'));
          reader.readAsText(file);
        } else {
          reject(new Error(`Unsupported file type: ${file.type}`));
        }
      } catch (error) {
        reject(new Error(`Error reading ${file.name}: ${error.message}`));
      }
    });
  };

const recordInUnifiedSession = async (activityType, activityData) => {
    if (!user?.userId || !currentSessionId) return;
    try {
        if (activityType === 'DOCUMENT_UPLOAD') {
            const metadata = sanitizeMetadata({
                userId: user.userId,
                documentId: activityData.documentId,
                fileName: activityData.fileName,
                fileType: activityData.fileType,
                fileSize: activityData.fileSize,
                textContent: activityData.textContent,
                contentLength: activityData.textContent ? activityData.textContent.length : 0
            });
            await fetch(`${API_BASE_URL}/api/history/document/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(metadata)
            });
        }
        // ✅ ADD MISSING CASES
        else if (activityType === 'SEARCH') {
            await fetch(`${API_BASE_URL}/api/history/search/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.userId,
                    query: activityData.query,
                    queryType: activityData.queryType,
                    resultsCount: activityData.resultsCount
                })
            });
        }
        else if (activityType === 'AI_CHAT') {
            await fetch(`${API_BASE_URL}/api/history/ai/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.userId,
                    question: activityData.question,
                    aiResponse: activityData.aiResponse,
                    metadata: activityData.metadata
                })
            });
        }
    } catch (error) {
        console.error(`Error recording ${activityType}:`, error);
    }
};
  // FIXED: Handle file upload in unified session
  const handleFilesUpload = async (newFiles, appendToExisting = false) => {
    if (!currentSessionId) {
      setError('No active session. Please refresh the page.');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      const existingFileNames = uploadedFiles.map(f => f.name);
      const uniqueNewFiles = Array.from(newFiles).filter(file => 
        !existingFileNames.includes(file.name)
      );

      if (uniqueNewFiles.length === 0) {
        setError('All selected files are already uploaded');
        setIsLoading(false);
        return;
      }

const processedNewFiles = await Promise.all(
    uniqueNewFiles.map(async (file, index) => {
        if (!validateFileType(file)) {
            throw new Error(`Unsupported file type: ${file.name}`);
        }

        const text = await readFileContent(file);
        console.log(`📄 Extracted ${text.length} characters from ${file.name}`);

        // ✅ CRITICAL: Store in AI backend first
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch(`${API_BASE_URL}/api/ai/upload`, {
                method: 'POST',
                body: formData
            });
            if (response.ok) {
                console.log(`✅ AI backend upload successful for ${file.name}`);
            }
        } catch (backendError) {
            console.warn(`AI backend upload error for ${file.name}:`, backendError);
        }

        const fileData = {
            id: `${currentSessionId}_doc_${Date.now()}_${index}`,
            file: file,
            name: file.name,
            type: file.type,
            size: file.size,
            text: text, // ✅ Full text content
            uploadTime: new Date(),
            sessionId: currentSessionId,
            isFromSession: false,
            hasFullContent: true
        };

        // ✅ CRITICAL: Record with full content in session
        await recordInUnifiedSession('DOCUMENT_UPLOAD', {
            documentId: fileData.id,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            textContent: text, // ✅ Store full content
            contentLength: text.length
        });

        return fileData;
    })
);


      if (appendToExisting) {
        setUploadedFiles(prevFiles => [...prevFiles, ...processedNewFiles]);
      } else {
        setUploadedFiles(processedNewFiles);
      }

      console.log(`✅ Uploaded ${processedNewFiles.length} files to unified session:`, currentSessionId);

    } catch (err) {
      console.error('Upload error:', err);
      setError('Error uploading files: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Record search in unified session
  const recordSearchInUnifiedSession = async (searchTerm, resultsCount) => {
    if (!user?.userId || !currentSessionId) return;

    await recordInUnifiedSession('SEARCH', {
      query: searchTerm,
      queryType: 'KEYWORD',
      resultsCount: resultsCount
    });

    // Add search message to unified session
    const searchMessage = {
      id: Date.now(),
      type: 'ai',
      content: `🔍 **Search Performed**: "${searchTerm}"\n\nFound ${resultsCount} results in unified session.`,
      timestamp: new Date()
    };
    setCurrentSessionMessages(prev => [...prev, searchMessage]);
  };

  // Record chat message in unified session  
  const recordChatMessage = async (messageType, content, metadata = null) => {
    if (!user?.userId || !currentSessionId) return;

    // Only record AI responses in backend
    if (messageType === 'AI' && metadata) {
      let parsedMetadata;
      try {
        parsedMetadata = JSON.parse(metadata);
      } catch {
        parsedMetadata = {};
      }
      
      const question = parsedMetadata.question || 'AI Query';
      
      await recordInUnifiedSession('AI_CHAT', {
        question: question,
        aiResponse: content,
        metadata: metadata
      });
    }
  };

  // Search within unified session files
// ✅ ENHANCED: Search that works with restored sessions
const handleSearch = (term) => {
    if (!term || typeof term !== 'string' || !term.trim()) {
        setError('Please enter a valid search term');
        return;
    }

    if (uploadedFiles.length === 0) {
        setError('Please upload files first');
        return;
    }

    setSearchTerm(term);
    setError('');
    setIsLoading(true);

    try {
        const results = uploadedFiles
            .filter(file => file.sessionId === currentSessionId)
            .map(fileData => {
                let fileText = fileData.text || '';
                
                // ✅ Handle restored sessions with limited content
                if (fileText.length < 100 && !fileData.hasFullContent) {
                    console.warn(`⚠️ Limited content for restored file ${fileData.name}`);
                    return {
                        fileId: fileData.id,
                        fileName: fileData.name || 'Unknown file',
                        fileSize: fileData.size || 0,
                        sentences: [{
                            id: 0,
                            number: 1,
                            text: `Document "${fileData.name}" was restored from a previous session. For full search capability, please re-upload the original file.`,
                            originalIndex: 0
                        }],
                        totalMatches: 1,
                        totalOccurrences: 1,
                        isLimitedContent: true
                    };
                }

                // ✅ Normal search for files with full content
                const sentences = fileText
                    .split(/[.!?]+/)
                    .filter(s => typeof s === 'string' && s.trim().length > 0)
                    .map(s => s.trim());

                const matchingSentences = [];
                let occurrenceCount = 0;

                sentences.forEach((sentence, index) => {
                    if (typeof sentence === 'string' && sentence.toLowerCase().includes(term.toLowerCase())) {
                        occurrenceCount++;
                        matchingSentences.push({
                            id: index,
                            number: occurrenceCount,
                            text: sentence,
                            originalIndex: index
                        });
                    }
                });

                const regex = new RegExp(`\\b${term}\\b`, 'gi');
                const totalOccurrences = (fileText.match(regex) || []).length;

                return {
                    fileId: fileData.id,
                    fileName: fileData.name || 'Unknown file',
                    fileSize: fileData.size || 0,
                    sentences: matchingSentences,
                    totalMatches: matchingSentences.length,
                    totalOccurrences: totalOccurrences,
                    hasFullContent: fileData.hasFullContent
                };
            })
            .filter(result => result.totalOccurrences > 0);

        setSearchResults(results);
        const totalResults = results.reduce((sum, result) => sum + result.totalOccurrences, 0);
        
        // ✅ Enhanced search message
        const limitedResults = results.filter(r => r.isLimitedContent);
        recordSearchInUnifiedSession(term, totalResults);
        
        if (limitedResults.length > 0) {
            const searchMessage = {
                id: Date.now(),
                type: 'ai',
                content: `🔍 **Search Results**: "${term}" - ${totalResults} matches found
                
⚠️ **${limitedResults.length} files** have limited content from session restoration
✅ **${results.length - limitedResults.length} files** fully searchable

**Tip**: Re-upload files for complete search functionality`,
                timestamp: new Date()
            };
            setCurrentSessionMessages(prev => [...prev, searchMessage]);
        }

        console.log(`🔍 Search completed: ${totalResults} results`);
    } catch (err) {
        setError('Error searching files: ' + err.message);
    } finally {
        setIsLoading(false);
    }
};


  // Clear unified session
  const handleClear = () => {
    clearAllSessionData();
    
    const clearMessage = {
      id: Date.now(),
      type: 'ai',
      content: `🗑️ **Unified Session Cleared**\n\nAll documents, searches, and chat history cleared from this session.`,
      timestamp: new Date()
    };
    setCurrentSessionMessages([clearMessage]);
    
    console.log('🗑️ Cleared unified session:', currentSessionId);
  };

  // Create new unified session
  const handleNewChat = async () => {
    await initializeUnifiedSession();
    setShowHistory(false);
    closeMobileDrawer();
    console.log('🆕 Started new unified session');
  };

  // ✅ NEW: Force AI backend to clear cache and context
const clearAIBackendCache = async () => {
    try {
        await fetch(`${API_BASE_URL}/api/ai/clear-cache`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user?.userId,
                action: 'session_switch',
                timestamp: Date.now()
            })
        });
        console.log('✅ AI backend cache cleared for fresh responses');
    } catch (error) {
        console.warn('⚠️ Could not clear AI backend cache:', error);
    }
};


  // Switch to different unified session
// Switch to different unified session
const handleSelectSession = async (session) => {
    if (session.id === currentSessionId) {
        setShowHistory(false);
        closeMobileDrawer();
        return;
    }

    setSessionLoading(true);
    setError('');
    
    // ✅ DEFINE restoreCompleteSessionHistory FIRST
    const restoreCompleteSessionHistory = async (sessionId) => {
        try {
            console.log('🔄 Fetching complete session history for:', sessionId);
            const response = await fetch(`${API_BASE_URL}/api/history/session/complete/${sessionId}`);
            const data = await response.json();
            console.log('📊 Complete session data received:', data);
            
            if (data.success) {
                const allMessages = [];
                
                // ✅ Process chatMessages from API
                if (data.chatMessages && data.chatMessages.length > 0) {
                    data.chatMessages.forEach(msg => {
                        allMessages.push({
                            id: msg.id || `restored_${Date.now()}_${Math.random()}`,
                            type: (msg.type || 'ai').toLowerCase(),
                            content: msg.content || '',
                            timestamp: new Date(msg.timestamp || Date.now()),
                            source: msg.source || 'unknown',
                            isRestored: true
                        });
                    });
                }
                
                // ✅ Sort by timestamp
                const sortedMessages = allMessages
                    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                    .filter(msg => msg.content && msg.content.trim().length > 0);
                
                console.log(`✅ Processed ${sortedMessages.length} complete messages for restoration`);
                return sortedMessages;
            } else {
                console.error('❌ API returned error:', data.error);
                return [];
            }
        } catch (error) {
            console.error('❌ Error fetching complete session history:', error);
            return [];
        }
    };

    try {
        console.log('🔄 Switching to unified session:', session.id);
        const response = await fetch(`${API_BASE_URL}/api/history/session/${session.id}/restore`, {
            method: 'POST'
        });

        if (!response.ok) {
            if (response.status === 404) {
                setError('Session no longer exists.');
                setTimeout(() => {
                    setError('');
                    window.location.reload();
                }, 3000);
                setShowHistory(false);
                return;
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        }

        const data = await response.json();
        if (data.success) {
            const restoredSession = data.session;
            clearAllSessionData();
            setCurrentSessionId(restoredSession.id);
            setCurrentDayKey(restoredSession.dayKey);
            setCurrentSessionData(restoredSession);

            // ✅ RESTORE DOCUMENTS FIRST
            if (restoredSession.documentDetails && restoredSession.documentDetails.length > 0) {
                const sessionFiles = await Promise.all(restoredSession.documentDetails.map(async (doc) => {
                    let textContent = doc.textContent;
                    
                    // ✅ If no text content, try to get it from restoration data
                    if (!textContent || textContent.trim().length < 50) {
                        console.log(`⚠️ Missing content for ${doc.fileName}, checking restoration data`);
                        if (restoredSession.restorationData && restoredSession.restorationData.documentRestorationData) {
                            const restorationDoc = restoredSession.restorationData.documentRestorationData[doc.documentId];
                            if (restorationDoc && restorationDoc.textContent) {
                                textContent = restorationDoc.textContent;
                                console.log(`✅ Found content in restoration data for ${doc.fileName}`);
                            }
                        }
                    }
                    
                    // ✅ Final fallback - create meaningful placeholder
                    if (!textContent || textContent.trim().length < 50) {
                        textContent = `RESTORED DOCUMENT: ${doc.fileName}
UPLOAD DATE: ${doc.uploadTime}
FILE TYPE: ${doc.fileType}
ORIGINAL SIZE: ${doc.fileSize} bytes
STATUS: Document restored from session

This document was previously uploaded and is stored in your session.
For full search and AI functionality, please re-upload the original file.

SEARCH: Limited functionality available
AI CHAT: Please re-upload for full AI analysis
SESSION ID: ${restoredSession.id}`;
                    }

                    return {
                        id: doc.documentId,
                        name: doc.fileName,
                        type: doc.fileType || 'application/pdf',
                        size: doc.fileSize || 0,
                        text: textContent,
                        uploadTime: new Date(doc.uploadTime),
                        sessionId: restoredSession.id,
                        isFromSession: true,
                        contentLength: textContent.length,
                        hasFullContent: doc.textContent && doc.textContent.length > 100
                    };
                }));
                
                setUploadedFiles(sessionFiles);
                console.log(`✅ Restored ${sessionFiles.length} documents with content`);
                
                // ✅ Re-upload documents to AI backend
                reuploadSessionDocumentsToAI(sessionFiles);
                
                // ✅ Enhanced restoration message
                const restorationMessage = {
                    id: `restoration_${Date.now()}`,
                    type: 'ai',
                    content: `✅ **Fresh Session Restored for ${user?.username}!**

📁 **Documents**: ${sessionFiles.length} files loaded
🔍 **Search**: ${sessionFiles.filter(f => f.hasFullContent).length}/${sessionFiles.length} files ready
💬 **AI Chat**: Ready for question!

${sessionFiles.filter(f => !f.hasFullContent).length > 0 ? 
`⚠️ **${sessionFiles.filter(f => !f.hasFullContent).length} files need re-upload** for full functionality` : 
'🎯 **All files ready for full functionality!**'}`,
                    timestamp: new Date()
                };
                setCurrentSessionMessages([ restorationMessage]);

                await clearAIBackendCache();

                reuploadSessionDocumentsToAI(sessionFiles);
            }

            // ✅ RESTORE MESSAGES SECOND (only one declaration)
            // ✅ RESTORE MESSAGES SECOND (replace, don't append)
const completeMessages = await restoreCompleteSessionHistory(restoredSession.id);
if (completeMessages.length > 0) {
    setCurrentSessionMessages(completeMessages); // ✅ REPLACE instead of append
    console.log(`✅ Restored complete chat history: ${completeMessages.length} messages`);
} else if (restoredSession.messages && restoredSession.messages.length > 0) {
    // ✅ Final fallback to session messages
    const fallbackMessages = restoredSession.messages
        .filter(msg => msg && msg.content && msg.content.trim())
        .map(msg => ({
            id: msg.id || `fallback_${Date.now()}_${Math.random()}`,
            type: (msg.type || 'ai').toLowerCase(),
            content: msg.content,
            timestamp: new Date(msg.timestamp || Date.now()),
            isRestored: true
        }));
    
    setCurrentSessionMessages(fallbackMessages); // ✅ REPLACE instead of append
    console.log(`✅ Fallback messages restored: ${fallbackMessages.length} messages`);
}


            // Restore last search
            if (restoredSession.searchQueries && restoredSession.searchQueries.length > 0) {
                const lastSearch = restoredSession.searchQueries[restoredSession.searchQueries.length - 1];
                setSearchTerm(lastSearch.query);
                setTimeout(() => {
                    if (uploadedFiles.length > 0) {
                        console.log('🔍 Restoring search:', lastSearch.query);
                        handleSearch(lastSearch.query);
                    }
                }, 3000);
            }

            setShowHistory(false);
            closeMobileDrawer();
            console.log('✅ Unified session switched successfully:', session.id);
        } else {
            setError(data.error || 'Failed to restore session');
        }
    } catch (error) {
        console.error('Error loading session:', error);
        setError('Error loading session: ' + error.message);
        setShowHistory(false);
    } finally {
        setSessionLoading(false);
    }
};

const sanitizeContentForUpload = (content, fileName) => {
  if (!content || typeof content !== 'string') {
    return `[Document: ${fileName}]\nRestored from session\nContent available for search but limited for AI analysis.`;
  }
  
  // ✅ AGGRESSIVE SANITIZATION for AI backend compatibility
  let sanitized = content
    // Remove all control characters and non-printable chars
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    // Remove BOM and other problematic Unicode
    .replace(/\uFEFF/g, '')
    .replace(/\u200B/g, '') // Zero-width space
    .replace(/\u2060/g, '') // Word joiner
    // Clean up multiple spaces and line breaks
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
  
  // ✅ ENSURE VALID CONTENT STRUCTURE for Document AI
  if (sanitized.length > 32000) {
    // Split into meaningful chunks rather than arbitrary truncation
    const firstPart = sanitized.substring(0, 15000);
    const lastPart = sanitized.substring(sanitized.length - 15000);
    sanitized = firstPart + '\n\n[... Content truncated for AI processing ...]\n\n' + lastPart;
  }
  
  // ✅ ENSURE MINIMUM CONTENT LENGTH
  if (sanitized.length < 200) {
    const paddedContent = `
DOCUMENT: ${fileName}
RESTORED: ${new Date().toLocaleString()}
STATUS: Content preserved from session

ORIGINAL CONTENT:
${sanitized}

PROCESSING NOTES:
This document was successfully restored from a previous session. The content has been preserved and is fully searchable. For optimal AI analysis, consider re-uploading the original file.

COMPATIBILITY PADDING:
This additional text ensures the document meets minimum processing requirements for the AI backend while maintaining the integrity of your original content.

END OF DOCUMENT
`;
    sanitized = paddedContent;
  }
  
  return sanitized;
};



// ✅ FIXED: Actually re-upload documents to AI backend on session restore
const reuploadSessionDocumentsToAI = async (sessionFiles) => {
  if (!sessionFiles || sessionFiles.length === 0) {
    console.log('No session files to re-upload');
    return;
  }

  try {
    console.log(`🔄 Re-uploading ${sessionFiles.length} documents to AI backend for session continuity`);
    
    // Clear AI backend first
    await fetch(`${API_BASE_URL}/api/ai/documents`, { method: 'DELETE' }).catch(() => {});

    // Progress message
    const progressMessage = {
      id: Date.now(),
      type: 'ai',
      content: `🔄 **Restoring AI Chat for ${user?.username}**\n\nRe-uploading ${sessionFiles.length} document(s) to AI backend...\n\n🔍 Search is already working perfectly!\n⏳ Preparing AI chat functionality...`,
      timestamp: new Date()
    };
    setCurrentSessionMessages(prev => [...prev, progressMessage]);

    // ✅ CRITICAL: Re-upload each document individually
    let successCount = 0;
    let failedFiles = [];

    for (const fileData of sessionFiles) {
      try {
        // ✅ Use the actual document content from session
        let textContent = fileData.text || '';
        
        if (!textContent || textContent.trim().length < 100) {
          console.warn(`⚠️ Insufficient content for ${fileData.name}`);
          textContent = `Document: ${fileData.name}\nRestored from session: ${new Date().toLocaleString()}\nContent: Limited content available\nFor full AI analysis, please re-upload the original document file.`;
        }

        // ✅ Create proper file for AI backend
        const blob = new Blob([textContent], { type: 'text/plain; charset=utf-8' });
        const file = new File([blob], fileData.name, { type: 'text/plain' });
        
        const formData = new FormData();
        formData.append('file', file);

        console.log(`📤 Re-uploading ${fileData.name} (${file.size} bytes)`);
        
        // ✅ Upload to AI backend using /api/ai/upload (same endpoint that works on first login)
        const uploadResponse = await fetch(`${API_BASE_URL}/api/ai/upload`, {
          method: 'POST',
          body: formData,
          headers: {
            'X-Session-ID': fileData.sessionId,
            'X-Session-Switch': 'true',
            'X-Timestamp': Date.now().toString()
          }
        });

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          console.log(`✅ Successfully re-uploaded ${fileData.name}:`, uploadData);
          successCount++;
        } else {
          const errorText = await uploadResponse.text();
          console.error(`❌ Failed to re-upload ${fileData.name}:`, errorText);
          failedFiles.push({ name: fileData.name, error: `${uploadResponse.status}: ${errorText}` });
        }

      } catch (error) {
        console.error(`❌ Error processing ${fileData.name}:`, error);
        failedFiles.push({ name: fileData.name, error: error.message });
      }
      
      // Small delay between uploads
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // ✅ Status message with results
    const statusMessage = {
      id: Date.now() + 1,
      type: 'ai',
      content: `${successCount > 0 ? '✅' : '⚠️'} **AI Chat Restoration Complete!**\n\n📊 **Results:**\n• ${successCount} documents successfully uploaded to AI backend\n• ${failedFiles.length} documents failed\n\n🔍 **Search:** ✅ Fully functional\n💬 **AI Chat:** ${successCount > 0 ? '✅ Ready for questions!' : '⚠️ Use search or try manual re-upload'}\n\n**✅ You can now:**\n${successCount > 0 ? '• Ask AI questions with full conversation context\n• Continue previous discussions seamlessly\n• Get AI analysis of your documents\n' : ''}• Use comprehensive search functionality\n• Access complete session history\n\n${failedFiles.length > 0 ? `**⚠️ Files needing attention:**\n${failedFiles.map(f => `• ${f.name}: ${f.error}`).slice(0, 3).join('\n')}\n\n` : ''}**Your session is fully restored!**`,
      timestamp: new Date()
    };
    
    setCurrentSessionMessages(prev => [...prev, statusMessage]);

    return successCount > 0;

  } catch (error) {
    console.error('❌ Document re-upload failed:', error);
    
    const errorMessage = {
      id: Date.now() + 1,
      type: 'ai',
      content: `⚠️ **Session Restored with Search**\n\n🔍 **Search works perfectly** across all restored documents\n⚠️ **AI chat** needs manual document re-upload\n\n**Available now:**\n• Full document search functionality\n• Complete session history\n• All previous conversations\n\n**For AI chat:** Please re-upload your documents manually`,
      timestamp: new Date()
    };
    
    setCurrentSessionMessages(prev => [...prev, errorMessage]);
    
    return false;
  }
};



  const toggleDarkMode = () => setIsDarkMode(prev => !prev);
  const toggleMobileDrawer = () => setMobileDrawerOpen(!mobileDrawerOpen);
  const closeMobileDrawer = () => setMobileDrawerOpen(false);
  const handleHistoryClick = () => {
    setShowHistory(true);
    closeMobileDrawer();
  };

  // Error display component
  const ErrorMessage = ({ error, onClose }) => {
    if (!error) return null;
    
    return (
      <div className="error-banner">
        <div className="error-content">
          <span className="error-icon">⚠️</span>
          <span className="error-text">{error}</span>
          <button className="error-close-btn" onClick={onClose}>✕</button>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard">
      {/* Error banner */}
      <ErrorMessage error={error} onClose={() => setError('')} />

      {/* Mobile Drawer Overlay */}
      {mobileDrawerOpen && (
        <div 
          className="mobile-drawer-overlay open"
          onClick={closeMobileDrawer}
        />
      )}

      {/* Mobile Drawer */}
      <div className={`mobile-drawer ${mobileDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="drawer-logo">
            <span className="navbar-logo-icon">📄</span>
            Document AI Agent
          </div>
          <div className="drawer-welcome">Welcome back!</div>
          <div className="drawer-user-info">{user?.username || 'User'}</div>
        </div>
        
        <div className="drawer-nav">
          <div className="drawer-nav-item" onClick={handleHistoryClick}>
            <span className="nav-icon">📚</span>
            <span className="nav-text">History Sessions</span>
          </div>
          <div className="drawer-nav-item" onClick={handleNewChat}>
            <span className="nav-icon">➕</span>
            <span className="nav-text">New Session</span>
          </div>
          <div className="drawer-nav-item" onClick={toggleDarkMode}>
            <span className="nav-icon">{isDarkMode ? '☀️' : '🌙'}</span>
            <span className="nav-text">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </div>
        </div>
        
        <div className="drawer-footer">
          <button className="drawer-logout-btn" onClick={onLogout}>
            <span>🚪</span>
            Logout
          </button>
        </div>
      </div>

      {/* Main Navbar */}
      <nav className="navbar">
        <div className="navbar-left">
          <button 
            className={`hamburger-btn ${mobileDrawerOpen ? 'open' : ''}`}
            onClick={toggleMobileDrawer}
          >
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
          </button>
          
          <a href="#" className="navbar-logo">
            <span className="navbar-logo-icon">📄</span>
            Document AI Agent
          </a>
        </div>
        
        <div className="navbar-right">
          <span className="welcome-text desktop-only">
            Welcome, {user?.username || 'User'}!
          </span>
          
          {/* {currentSessionId && (
            <span className="session-info desktop-only">
              Unified Session: {currentDayKey} | All Activities
            </span>
          )} */}
          
          <button 
            className="new-session-btn desktop-only"
            onClick={handleNewChat}
            disabled={sessionLoading}
          >
            ➕ New Session
          </button>
          
          <button 
            className="history-toggle-btn desktop-only"
            onClick={handleHistoryClick}
          >
            📚 History Sessions
          </button>
          
          {/* <button 
            className="theme-toggle-btn"
            onClick={toggleDarkMode}
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button> */}
          
          <button className="logout-btn desktop-only" onClick={onLogout}>
            Logout
          </button>
        </div>
      </nav>

      {/* History Sidebar */}
      <HistorySidebar
        isOpen={showHistory}
        onToggle={() => setShowHistory(false)}
        user={user}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        currentSessionId={currentSessionId}
        currentDayKey={currentDayKey}
      />

      {/* Session Loading Overlay */}
      {sessionLoading && (
        <div className="session-loading-overlay">
          <div className="session-loading-content">
            <div className="spinner"></div>
            <p>Loading New session...</p>
            <p className="loading-subtitle">
              {currentSessionId ? 'Switching sessions...' : 'Creating new unified session...'}
            </p>
          </div>
        </div>
      )}

      {/* Dashboard Main Content */}
      <main className="dashboard-main">
        <div className="dashboard-grid">
          {/* File Upload Section */}
          <section className="upload-section">
            <div className="section-header">
              <h2>
                <span className="section-icon">📁</span>
                Document Upload
              </h2>
              <p>Upload files</p>
              
            </div>
            
            <FileUpload
              onFilesUpload={handleFilesUpload}
              uploadedFiles={uploadedFiles}
              onClear={handleClear}
              isLoading={isLoading}
              error={error}
            />
          </section>

          {/* Search Section */}
          {uploadedFiles.length > 0 && (
            <section className="search-section">
              <div className="section-header">
                <h2>
                  <span className="section-icon">🔍</span>
                  Document Search
                </h2>
                <p>Search within unified session documents</p>
              </div>
              
              <SearchBar
                onSearch={handleSearch}
                isLoading={isLoading}
                searchTerm={searchTerm}
                uploadedFiles={uploadedFiles}
                currentSessionId={currentSessionId}
                searchHistory={currentSessionData?.searchQueries || []}
              />
              
              {searchResults.length > 0 && (
                <SearchResults
                  results={searchResults}
                  searchTerm={searchTerm}
                  uploadedFiles={uploadedFiles}
                  currentSessionId={currentSessionId}
                />
              )}
            </section>
          )}

          {/* AI Chat Section - FIXED: Key prop for session reset */}
          <section className="ai-section">
            <div className="section-header">
              <h2 className='ai-section-title'>
                <span className="section-icon">🤖</span>
                AI Assistant
              </h2>
              <p>Chat about documents to get the Details</p>
              {currentSessionId && (
                <div className="session-chat-indicator">
                  
                </div>
              )}
            </div>
            
            {currentSessionId && (
                <AIChat
                    key={currentSessionId} // ✅ Force remount on session change
                    uploadedFiles={uploadedFiles}
                    user={user}
                    onRecordMessage={recordChatMessage}
                    initialMessages={currentSessionMessages}
                    isSessionLoading={sessionLoading}
                />
              )}

          </section>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;