import { useEffect, useState } from 'react';
import {
  CalendarClock,
  CalendarCheck2,
  CalendarRange,
  Sparkles,
  Timer,
  Eye,
  EyeOff,
  Check,
  Loader2,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Plus,
  Trash2,
  LayoutTemplate,
  Star,
  GraduationCap,
  Sunrise,
  Copy
} from 'lucide-react';
import api from '../../lib/api.js';
import { ROUTINE_CATEGORIES, ROUTINE_DAYS } from '../../lib/routineColors.js';

const ICS_COLORS = ['#5B8CFF', '#4FD1A5', '#F2B84B', '#E56B6B', '#7C4DBE', '#2F5FD1', '#1F8A5F', '#8890A6'];

export default function SettingsPage() {
  // GoogleAccountsSection, CalendarsSection, and ClassroomSection each own
  // their own fetch-on-mount - which means connecting/removing an account in
  // the first one left the other two silently stale until the whole page
  // remounted (e.g. navigating away and back). This counter is a shared
  // "something about the connected accounts changed" signal: bumping it is
  // in each section's effect dependencies, so a connect/remove anywhere
  // reliably triggers a re-fetch everywhere else on the page too.
  const [googleAccountsVersion, setGoogleAccountsVersion] = useState(0);
  const bumpGoogleAccounts = () => setGoogleAccountsVersion((v) => v + 1);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <p className="label-eyebrow mb-1">Configuration</p>
        <h1 className="font-display text-2xl font-semibold text-base-text">Settings</h1>
        <p className="text-sm text-base-muted mt-1 max-w-xl">
          Everything below lives in a local database on this device. API keys and OAuth tokens are encrypted at
          rest and never leave your machine except to talk to the service you're connecting.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 max-w-4xl">
        <CalendarSyncSection />
        <GoogleAccountsSection onAccountsChanged={bumpGoogleAccounts} />
        <CalendarsSection refreshKey={googleAccountsVersion} />
        <ClassroomSection refreshKey={googleAccountsVersion} />
        <GeminiSection />
        <PomodoroSection />
        <BellScheduleSection />
        <DailyRoutineSection />
        <TemplatesSection />
      </div>
    </div>
  );
}

// ---------- Calendar sync (Google Calendar ICS feed) ----------

function CalendarSyncSection() {
  const [sources, setSources] = useState([]);
  const [syncingId, setSyncingId] = useState(null); // a source id, or 'all'
  const [status, setStatus] = useState(null); // { ok, message }
  const [draft, setDraft] = useState({ label: '', url: '', color: ICS_COLORS[0] });

  async function load() {
    setSources(await api.icsListSources());
  }

  useEffect(() => {
    load();
  }, []);

  async function addSource() {
    if (!draft.label.trim() || !draft.url.trim()) {
      setStatus({ ok: false, message: 'Give the calendar a name and a URL.' });
      return;
    }
    const created = await api.icsCreateSource(draft);
    setDraft({ label: '', url: '', color: ICS_COLORS[sources.length % ICS_COLORS.length] });
    await load();
    setStatus(null);
    // Sync it immediately so adding a source feels like it did something.
    await syncOne(created.id);
  }

  async function removeSource(id) {
    if (!confirm('Remove this calendar source? Events already synced from it stay in your deadlines list.')) return;
    await api.icsDeleteSource(id);
    await load();
  }

  async function toggleEnabled(source, enabled) {
    await api.icsUpdateSource({ ...source, enabled });
    await load();
  }

  async function setColor(source, color) {
    await api.icsUpdateSource({ ...source, color });
    await load();
  }

  async function renameSource(source, label) {
    await api.icsUpdateSource({ ...source, label });
  }

  async function syncOne(id) {
    setSyncingId(id);
    setStatus(null);
    try {
      // ics:syncSource never throws for a bad/unreachable calendar - it
      // persists the failure onto the source row instead (rendered inline
      // below), so a single flaky calendar doesn't need a toast of its own.
      await api.icsSyncSource(id);
      await load();
    } catch (e) {
      // Only genuinely unexpected failures (e.g. the IPC call itself) land here.
      setStatus({ ok: false, message: e?.message || 'Could not sync that calendar.' });
    } finally {
      setSyncingId(null);
    }
  }

  async function syncAll() {
    setSyncingId('all');
    setStatus(null);
    try {
      const result = await api.icsSyncAll();
      await load();
      const failed = result.errors?.length || 0;
      setStatus({
        ok: failed === 0,
        message: `Imported ${result.imported} event${result.imported === 1 ? '' : 's'}${
          failed ? ` — ${failed} calendar${failed === 1 ? '' : 's'} failed to sync` : ''
        }.`
      });
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <Section
      icon={<CalendarClock size={15} />}
      title="Calendar sync (ICS)"
      description="Subscribe to any number of ICS calendar feeds - per-class calendars, school-wide events, a rotating day schedule, PowerSchool, whatever your school publishes. Each syncs independently into your deadlines, with its own color, so they show up separately on the unified Calendar."
    >
      {sources.length > 0 && (
        <ul className="space-y-2">
          {sources.map((s) => (
            <li key={s.id} className="space-y-1.5 px-3 py-2 rounded-lg bg-base-card border border-base-border">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(s.enabled)}
                  onChange={(e) => toggleEnabled(s, e.target.checked)}
                  className="accent-accent shrink-0"
                  title="Include on the unified Calendar"
                />
                <input
                  type="color"
                  value={s.color || '#5B8CFF'}
                  onChange={(e) => setColor(s, e.target.value)}
                  title="Calendar color"
                  className="w-5 h-5 rounded border border-base-border bg-transparent shrink-0"
                />
                <input
                  defaultValue={s.label}
                  onBlur={(e) => renameSource(s, e.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-xs font-medium text-base-text focus:outline-none"
                />
                <button
                  onClick={() => syncOne(s.id)}
                  disabled={syncingId !== null}
                  className="shrink-0 flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50"
                >
                  {syncingId === s.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Sync
                </button>
                <button onClick={() => removeSource(s.id)} className="shrink-0 text-base-muted hover:text-accent-danger">
                  <Trash2 size={12} />
                </button>
              </div>
              {s.last_sync_status === 'error' ? (
                <p className="text-xs text-accent-danger pl-8">{s.last_sync_error || "This calendar didn't sync."}</p>
              ) : (
                <p className="text-xs text-base-muted truncate pl-8">
                  {s.last_synced_at ? `Last synced ${new Date(s.last_synced_at).toLocaleString()}` : 'Not synced yet'}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-base-border">
        <Field label="Name" value={draft.label} onChange={(v) => setDraft((d) => ({ ...d, label: v }))} placeholder="e.g. English, School events" />
        <label className="block">
          <span className="block text-xs font-medium text-base-muted mb-1">Color</span>
          <input
            type="color"
            value={draft.color}
            onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
            className="w-full h-9 rounded-lg border border-base-border bg-base-card"
          />
        </label>
        <label className="block col-span-2">
          <span className="block text-xs font-medium text-base-muted mb-1">ICS URL</span>
          <input
            value={draft.url}
            onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
            placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics"
            className="w-full bg-base-card border border-base-border rounded-lg px-3 py-2 text-xs text-base-text focus:outline-none focus:border-accent"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <SecondaryButton onClick={addSource} icon={<Plus size={13} />} label="Add calendar" />
        {sources.length > 1 && (
          <SecondaryButton onClick={syncAll} loading={syncingId === 'all'} icon={<RefreshCw size={13} />} label="Sync all" />
        )}
      </div>

      <StatusLine status={status} />
    </Section>
  );
}

// ---------- Google accounts (shared OAuth app; Calendar + Classroom scopes) ----------

function GoogleAccountsSection({ onAccountsChanged }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [newLabel, setNewLabel] = useState('Personal');
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState(null);
  const [authUrl, setAuthUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  async function loadAccounts() {
    setAccounts(await api.googleListAccounts());
  }

  useEffect(() => {
    (async () => {
      setClientId((await api.getSetting('google_client_id')) || '');
      setClientSecret((await api.getSetting('google_client_secret', true)) || '');
      await loadAccounts();
    })();
  }, []);

  // The main process pushes the consent URL as soon as it's built, well
  // before googleConnect() resolves - shown below as a copyable fallback in
  // case auto-launching the OS default browser opens the wrong one.
  useEffect(() => {
    const off = api.onGoogleAuthUrl?.(({ authUrl: url }) => setAuthUrl(url));
    return () => off?.();
  }, []);

  async function handleConnect(calendarOnly = false) {
    if (!clientId || !clientSecret) {
      setStatus({ ok: false, message: 'Add your Client ID and Client Secret first.' });
      return;
    }
    setConnecting(true);
    setStatus(null);
    setAuthUrl(null);
    setCopied(false);
    try {
      await api.setSetting('google_client_id', clientId);
      await api.setSetting('google_client_secret', clientSecret, true);
      setStatus({
        ok: true,
        message: `Opened the Google consent screen for "${newLabel || 'this account'}" (${
          calendarOnly ? 'Calendar only' : 'Calendar + Classroom'
        }) in your browser - finish signing in there.`
      });
      const account = await api.googleConnect(newLabel || 'Google account', calendarOnly);
      await loadAccounts();
      onAccountsChanged?.();
      setStatus({ ok: true, message: `Connected ${account.email || account.label}. Now pick its calendars/courses below.` });
    } catch (e) {
      setStatus({ ok: false, message: e?.message || 'Could not connect that Google account.' });
    } finally {
      setConnecting(false);
      setAuthUrl(null);
    }
  }

  function copyAuthUrl() {
    navigator.clipboard.writeText(authUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleRemove(id) {
    if (!confirm('Disconnect this Google account? Its calendars and Classroom courses will stop syncing.')) return;
    await api.googleRemoveAccount(id);
    await loadAccounts();
    onAccountsChanged?.();
  }

  return (
    <Section
      icon={<CalendarCheck2 size={15} />}
      title="Google accounts"
      description="Connect your personal Google account and your school account separately - most students have both, and a school calendar is often just a secondary calendar on one of them. Uses your own free Google Cloud project credentials (Desktop app type), and requests Calendar + Classroom access together so one connect covers both."
    >
      <Field label="Client ID" value={clientId} onChange={setClientId} placeholder="xxxx.apps.googleusercontent.com" />
      <PasswordField label="Client secret" value={clientSecret} onChange={setClientSecret} />

      {accounts.length > 0 && (
        <ul className="space-y-2 pt-1">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-base-card border border-base-border text-xs"
            >
              <div className="min-w-0 flex items-center gap-2">
                <ShieldCheck size={12} className="text-accent-good shrink-0" />
                <div className="min-w-0">
                  <p className="text-base-text font-medium truncate flex items-center gap-2">
                    {a.label}
                    {a.scope === 'calendar_only' && (
                      <span className="text-xs font-normal px-2 py-1 rounded-full bg-base-panel text-base-muted border border-base-border">
                        Calendar only
                      </span>
                    )}
                  </p>
                  {a.email && <p className="text-xs text-base-muted truncate">{a.email}</p>}
                </div>
              </div>
              <button onClick={() => handleRemove(a.id)} className="shrink-0 text-base-muted hover:text-accent-danger">
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-2 border-t border-base-border space-y-2">
        <Field
          label="Nickname for the account you're about to connect"
          value={newLabel}
          onChange={setNewLabel}
          placeholder="Personal or School"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <SecondaryButton
            onClick={() => handleConnect(false)}
            loading={connecting}
            icon={<ExternalLink size={13} />}
            label={connecting ? 'Waiting for Google sign-in…' : 'Connect a Google account'}
          />
          <SecondaryButton
            onClick={() => handleConnect(true)}
            loading={connecting}
            icon={<CalendarCheck2 size={13} />}
            label="Connect (Calendar only)"
          />
        </div>
        <p className="text-xs text-base-muted">
          If your school blocks the Classroom scopes for this app (common with Workspace admin restrictions), try
          "Calendar only" - it requests just Calendar access, which is sometimes allowed even when Classroom isn't.
        </p>

        {connecting && authUrl && (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-base-muted">
              Auto-opened your default browser. If that's the wrong one, copy this link into whichever
              browser/profile you want signed in with instead:
            </p>
            <div className="flex items-center gap-2 bg-base-card border border-base-border rounded-lg px-3 py-2">
              <input
                readOnly
                value={authUrl}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 bg-transparent text-xs text-base-text focus:outline-none"
              />
              <button
                onClick={copyAuthUrl}
                className="shrink-0 flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </div>
        )}
      </div>

      <StatusLine status={status} />
    </Section>
  );
}

// ---------- Calendars (which of each connected account's calendars sync in) ----------

function CalendarsSection({ refreshKey }) {
  const [accounts, setAccounts] = useState([]);
  const [byAccount, setByAccount] = useState({});
  const [loadingAccountId, setLoadingAccountId] = useState(null);
  const [status, setStatus] = useState(null);

  async function loadAll() {
    const accs = await api.googleListAccounts();
    setAccounts(accs);
    const rows = await api.googleGetCalendarSettings();
    const grouped = {};
    for (const row of rows) (grouped[row.account_id] ||= []).push(row);
    setByAccount(grouped);
  }

  // Re-fetches whenever an account is connected/removed elsewhere on the
  // page (see SettingsPage's googleAccountsVersion), not just on mount.
  useEffect(() => {
    loadAll();
  }, [refreshKey]);

  async function refreshForAccount(accountId) {
    setLoadingAccountId(accountId);
    setStatus(null);
    try {
      await api.googleListCalendars(accountId);
      await loadAll();
    } catch (e) {
      setStatus({ ok: false, message: e?.message || 'Could not fetch calendars for that account.' });
    } finally {
      setLoadingAccountId(null);
    }
  }

  async function toggle(row, enabled) {
    await api.googleSetCalendarEnabled(row.id, enabled, row.color);
    await loadAll();
  }

  async function setColor(row, color) {
    await api.googleSetCalendarEnabled(row.id, Boolean(row.enabled), color);
    await loadAll();
  }

  async function setDefault(row) {
    await api.googleSetDefaultPushCalendar(row.id);
    await loadAll();
  }

  return (
    <Section
      icon={<CalendarRange size={15} />}
      title="Calendars"
      description="Pick which calendars from each connected account show up in your unified calendar, and give each one a color. Star one as the default calendar new StudentOS items push to."
    >
      {accounts.length === 0 ? (
        <p className="text-xs text-base-muted">Connect a Google account above first.</p>
      ) : (
        accounts.map((acc) => (
          <div key={acc.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-base-text">
                {acc.label}
                {acc.email ? ` · ${acc.email}` : ''}
              </p>
              <button
                onClick={() => refreshForAccount(acc.id)}
                disabled={loadingAccountId === acc.id}
                className="flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50"
              >
                {loadingAccountId === acc.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Refresh
              </button>
            </div>
            {(byAccount[acc.id] || []).length === 0 ? (
              <p className="text-xs text-base-muted">No calendars loaded yet — click Refresh.</p>
            ) : (
              <ul className="space-y-1">
                {byAccount[acc.id].map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-base-card border border-base-border text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(row.enabled)}
                      onChange={(e) => toggle(row, e.target.checked)}
                      className="accent-accent shrink-0"
                    />
                    <input
                      type="color"
                      value={row.color || '#5B8CFF'}
                      onChange={(e) => setColor(row, e.target.value)}
                      title="Calendar color"
                      className="w-5 h-5 rounded border border-base-border bg-transparent shrink-0"
                    />
                    <span className="flex-1 truncate text-base-text">{row.summary}</span>
                    <button
                      onClick={() => setDefault(row)}
                      title="Push new StudentOS events here by default"
                      className={`shrink-0 ${row.is_default_push ? 'text-accent-warn' : 'text-base-muted hover:text-accent-warn'}`}
                    >
                      <Star size={12} fill={row.is_default_push ? 'currentColor' : 'none'} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}
      <StatusLine status={status} />
    </Section>
  );
}

// ---------- Classroom (auto-homework + reminders) ----------

function ClassroomSection({ refreshKey }) {
  const [accounts, setAccounts] = useState([]);
  const [byAccount, setByAccount] = useState({});
  const [refreshedAccountIds, setRefreshedAccountIds] = useState(() => new Set());
  const [loadingAccountId, setLoadingAccountId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [offsets, setOffsets] = useState('72,24,0');
  const [savingOffsets, setSavingOffsets] = useState(false);
  const [status, setStatus] = useState(null);

  async function loadAll() {
    const accs = await api.googleListAccounts();
    setAccounts(accs);
    const rows = await api.googleGetClassroomSettings();
    const grouped = {};
    for (const row of rows) (grouped[row.account_id] ||= []).push(row);
    setByAccount(grouped);
  }

  // Re-fetches whenever an account is connected/removed elsewhere on the
  // page (see SettingsPage's googleAccountsVersion), not just on mount -
  // otherwise this kept showing "connect an account" even after one was
  // already connected in the section above, just because it never re-checked.
  useEffect(() => {
    loadAll();
    api.getSetting('classroom_reminder_offsets_hours').then((v) => setOffsets(v || '72,24,0'));
  }, [refreshKey]);

  async function refreshForAccount(accountId) {
    setLoadingAccountId(accountId);
    setStatus(null);
    try {
      await api.googleListClassroomCourses(accountId);
      await loadAll();
      setRefreshedAccountIds((s) => new Set(s).add(accountId));
    } catch (e) {
      setStatus({ ok: false, message: e?.message || 'Could not fetch Classroom courses for that account.' });
    } finally {
      setLoadingAccountId(null);
    }
  }

  async function toggle(row, enabled) {
    await api.googleSetClassroomCourseEnabled(row.id, enabled);
    await loadAll();
  }

  async function saveOffsets() {
    setSavingOffsets(true);
    try {
      await api.setSetting('classroom_reminder_offsets_hours', offsets);
      setStatus({ ok: true, message: 'Reminder times saved.' });
    } finally {
      setSavingOffsets(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setStatus(null);
    try {
      const result = await api.googleSyncClassroomNow();
      setStatus({ ok: true, message: `Imported ${result.imported} assignment${result.imported === 1 ? '' : 's'} as homework.` });
    } catch (e) {
      setStatus({ ok: false, message: e?.message || 'Sync failed.' });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Section
      icon={<GraduationCap size={15} />}
      title="Classroom"
      description="New assignments in an enabled course auto-create a homework entry, tagged with the class and due date, with reminders at the offsets below (also synced automatically every 10 minutes while the app is open)."
    >
      {accounts.length === 0 ? (
        <p className="text-xs text-base-muted">Connect a Google account above first (your school account, if that's where Classroom lives).</p>
      ) : (
        accounts.map((acc) => (
          <div key={acc.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-base-text">
                {acc.label}
                {acc.email ? ` · ${acc.email}` : ''}
              </p>
              {acc.scope !== 'calendar_only' && (
                <button
                  onClick={() => refreshForAccount(acc.id)}
                  disabled={loadingAccountId === acc.id}
                  className="flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50"
                >
                  {loadingAccountId === acc.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Refresh courses
                </button>
              )}
            </div>
            {acc.scope === 'calendar_only' ? (
              <p className="text-xs text-base-muted">
                Connected with Calendar-only access — no Classroom permission to check for courses.
              </p>
            ) : (byAccount[acc.id] || []).length === 0 ? (
              <p className="text-xs text-base-muted">
                {refreshedAccountIds.has(acc.id)
                  ? `No Classroom courses found on ${acc.label} — if Classroom lives on a different account, connect and refresh that one instead.`
                  : 'No courses loaded yet — click Refresh.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {byAccount[acc.id].map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-base-card border border-base-border text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(row.enabled)}
                      onChange={(e) => toggle(row, e.target.checked)}
                      className="accent-accent shrink-0"
                    />
                    <span className="flex-1 truncate text-base-text">{row.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}

      <div className="pt-2 border-t border-base-border space-y-2">
        <Field label="Reminder offsets, hours before due (comma-separated)" value={offsets} onChange={setOffsets} placeholder="72,24,0" />
        <div className="flex items-center gap-2">
          <PrimaryButton onClick={saveOffsets} loading={savingOffsets} label="Save reminder times" />
          <SecondaryButton onClick={syncNow} loading={syncing} icon={<RefreshCw size={13} />} label="Sync Classroom now" />
        </div>
      </div>

      <StatusLine status={status} />
    </Section>
  );
}

// ---------- Gemini ----------

function GeminiSection() {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.getSetting('gemini_api_key', true).then((v) => setApiKey(v || ''));
  }, []);

  async function handleSaveAndTest() {
    if (!apiKey) {
      setStatus({ ok: false, message: 'Paste a Gemini API key first.' });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await api.setSetting('gemini_api_key', apiKey, true);
      setSaving(false);
      setTesting(true);
      await api.testGeminiKey();
      setStatus({ ok: true, message: 'Key saved and working.' });
    } catch (e) {
      setStatus({ ok: false, message: e?.message || 'That key did not work.' });
    } finally {
      setSaving(false);
      setTesting(false);
    }
  }

  return (
    <Section
      icon={<Sparkles size={15} />}
      title="Gemini study engine"
      description="Your own Gemini API key, used only when you press Study Guide or Practice Exam on notes you've selected. Never touches your calendar data or runs on its own."
    >
      <PasswordField label="Gemini API key" value={apiKey} onChange={setApiKey} placeholder="AIza…" />
      <div className="flex items-center gap-2 pt-1">
        <PrimaryButton onClick={handleSaveAndTest} loading={saving || testing} label={testing ? 'Testing…' : 'Save & test'} />
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            api.openExternal('https://aistudio.google.com/app/apikey');
          }}
          className="text-xs text-base-muted hover:text-accent flex items-center gap-1"
        >
          <ExternalLink size={11} /> Get a free key
        </a>
      </div>
      <StatusLine status={status} />
    </Section>
  );
}

// ---------- Pomodoro ----------

function PomodoroSection() {
  const [workMin, setWorkMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    (async () => {
      setWorkMin(Number((await api.getSetting('pomodoro_work_min')) || 25));
      setBreakMin(Number((await api.getSetting('pomodoro_break_min')) || 5));
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.setSetting('pomodoro_work_min', String(workMin));
      await api.setSetting('pomodoro_break_min', String(breakMin));
      setStatus({ ok: true, message: 'Saved — takes effect the next time you open Student OS.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      icon={<Timer size={15} />}
      title="Pomodoro defaults"
      description="Sets the work/break lengths for the timer in the top bar."
    >
      <div className="flex items-center gap-3">
        <NumberField label="Focus (min)" value={workMin} onChange={setWorkMin} min={5} max={90} />
        <NumberField label="Break (min)" value={breakMin} onChange={setBreakMin} min={1} max={30} />
      </div>
      <div className="pt-1">
        <PrimaryButton onClick={handleSave} loading={saving} label="Save" />
      </div>
      <StatusLine status={status} />
    </Section>
  );
}

// ---------- Bell schedule (A/B rotation) ----------

function BellScheduleSection() {
  const [periods, setPeriods] = useState([]);
  const [classes, setClasses] = useState([]);
  const [knownCodes, setKnownCodes] = useState([]);
  const [status, setStatus] = useState(null);
  const [draft, setDraft] = useState({
    day_type: '',
    name: '',
    start_time: '08:00',
    end_time: '08:50',
    class_id: '',
    room: '',
    teacher: ''
  });

  async function load() {
    setPeriods(await api.getBellPeriods());
    setClasses(await api.getClasses());
    setKnownCodes(await api.getKnownDayCodes());
  }

  useEffect(() => {
    load();
  }, []);

  async function addPeriod() {
    if (!draft.name || !draft.start_time || !draft.end_time) {
      setStatus({ ok: false, message: 'Give the period a name and both times.' });
      return;
    }
    await api.createBellPeriod({
      ...draft,
      day_type: draft.day_type.trim() || 'both',
      class_id: draft.class_id || null,
      sort_order: periods.length
    });
    setDraft({ day_type: draft.day_type, name: '', start_time: '08:00', end_time: '08:50', class_id: '', room: '', teacher: '' });
    await load();
  }

  async function removePeriod(id) {
    await api.deleteBellPeriod(id);
    await load();
  }

  async function updatePeriodTime(period, field, value) {
    const updated = { ...period, [field]: value };
    setPeriods((ps) => ps.map((p) => (p.id === period.id ? updated : p)));
    await api.updateBellPeriod(updated);
  }

  return (
    <Section
      icon={<CalendarRange size={15} />}
      title="Bell schedule / Class schedule"
      description="Tag each period with any day code your school uses (1A, 2B, Day 3 - whatever you actually use), or leave it blank for a period that happens every school day. Click a time to edit it - the times below are placeholders until you set the real ones. Each morning you'll pick which day code today is, right on the Dashboard (skip that if your schedule doesn't rotate)."
    >
      {periods.length > 0 && (
        <ul className="space-y-2">
          {periods.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-base-card border border-base-border text-xs"
            >
              <span className="w-10 shrink-0 text-center text-xs font-mono px-2 py-1 rounded bg-base-panel text-base-muted">
                {p.day_type === 'both' ? 'ALL' : p.day_type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base-text font-medium truncate">{p.name}</p>
                {(p.room || p.teacher) && (
                  <p className="text-xs text-base-muted truncate">
                    {p.room && `Room ${p.room}`} {p.room && p.teacher && '·'} {p.teacher}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="time"
                  value={p.start_time}
                  onChange={(e) => updatePeriodTime(p, 'start_time', e.target.value)}
                  className="bg-base-panel border border-base-border rounded px-1 py-1 text-xs font-mono text-base-text focus:outline-none focus:border-accent w-[88px]"
                />
                <span className="text-base-muted">–</span>
                <input
                  type="time"
                  value={p.end_time}
                  onChange={(e) => updatePeriodTime(p, 'end_time', e.target.value)}
                  className="bg-base-panel border border-base-border rounded px-1 py-1 text-xs font-mono text-base-text focus:outline-none focus:border-accent w-[88px]"
                />
              </div>
              <button onClick={() => removePeriod(p.id)} className="shrink-0 text-base-muted hover:text-accent-danger">
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-base-border">
        <Field
          label="Period / class name"
          value={draft.name}
          onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
          placeholder="AP Biology"
        />
        <label className="block">
          <span className="block text-xs font-medium text-base-muted mb-1">Day code</span>
          <input
            list="day-codes"
            value={draft.day_type}
            onChange={(e) => setDraft((d) => ({ ...d, day_type: e.target.value }))}
            placeholder="1A, 2B… or blank for every day"
            className="w-full bg-base-card border border-base-border rounded-lg px-3 py-2 text-xs text-base-text focus:outline-none focus:border-accent"
          />
          <datalist id="day-codes">
            {knownCodes.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-base-muted mb-1">Starts</span>
          <input
            type="time"
            value={draft.start_time}
            onChange={(e) => setDraft((d) => ({ ...d, start_time: e.target.value }))}
            className="w-full bg-base-card border border-base-border rounded-lg px-3 py-2 text-xs text-base-text focus:outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-base-muted mb-1">Ends</span>
          <input
            type="time"
            value={draft.end_time}
            onChange={(e) => setDraft((d) => ({ ...d, end_time: e.target.value }))}
            className="w-full bg-base-card border border-base-border rounded-lg px-3 py-2 text-xs text-base-text focus:outline-none focus:border-accent"
          />
        </label>
        <Field label="Room" value={draft.room} onChange={(v) => setDraft((d) => ({ ...d, room: v }))} placeholder="Room 214" />
        <Field
          label="Teacher"
          value={draft.teacher}
          onChange={(v) => setDraft((d) => ({ ...d, teacher: v }))}
          placeholder="Ms. Alvarez"
        />
        {classes.length > 0 && (
          <label className="block col-span-2">
            <span className="block text-xs font-medium text-base-muted mb-1">Link to a class (optional)</span>
            <select
              value={draft.class_id}
              onChange={(e) => setDraft((d) => ({ ...d, class_id: e.target.value }))}
              className="w-full bg-base-card border border-base-border rounded-lg px-3 py-2 text-xs text-base-text focus:outline-none focus:border-accent"
            >
              <option value="">No class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <SecondaryButton onClick={addPeriod} icon={<Plus size={13} />} label="Add period" />

      <StatusLine status={status} />
    </Section>
  );
}

// ---------- Daily routine (personal, local-only recurring schedule) ----------

function DailyRoutineSection() {
  const [blocks, setBlocks] = useState([]);
  const [activeDay, setActiveDay] = useState('monday');
  const [draft, setDraft] = useState({ title: '', category: 'flex', start_time: '18:00', end_time: '19:00' });

  async function load() {
    setBlocks(await api.getRoutineBlocks());
  }

  useEffect(() => {
    load();
  }, []);

  const dayBlocks = blocks.filter((b) => b.day_type === activeDay).sort((a, b) => a.start_time.localeCompare(b.start_time));

  async function updateBlock(block, patch) {
    const updated = { ...block, ...patch };
    setBlocks((bs) => bs.map((b) => (b.id === block.id ? updated : b)));
    await api.updateRoutineBlock(updated);
  }

  async function removeBlock(id) {
    await api.deleteRoutineBlock(id);
    await load();
  }

  async function addBlock() {
    if (!draft.title.trim()) return;
    await api.createRoutineBlock({ ...draft, day_type: activeDay, sort_order: dayBlocks.length });
    setDraft({ title: '', category: 'flex', start_time: '18:00', end_time: '19:00' });
    await load();
  }

  return (
    <Section
      icon={<Sunrise size={15} />}
      title="Daily routine"
      description="Your personal schedule - wake time, gym, study blocks, wind-down, sleep. Purely local (never touches Google Calendar), and shows on the Calendar view in its own color so it reads as 'personal routine' at a glance. Weekday and weekend variants, edited separately below."
    >
      <div className="flex items-center gap-1 flex-wrap">
        {ROUTINE_DAYS.map((d) => (
          <button
            key={d.value}
            onClick={() => setActiveDay(d.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              activeDay === d.value ? 'border-accent text-accent bg-accent/10' : 'border-base-border text-base-muted hover:text-base-text'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {dayBlocks.length > 0 ? (
        <ul className="space-y-2">
          {dayBlocks.map((b) => (
            <li key={b.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-base-card border border-base-border text-xs">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: ROUTINE_CATEGORIES.find((c) => c.value === b.category)?.color || '#7C4DBE' }}
              />
              <input
                value={b.title}
                onChange={(e) => updateBlock(b, { title: e.target.value })}
                className="flex-1 min-w-0 bg-transparent text-base-text focus:outline-none"
              />
              <select
                value={b.category}
                onChange={(e) => updateBlock(b, { category: e.target.value })}
                className="bg-base-panel border border-base-border rounded px-1 py-1 text-xs text-base-text focus:outline-none shrink-0"
              >
                {ROUTINE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={b.start_time}
                onChange={(e) => updateBlock(b, { start_time: e.target.value })}
                className="bg-base-panel border border-base-border rounded px-1 py-1 text-xs font-mono text-base-text focus:outline-none w-[88px] shrink-0"
              />
              <span className="text-base-muted shrink-0">–</span>
              <input
                type="time"
                value={b.end_time}
                onChange={(e) => updateBlock(b, { end_time: e.target.value })}
                className="bg-base-panel border border-base-border rounded px-1 py-1 text-xs font-mono text-base-text focus:outline-none w-[88px] shrink-0"
              />
              <button onClick={() => removeBlock(b.id)} className="shrink-0 text-base-muted hover:text-accent-danger">
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-base-muted">Nothing for {ROUTINE_DAYS.find((d) => d.value === activeDay)?.label} yet.</p>
      )}

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-base-border">
        <Field label="Block title" value={draft.title} onChange={(v) => setDraft((d) => ({ ...d, title: v }))} placeholder="e.g. Piano practice" />
        <label className="block">
          <span className="block text-xs font-medium text-base-muted mb-1">Category</span>
          <select
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
            className="w-full bg-base-card border border-base-border rounded-lg px-3 py-2 text-xs text-base-text focus:outline-none focus:border-accent"
          >
            {ROUTINE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-base-muted mb-1">Starts</span>
          <input
            type="time"
            value={draft.start_time}
            onChange={(e) => setDraft((d) => ({ ...d, start_time: e.target.value }))}
            className="w-full bg-base-card border border-base-border rounded-lg px-3 py-2 text-xs text-base-text focus:outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-base-muted mb-1">Ends</span>
          <input
            type="time"
            value={draft.end_time}
            onChange={(e) => setDraft((d) => ({ ...d, end_time: e.target.value }))}
            className="w-full bg-base-card border border-base-border rounded-lg px-3 py-2 text-xs text-base-text focus:outline-none focus:border-accent"
          />
        </label>
      </div>
      <SecondaryButton onClick={addBlock} icon={<Plus size={13} />} label={`Add block to ${ROUTINE_DAYS.find((d) => d.value === activeDay)?.label}`} />
    </Section>
  );
}

// ---------- Note templates ----------

function TemplatesSection() {
  const [templates, setTemplates] = useState([]);

  async function load() {
    setTemplates(await api.getNoteTemplates());
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id) {
    await api.deleteNoteTemplate(id);
    await load();
  }

  return (
    <Section
      icon={<LayoutTemplate size={15} />}
      title="Note templates"
      description="Made from any note via the template icon in its editor. Pick one from 'New from template' in the Notes sidebar."
    >
      {templates.length === 0 ? (
        <p className="text-xs text-base-muted">
          No templates saved yet — open a note, format it the way you like, then click the template icon.
        </p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-base-card border border-base-border text-xs">
              <span className="text-base-text truncate">{t.name}</span>
              <button onClick={() => remove(t.id)} className="shrink-0 text-base-muted hover:text-accent-danger">
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Section({ icon, title, description, children, badge }) {
  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
            {icon}
          </span>
          <h2 className="font-display text-sm font-semibold text-base-text">{title}</h2>
        </div>
        {badge}
      </div>
      {description && <p className="text-xs text-base-muted -mt-1">{description}</p>}
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, disabled }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-base-muted mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-base-card border border-base-border rounded-lg px-3 py-2 text-xs text-base-text focus:outline-none focus:border-accent disabled:opacity-50"
      />
    </label>
  );
}

function PasswordField({ label, value, onChange, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="block text-xs font-medium text-base-muted mb-1">{label}</span>
      <div className="flex items-center gap-1 bg-base-card border border-base-border rounded-lg px-3 py-2 focus-within:border-accent">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-xs text-base-text focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="shrink-0 text-base-muted hover:text-base-text"
          tabIndex={-1}
        >
          {visible ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
    </label>
  );
}

function NumberField({ label, value, onChange, min, max }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-base-muted mb-1">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 bg-base-card border border-base-border rounded-lg px-3 py-2 text-xs text-base-text text-center focus:outline-none focus:border-accent"
      />
    </label>
  );
}

function PrimaryButton({ onClick, label, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent-soft disabled:opacity-50"
    >
      {loading && <Loader2 size={12} className="animate-spin" />} {label}
    </button>
  );
}

function SecondaryButton({ onClick, label, loading, icon }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-50"
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : icon} {label}
    </button>
  );
}

function StatusLine({ status }) {
  if (!status) return null;
  return (
    <p className={`text-xs flex items-center gap-2 ${status.ok ? 'text-accent-good' : 'text-accent-danger'}`}>
      {status.ok && <Check size={11} />} {status.message}
    </p>
  );
}
