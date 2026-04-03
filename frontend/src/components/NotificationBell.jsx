import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/api';

const SEEN_KEY = 'ats_notifications_seen_v1';

function loadSeenMap() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function saveSeenMap(map) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(map));
}

function ageLabel(iso) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'recently';
  const minutes = Math.max(1, Math.floor((Date.now() - ts) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const NotificationBell = () => {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [seenMap, setSeenMap] = useState(loadSeenMap);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [interviewsRes, appsRes] = await Promise.all([
          apiGet('/interviews'),
          apiGet('/applications?limit=35'),
        ]);
        if (!active) return;

        const interviewItems = (interviewsRes.data || []).slice(0, 8).map((row) => ({
          id: `int-${row.id}`,
          title: `Interview ${row.result === 'PENDING' ? 'scheduled' : row.result?.toLowerCase() || 'updated'}`,
          body: `${row.application?.candidate?.fullName || 'Candidate'} - ${row.application?.job?.title || 'Role'}`,
          at: row.updatedAt || row.createdAt || new Date().toISOString(),
          href: '/schedule',
          kind: 'interview',
        }));

        const appItems = (appsRes.data || []).slice(0, 8).map((row) => ({
          id: `app-${row.id}`,
          title: row.shortlisted ? 'Candidate shortlisted' : 'Application updated',
          body: `${row.candidate?.fullName || 'Candidate'} in ${row.currentStage?.name || 'Pipeline'}`,
          at: row.updatedAt || row.createdAt || new Date().toISOString(),
          href: row.candidate?.id ? `/candidate/${row.candidate.id}` : '/pipeline',
          kind: 'application',
        }));

        const merged = [...interviewItems, ...appItems]
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .slice(0, 12);
        setItems(merged);
        setError('');
      } catch (err) {
        if (!active) return;
        setError(err.message || 'Unable to load notifications');
      }
    };

    load();
    const timer = setInterval(load, 45000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onDocClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const unreadCount = useMemo(
    () => items.reduce((acc, item) => acc + (seenMap[item.id] ? 0 : 1), 0),
    [items, seenMap],
  );

  const markRead = (id) => {
    setSeenMap((prev) => {
      const next = { ...prev, [id]: true };
      saveSeenMap(next);
      return next;
    });
  };

  const markAllRead = () => {
    const next = { ...seenMap };
    items.forEach((item) => {
      next[item.id] = true;
    });
    setSeenMap(next);
    saveSeenMap(next);
  };

  return (
    <div className="os-notify-root" ref={rootRef}>
      <button className="os-icon-btn" type="button" onClick={() => setOpen((v) => !v)} aria-label="Notifications">
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 ? <span className="os-notify-badge">{Math.min(9, unreadCount)}</span> : null}
      </button>

      {open ? (
        <div className="os-notify-menu">
          <div className="os-notify-head">
            <div>
              <div className="os-notify-title">Notifications</div>
              <div className="os-notify-sub">{unreadCount} unread</div>
            </div>
            <button className="os-btn-outline !h-8 !px-3" type="button" onClick={markAllRead}>
              Mark all read
            </button>
          </div>

          {error ? <div className="os-notify-empty">{error}</div> : null}

          {!error && items.length === 0 ? <div className="os-notify-empty">No notifications yet.</div> : null}

          {!error ? (
            <div className="os-notify-list">
              {items.map((item) => (
                <Link
                  key={item.id}
                  to={item.href}
                  className={`os-notify-item ${seenMap[item.id] ? 'seen' : ''}`}
                  onClick={() => {
                    markRead(item.id);
                    setOpen(false);
                  }}
                >
                  <div className="os-notify-item-head">
                    <span>{item.title}</span>
                    <span>{ageLabel(item.at)}</span>
                  </div>
                  <div className="os-notify-item-body">{item.body}</div>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default NotificationBell;
