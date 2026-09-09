import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, LogOut, Settings, CircleHelp, Moon, ChevronRight, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

export default function PortalLayout({ title, subtitle, navItems }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Purely a UI show/hide toggle for the sidebar — doesn't touch any nav
  // items, routes, or page content. Defaults open (current behavior).
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Profile dropdown (avatar + name in the header, top right).
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  // Which of the three profile-menu modals is open: "settings" | "help" |
  // "display" | null.
  const [activeModal, setActiveModal] = useState(null);

  // Header title follows whichever nav item matches the current URL — exact
  // match for "end" items (e.g. the root /admin Dashboard), prefix match for
  // the rest, picking the longest (most specific) match so a sub-page like
  // /admin/patients doesn't accidentally match a shorter unrelated prefix.
  const currentNavItem = [...navItems]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)));
  const pageTitle = currentNavItem?.label ?? "Dashboard";

  function handleLogout() {
    // Navigate first, then clear the session on the *next* tick (setTimeout
    // 0) instead of immediately after — this used to matter more when a
    // logged-out admin was sent to a separate /admin/login page, but
    // ProtectedRoute now redirects to "/" either way, so this is just
    // extra insurance against any leftover redirect flicker.
    navigate("/", { replace: true });
    setTimeout(() => logout(), 0);
  }

  // "Display & accessibility" toggles — genuinely functional, app-wide, and
  // persisted so they survive a refresh/re-login.
  const [largerText, setLargerText] = useState(() => localStorage.getItem("cds_larger_text") === "1");
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem("cds_reduce_motion") === "1");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("cds_dark_mode") === "1");

  useEffect(() => {
    document.documentElement.style.fontSize = largerText ? "112.5%" : "";
    localStorage.setItem("cds_larger_text", largerText ? "1" : "0");
  }, [largerText]);

  useEffect(() => {
    document.documentElement.classList.toggle("cds-reduce-motion", reduceMotion);
    localStorage.setItem("cds_reduce_motion", reduceMotion ? "1" : "0");
  }, [reduceMotion]);

  useEffect(() => {
    localStorage.setItem("cds_dark_mode", darkMode ? "1" : "0");
  }, [darkMode]);

  return (
    <div
      className={`h-screen flex bg-cream-100 overflow-hidden print:h-auto print:block print:overflow-visible ${
        darkMode ? "dark" : ""
      }`}
    >
      {/* Sidebar — h-screen + overflow-hidden on the outer wrapper (instead of
          min-h-screen) pins this to the viewport so it stays put while only
          <main> below scrolls. overflow-y-auto here too, just in case the nav
          list itself ever grows taller than the screen. Hidden entirely when
          printing — only the page content (e.g. the report) should print.
          When collapsed (sidebarOpen = false), width animates to 0 instead of
          unmounting — same nav items/content, just visually tucked away. */}
      <aside
        className={`shrink-0 bg-cream-50 border-cream-200 flex flex-col overflow-hidden print:hidden transition-all duration-200 ${
          sidebarOpen ? "w-64 border-r" : "w-0 border-r-0"
        }`}
      >
        <div className="w-64 h-full flex flex-col overflow-y-auto">
          <div className="flex items-center gap-3 px-6 py-6">
            <div className="w-9 h-9 rounded-full bg-brand-900 flex items-center justify-center overflow-hidden shrink-0">
              <img src="/logo.png" alt="City Dental Section logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="font-display font-semibold text-forest-900 leading-tight">{title}</p>
              <p className="text-xs text-forest-700">{subtitle}</p>
            </div>
          </div>
          <nav className="flex-1 px-3 space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                    isActive
                      ? "bg-brand-900 text-brand-50 rounded-full"
                      : "text-forest-950 hover:bg-cream-200 rounded-xl"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base transition-colors duration-150 ${
                        isActive ? "bg-leaf-300 text-brand-900" : "bg-cream-200 text-forest-900 group-hover:bg-cream-50"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="flex-1 leading-tight">{item.label}</span>
                    <span className={`text-lg leading-none ${isActive ? "text-brand-50" : "text-forest-600"}`}>
                      ›
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 print:block print:w-full">
        <header className="flex items-center justify-between px-8 py-5 bg-brand-900 print:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="w-9 h-9 rounded-full bg-brand-800 text-brand-50 flex items-center justify-center shrink-0"
              title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            <h1 className="text-xl font-display font-bold text-brand-50">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-4">
            <button className="w-9 h-9 rounded-full bg-brand-800 text-brand-50 flex items-center justify-center">🔔</button>
            <button className="w-9 h-9 rounded-full bg-brand-800 text-brand-50 flex items-center justify-center">⚙</button>
            {/* Profile dropdown — click the avatar/name to open a card with
                the admin's profile row (bordered, like the reference) and
                the single Log out action for the whole portal. */}
            <div className="relative">
              <button
                onClick={() => setProfileMenuOpen((v) => !v)}
                className="flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-full bg-leaf-300 text-brand-900 flex items-center justify-center text-sm font-semibold">
                  {user?.name?.[0] ?? "?"}
                </div>
                <span className="text-sm font-medium text-brand-50">{user?.name}</span>
              </button>

              {profileMenuOpen && (
                <>
                  {/* Invisible click-outside-to-close overlay */}
                  <div className="fixed inset-0 z-10" onClick={() => setProfileMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-72 bg-cream-50 rounded-2xl shadow-[0_8px_24px_rgba(37,53,34,0.25)] z-20 p-3">
                    <div className="flex items-center gap-3 border-2 border-leaf-300 rounded-xl px-3 py-2.5">
                      <div className="w-9 h-9 rounded-full bg-leaf-300 text-brand-900 flex items-center justify-center text-sm font-semibold shrink-0">
                        {user?.name?.[0] ?? "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-forest-950 truncate">{user?.name}</p>
                        {user?.email && <p className="text-xs text-forest-600 truncate">{user.email}</p>}
                      </div>
                    </div>

                    <div className="mt-2 space-y-1">
                      {[
                        { key: "settings", icon: Settings, label: "Settings & privacy" },
                        { key: "help", icon: CircleHelp, label: "Help & support" },
                        { key: "display", icon: Moon, label: "Display & accessibility" },
                      ].map(({ key, icon: Icon, label }) => (
                        <button
                          key={key}
                          onClick={() => {
                            setProfileMenuOpen(false);
                            setActiveModal(key);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-forest-950 hover:bg-cream-200 transition-colors"
                        >
                          <Icon size={18} className="shrink-0" />
                          <span className="flex-1 text-left">{label}</span>
                          <ChevronRight size={16} className="text-forest-500 shrink-0" />
                        </button>
                      ))}
                    </div>

                    <div className="h-px bg-cream-200 my-2" />
                    <button
                      onClick={() => {
                        setProfileMenuOpen(false);
                        handleLogout();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-forest-950 hover:bg-cream-200 transition-colors"
                    >
                      <LogOut size={16} />
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 p-8 overflow-y-auto print:overflow-visible print:h-auto print:p-0">
          <Outlet />
        </main>
      </div>

      {activeModal && (
        <ProfileModal
          type={activeModal}
          onClose={() => setActiveModal(null)}
          user={user}
          navItems={navItems}
          navigate={navigate}
          largerText={largerText}
          setLargerText={setLargerText}
          reduceMotion={reduceMotion}
          setReduceMotion={setReduceMotion}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />
      )}
    </div>
  );
}

// Shared modal shell + per-type content for the three "Settings & privacy" /
// "Help & support" / "Display & accessibility" items in the header profile
// dropdown. Each one is genuinely functional (see below), not a placeholder.
function ProfileModal({ type, onClose, user, navItems, navigate, largerText, setLargerText, reduceMotion, setReduceMotion, darkMode, setDarkMode }) {
  const titles = {
    settings: "Settings & privacy",
    help: "Help & support",
    display: "Display & accessibility",
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-forest-950/40" onClick={onClose} />
      <div className="relative bg-cream-50 rounded-2xl shadow-[0_8px_32px_rgba(37,53,34,0.3)] w-full max-w-md max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-cream-50">
          <h2 className="font-display font-bold text-lg text-forest-950">{titles[type]}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-cream-200 flex items-center justify-center shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pb-5">
          {type === "settings" && <SettingsPanel user={user} />}
          {type === "help" && <HelpPanel navItems={navItems} navigate={navigate} onClose={onClose} />}
          {type === "display" && (
            <DisplayPanel
              largerText={largerText}
              setLargerText={setLargerText}
              reduceMotion={reduceMotion}
              setReduceMotion={setReduceMotion}
              darkMode={darkMode}
              setDarkMode={setDarkMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ user }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setSuccess("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-forest-500 font-semibold mb-2">Account</p>
        <div className="text-sm space-y-1">
          <p><span className="text-forest-600">Name:</span> {user?.name}</p>
          <p><span className="text-forest-600">Email:</span> {user?.email}</p>
          <p><span className="text-forest-600">Role:</span> {user?.role}</p>
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-forest-500 font-semibold mb-2">Change password</p>
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <input
            type="password"
            required
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-lg border border-cream-300 bg-cream-100 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="New password (min. 8 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-lg border border-cream-300 bg-cream-100 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-cream-300 bg-cream-100 px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          {success && <p className="text-xs text-forest-700 font-medium">{success}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-900 text-brand-50 text-sm font-semibold py-2 disabled:opacity-60"
          >
            {submitting ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}

function HelpPanel({ navItems, navigate, onClose }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-forest-700">
        Quick links to every section of the portal — pick one to jump straight there.
      </p>
      <div className="space-y-1">
        {navItems.map((item) => (
          <button
            key={item.to}
            onClick={() => {
              onClose();
              navigate(item.to);
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-forest-950 hover:bg-cream-200 transition-colors text-left"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cream-200 text-forest-900 text-sm">
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-forest-500 border-t border-cream-200 pt-3">
        Still stuck? Reach out to whoever manages this system at your office for further help.
      </p>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-4 py-2 cursor-pointer">
      <div>
        <p className="text-sm font-semibold text-forest-950">{label}</p>
        {description && <p className="text-xs text-forest-600 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${checked ? "bg-brand-900" : "bg-cream-300"}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-cream-50 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function DisplayPanel({ largerText, setLargerText, reduceMotion, setReduceMotion, darkMode, setDarkMode }) {
  return (
    <div className="divide-y divide-cream-200">
      <ToggleRow
        label="Dark mode"
        description="Switches the portal to a dark color scheme."
        checked={darkMode}
        onChange={setDarkMode}
      />
      <ToggleRow
        label="Larger text"
        description="Increases text size across the whole portal."
        checked={largerText}
        onChange={setLargerText}
      />
      <ToggleRow
        label="Reduce motion"
        description="Turns off transitions and animations."
        checked={reduceMotion}
        onChange={setReduceMotion}
      />
    </div>
  );
}