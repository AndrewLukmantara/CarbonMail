"use client";
import React, { useState, useEffect } from 'react';
import { EMAILS } from "@/data/emails11";

// Map the `EMAILS` export into a UI-friendly shape used across this client component.
const DISPLAY_EMAILS = EMAILS.map((e) => ({
  id: e.id,
  from: e.from?.name ?? String(e.from),
  subject: e.subject,
  category: (e.labels && e.labels[0] ? String(e.labels[0]).toLowerCase() : 'inbox'),
  read: Boolean(e.read),
  size: e.sizeKB ?? 0,
  body: e.body,
}));

type Page = 'dashboard' | 'scanning' | 'review' | 'impact';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [scanProgress, setScanProgress] = useState(0);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [scannedEmails, setScannedEmails] = useState<any[]>([]);
  const [lifetimeImpact, setLifetimeImpact] = useState({ co2: 2.3, storage: 75 });
  const [deletedEmailIds, setDeletedEmailIds] = useState<Set<string>>(new Set());
  async function classifyEmailsClient(emails: any[], model = 'llama3') {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails, model }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Scan failed');
    }
    return res.json();
  }

  const handleScan = async () => {
    setScanProgress(0);
    setCurrentPage('scanning');

    // animate progress while the server works
    const interval = setInterval(() => setScanProgress(p => Math.min(95, p + Math.floor(Math.random() * 8) + 3)), 200);

    try {
      // send a reasonable subset to avoid huge payloads
      const subset = EMAILS.slice(0, 20);
      const json = await classifyEmailsClient(subset, 'llama3');

      // json.results is [{ emailId, classification }, ...]
      const resultsMap = new Map<string, any>();
      (json.results ?? []).forEach((r: any) => resultsMap.set(r.emailId, r.classification));

      // Normalize merged results for the UI (keep simple fields: id, from, subject, category, size)
      const merged = subset.map(e => {
        const display = DISPLAY_EMAILS.find(d => d.id === e.id);
        return {
          id: e.id,
          from: display?.from ?? e.from?.name ?? String(e.from),
          subject: e.subject,
          category: display?.category ?? (e.labels && e.labels[0] ? String(e.labels[0]).toLowerCase() : 'inbox'),
          read: Boolean(e.read),
          size: e.sizeKB ?? 0,
          body: e.body,
          decision: resultsMap.get(e.id)?.decision ?? 'REVIEW',
          confidence: resultsMap.get(e.id)?.confidence ?? 0.5,
          reason: resultsMap.get(e.id)?.reason ?? 'No reason provided',
        };
      });

      setScannedEmails(merged);
      setSelectedEmails(new Set(merged.filter(m => m.decision === 'DELETE').map(m => m.id)));

      setScanProgress(100);
      clearInterval(interval);
      setTimeout(() => setCurrentPage('review'), 400);
    } catch (err: any) {
      clearInterval(interval);
      setScanProgress(0);
      setCurrentPage('dashboard');
      console.error('Scan failed:', err?.message ?? err);
      alert('Failed to run scan: ' + (err?.message ?? 'unknown'));
    }
  };

  const handleDelete = () => {
    const totalSize = Array.from(selectedEmails).reduce((acc, id) => {
      const email = scannedEmails.find((e: any) => e.id === id || String(e.id) === String(id));
      return acc + (email?.size || 0);
    }, 0);

    setLifetimeImpact({
      co2: lifetimeImpact.co2 + (totalSize * 0.0001),
      storage: lifetimeImpact.storage + totalSize,
    });

    // Add deleted emails to the deleted set
    const newDeletedIds = new Set(deletedEmailIds);
    selectedEmails.forEach(id => newDeletedIds.add(id));
    setDeletedEmailIds(newDeletedIds);

    setCurrentPage('impact');
  };

  return (
    <div>
      {currentPage === 'dashboard' && (
        <DashboardPage 
          onScan={handleScan}
          onAutomation={() => setAutomationOpen(true)}
          lifetimeImpact={lifetimeImpact}
          deletedEmailIds={deletedEmailIds}
        />
      )}
      
      {currentPage === 'scanning' && (
        <ScanningPage progress={scanProgress} />
      )}
      
      {currentPage === 'review' && (
        <ReviewPage 
          emails={scannedEmails}
          selectedIds={selectedEmails}
          onToggle={(id: string) => {
            const newSet = new Set(selectedEmails);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            setSelectedEmails(newSet);
          }}
          onBack={() => setCurrentPage('dashboard')}
          onConfirm={handleDelete}
        />
      )}
      
      {currentPage === 'impact' && (
        <ImpactPage 
          count={selectedEmails.size}
          onBack={() => {
            setCurrentPage('dashboard');
            setSelectedEmails(new Set());
          }}
          lifetimeImpact={lifetimeImpact}
        />
      )}
      
      {automationOpen && (
        <AutomationModal onClose={() => setAutomationOpen(false)} />
      )}
    </div>
  );
}

// ===== DASHBOARD PAGE =====
function DashboardPage({ onScan, onAutomation, lifetimeImpact, deletedEmailIds }: any) {
  const [activeCategory, setActiveCategory] = useState('inbox');
  
  // Filter out deleted emails
  const visibleEmails = DISPLAY_EMAILS.filter(email => !deletedEmailIds.has(email.id));
  
  const filteredEmails = activeCategory === 'inbox' 
    ? visibleEmails
    : visibleEmails.filter(email => email.category === activeCategory);
  
  const categories = [
    { name: 'inbox', label: 'Inbox', count: visibleEmails.length },
    { name: 'primary', label: 'Primary', count: visibleEmails.filter(e => e.category === 'primary').length },
    { name: 'spam', label: 'Spam', count: visibleEmails.filter(e => e.category === 'spam').length },
    { name: 'promotions', label: 'Promotions', count: visibleEmails.filter(e => e.category === 'promotions').length },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: "'Lexend Deca', sans-serif" }}>
      {/* Top Bar */}
      <div style={{ backgroundColor: 'white', padding: '1rem 2rem', borderBottom: '2px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <img src="logo-removebg-preview.png" alt="Carbon Mail" style={{ width: 36, height: 36, objectFit: 'contain' }} />
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>Carbon Mail</h1>
      </div>

      {/* Dashboard */}
      <div style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.3), rgba(255,255,255,0.3)), url(/wapepe.png)', padding: '2rem' }}>
      <div style={{ backgroundColor: 'white', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)', borderRadius: '8px', padding: '2rem' }}>
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem' }}>Approximate Lifetime impact</h2>
        
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          <StatCard title="Appx. CO₂ Saved" value={"12.5 kg"} color="#71a200" />
          <StatCard title="Appx. Water Saved" value={`56 L`} color="#71a200" />
          <StatCard title="Appx. Elec. Saved" value={`31 kWh`} color="#71a200"/>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '2px solid #e0e0e0', paddingBottom: '1rem', marginBottom: '2rem' }}>
          {categories.map(cat => (
            <button key={cat.name} onClick={() => setActiveCategory(cat.name)} style={{
              padding: '0.5rem 1rem', border: activeCategory === cat.name ? '2px solid #a3cf90' : '2px solid #e0e0e0',
              borderRadius: '6px', backgroundColor: activeCategory === cat.name ? '#f0fdf4' : 'white',
              cursor: 'pointer', fontSize: '1rem', fontWeight: activeCategory === cat.name ? 'bold' : 'normal',
              color: activeCategory === cat.name ? '#396b23' : '#666'
            }}>
              {cat.label} ({cat.count})
            </button>
          ))}
          
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            <button onClick={onAutomation} style={{ padding: '0.5rem 1rem', border: '2px solid #e0e0e0', borderRadius: '6px', backgroundColor: 'white', cursor: 'pointer', fontSize: '0.9rem' }}>
              Automation
            </button>
            <button onClick={onScan} style={{ padding: '0.5rem 1.5rem', border: 'none', borderRadius: '6px', backgroundColor: '#71a200', color: 'white', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
              Clean up
            </button>
          </div>
        </div>
        </div>

        {/* Email List */}
          <div style={{ marginTop: '2rem', backgroundColor: 'white', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)', borderRadius: '8px', overflow: 'hidden' }}>
            <div>
              {filteredEmails.map(email => (
                <EmailRow key={email.id} email={email} />
              ))}
            </div>
          </div>
      </div>
    </div>
  );
}

// ===== SCANNING PAGE =====
function ScanningPage({ progress }: { progress: number }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Lexend Deca', sans-serif" }}>
      <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)', width: '500px', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}></div>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Scanning Emails with AI</h2>
        <p style={{ color: '#666', marginBottom: '2rem' }}>Analyzing metadata with local AI model...</p>
        
        {/* Progress Bar */}
        <div style={{ width: '100%', height: '20px', backgroundColor: '#e0e0e0', borderRadius: '10px', overflow: 'hidden', marginBottom: '1rem' }}>
          <div style={{ width: `${progress}%`, height: '100%', backgroundColor: '#a3cf90', transition: 'width 0.3s ease' }} />
        </div>
        
        <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#598745' }}>{progress}%</p>
        
        <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#a3cf90', borderRadius: '6px', border: '1px solid #10b981' }}>
          <p style={{ fontSize: '0.875rem', color: '#598745', margin: 0 }}>
            All analysis happens locally on your device. No data leaves your machine.
          </p>
        </div>
      </div>
    </div>
  );
}

// ===== REVIEW PAGE =====
function ReviewPage({ emails, selectedIds, onToggle, onBack, onConfirm }: any) {
  const deletableEmails = emails.filter((e: any) => e.decision === 'DELETE');
  const totalSize = Array.from(selectedIds).reduce((acc: number, id: any) => {
    const email = emails.find((e: any) => e.id === id);
    return acc + (email?.size || 0);
  }, 0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: "'Lexend Deca', sans-serif" }}>
      <div style={{ backgroundColor: 'white', padding: '1rem 2rem', borderBottom: '2px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <img src="logo-removebg-preview.png" alt="Carbon Mail" style={{ width: 28, height: 28, objectFit: 'contain' }} />
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>Carbon Mail</h1>
      </div >
    
      <div style={{ margin: '2rem', backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Review Deletable Emails</h2>
        <p style={{ color: '#666', marginBottom: '2rem' }}>
          AI found {deletableEmails.length} emails that can be deleted. Review and confirm.
        </p>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ padding: '1rem'}}>
            <div style={{ fontSize: '0.875rem', color: '#666' }}>Selected</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#71a200' }}>{selectedIds.size}</div>
          </div>
          <div style={{ padding: '1rem'}}>
            <div style={{ fontSize: '0.875rem', color: '#666' }}>Total Size</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#71a200' }}>{(totalSize * 0.001).toFixed(3)} MB</div>
          </div>
          <div style={{ padding: '1rem'}}>
            <div style={{ fontSize: '0.875rem', color: '#666' }}>Appx. CO₂ Saved</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#71a200' }}>{(totalSize * 0.0001).toFixed(3)} kg</div>
          </div>
        </div>

        {/* Email List */}
        <div style={{ border: '2px solid #e0e0e0', borderRadius: '8px', maxHeight: '400px', overflowY: 'auto', marginBottom: '2rem' }}>
          {deletableEmails.map((email: any) => (
            <div key={email.id} style={{ padding: '1rem', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'start', gap: '1rem' }}>
              <input 
                type="checkbox" 
                checked={selectedIds.has(email.id)}
                onChange={() => onToggle(email.id)}
                style={{ width: '18px', height: '18px', cursor: 'pointer', marginTop: '4px' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                  {email.from} — {email.subject}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>
                  {email.size} KB • {email.category}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    padding: '0.25rem 0.5rem', 
                    backgroundColor: email.decision === 'DELETE' ? '#fee2e2' : '#dcfce7',
                    color: email.decision === 'DELETE' ? '#991b1b' : '#166534',
                    borderRadius: '4px',
                    fontWeight: 'bold'
                  }}>
                    {email.decision}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#999' }}>
                    {email.reason} ({Math.round(email.confidence * 100)}% confidence)
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      
        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={onBack} style={{ padding: '0.75rem 1.5rem', border: '2px solid #e0e0e0', borderRadius: '6px', backgroundColor: 'white', cursor: 'pointer', fontSize: '1rem' }}>
            ← Back
          </button>
          <button 
            onClick={onConfirm}
            disabled={selectedIds.size === 0}
            style={{ 
              padding: '0.75rem 2rem', 
              border: 'none', 
              borderRadius: '6px', 
              backgroundColor: selectedIds.size > 0 ? '#ef4444' : '#ccc', 
              color: 'white', 
              cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed', 
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            Delete {selectedIds.size} Emails
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== IMPACT PAGE =====
function ImpactPage({ count, onBack, lifetimeImpact }: any) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Lexend Deca', sans-serif" }}>
      <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)', width: '500px', textAlign: 'center' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}></div>
        <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Cleanup Complete!</h2>
        <p style={{ color: '#666', marginBottom: '2rem' }}>You've successfully deleted {count} emails</p>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ padding: '1.5rem', border: '2px solid #71a200', borderRadius: '8px', backgroundColor: '#f0fdf4' }}>
            <div style={{ fontSize: '0.875rem', color: '#166534' }}>Appx. CO₂ Saved</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#71a200' }}>0.4 mg</div>
          </div>
          <div style={{ padding: '1.5rem', border: '2px solid #71a200', borderRadius: '8px', backgroundColor: '#f0fdf4' }}>
            <div style={{ fontSize: '0.875rem', color: '#166534' }}>Appx. Water Saved</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#71a200' }}>0.002 mL</div>
          </div>
          <div style={{ padding: '1.5rem', border: '2px solid #71a200', borderRadius: '8px', backgroundColor: '#f0fdf4' }}>
            <div style={{ fontSize: '0.875rem', color: '#166534' }}>Appx. Electricity Saved</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#71a200' }}>0.01 Wh</div>
          </div>
          
        </div>
        

        <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #598745', marginBottom: '2rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#598745', margin: 0 }}>
            Approximate Immediate Impact
          </p>
        </div>

        <button onClick={onBack} style={{ padding: '0.75rem 2rem', border: 'none', borderRadius: '6px', backgroundColor: '#598745', color: 'white', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', width: '100%' }}>
          Back to Inbox
        </button>
      </div>
    </div>
  );
}

// ===== AUTOMATION MODAL =====
function AutomationModal({ onClose }: any) {
  const [enabled, setEnabled] = useState(false);
  const [schedule, setSchedule] = useState('weekly');
  const [target, setTarget] = useState('ai-recommended');

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Lexend Deca', sans-serif" }}>
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', width: '500px', maxWidth: '90%' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', fontWeight: 'bold' }}>Auto CleanUp Settings</h2>
        
        {/* Enable Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', padding: '1rem', border: '2px solid #e0e0e0', borderRadius: '6px' }}>
          <span style={{ fontWeight: 'bold' }}>Auto Deletion</span>
          <label style={{ position: 'relative', display: 'inline-block', width: '60px', height: '30px' }}>
            <input 
              type="checkbox" 
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: enabled ? '#71A200' : '#ccc', borderRadius: '30px', transition: '0.3s'
            }}>
              <span style={{
                position: 'absolute', content: '', height: '22px', width: '22px', left: enabled ? '34px' : '4px',
                bottom: '4px', backgroundColor: 'white', borderRadius: '50%', transition: '0.3s'
              }} />
            </span>
          </label>
        </div>
        
        {/* Schedule */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Schedule</div>
          <select 
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', border: '2px solid #e0e0e0', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer' }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly (Sunday)</option>
            <option value="monthly">Monthly (1st of month)</option>
          </select>
        </div>

        {/* Info */}
        <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #10b981', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#166534', margin: 0 }}>
            🔒 All analysis happens locally on your device using open-source AI. No data leaves your machine.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '0.75rem', border: '2px solid #e0e0e0', borderRadius: '6px', backgroundColor: 'white', cursor: 'pointer', fontSize: '1rem' }}>
            Cancel
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: '0.75rem', border: 'none', borderRadius: '6px', backgroundColor: '#71A200', color: 'white', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function StatCard({ title, value, color }: any) {
  return (
    <div style={{ padding: '1.5rem', borderRadius: '8px', backgroundColor: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
      <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>{title}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color }}>{value}</div>
    </div>
  );
}

function EmailRow({ email }: any) {
  return (
    <div style={{ padding: '1.5rem', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: email.read ? '#fafafa' : 'white', cursor: 'pointer' }}>
      <input type="checkbox" style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: email.read ? 'normal' : 'bold', marginBottom: '0.25rem' }}>{email.from}</div>
        <div style={{ fontSize: '0.875rem', color: '#666' }}>{email.subject}</div>
      </div>
      <div style={{ fontSize: '0.75rem', color: '#999' }}>2h ago</div>
    </div>
  );
}

export default App;
