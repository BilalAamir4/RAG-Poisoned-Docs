import React, { useEffect, useState } from 'react'
import { fetchSettings } from '../api.js'

import LineSidebar from './ui/LineSidebar.jsx'

const NAV_ITEMS = [
  {
    id: 'trace',
    label: 'Live trace',
    icon: (
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M3 12h4l2 6 4-14 2 8h6" />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M4 5h16v10H8l-4 4V5z" />
      </svg>
    ),
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: (
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M4 4h11l4 4v12H4V4z" />
        <path d="M15 4v4h4" />
      </svg>
    ),
  },
  {
    id: 'audit',
    label: 'Audit log',
    icon: (
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    id: 'replay',
    label: 'Attack replay',
    icon: (
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M1 4v6h6" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
    ),
  },
  {
    id: 'test-runs',
    label: 'Test suite',
    icon: (
      <svg className="icon" viewBox="0 0 24 24">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg className="icon" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      </svg>
    ),
  },
]

export default function Sidebar({ activeRoute, onNavigate }) {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load real backend settings on mount
  const loadSettings = async () => {
    try {
      setError(null)
      const data = await fetchSettings()
      setSettings(data)
    } catch (err) {
      console.error('Failed to load settings in sidebar:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
    // Poll settings every 8 seconds to stay in sync with background runs/resets
    const timer = setInterval(loadSettings, 8000)
    const handleMitigationChange = () => loadSettings()
    window.addEventListener('mitigation-settings-changed', handleMitigationChange)
    return () => {
      clearInterval(timer)
      window.removeEventListener('mitigation-settings-changed', handleMitigationChange)
    }
  }, [])

  // Calculate whether combined mitigation is active from real backend structure
  const m = settings?.mitigations || settings?.active_mitigations
  const activeCount = m
    ? [m.delimiter, m.sanitization, m.output_filter || m.output_filtering, m.retrieval_score_threshold].filter(Boolean).length
    : 0
  const railState = activeCount === 4 ? 'all' : activeCount === 0 ? 'off' : 'custom'

  return (
    <aside className="sidebar">
      <div className="brand">
        <svg className="icon" viewBox="0 0 24 24">
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
        </svg>
        <span className="label">Sentinel</span>
      </div>

      <LineSidebar
        items={NAV_ITEMS}
        activeRoute={activeRoute}
        onItemClick={(_index, item) => onNavigate(item.id)}
        className="sidebar-line-nav"
        maxShift={0}
      />

      <a
        href="#/demo"
        data-testid="demo-mode-link"
        style={{ display: 'block', margin: '0 14px 10px', padding: '6px 10px', fontSize: '12px', color: 'var(--violet)', textDecoration: 'underline' }}
      >
        Demo mode
      </a>

      <div className="sidebar-foot">
        <span
          className={`rail-dot ${railState}`}
          role="img"
          aria-label={`Defenses: ${activeCount} of 4 on`}
          title={`Defenses: ${activeCount} of 4 on`}
        />
        <div className="lbl">Defenses</div>
        <a
          href="#/settings"
          className="state"
          style={{ textDecoration: 'none' }}
          title={loading ? 'Loading settings...' : error ? `Error: ${error}` : 'Real Settings state. Click to change it in Settings.'}
        >
          {loading ? '...' : error ? 'Offline' : `${activeCount} of 4 on`}
        </a>
      </div>
    </aside>
  )
}
