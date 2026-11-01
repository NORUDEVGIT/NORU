import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Search,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { NoruLogo } from "@/core/components/noru-logo";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";

/* ------------------------------------------------------------------ */
/* Design tokens (brown / gold)                                        */
/* ------------------------------------------------------------------ */

const BROWN = "#2a1810";
const GOLD = "#c9a24a";

// Gold diamond strip that sits between the brown bar and the white module row.
const DIAMOND_STRIP = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='14' height='8' viewBox='0 0 14 8'>" +
    "<polygon points='7,0 14,4 7,8 0,4' fill='#c9a24a'/>" +
    "<polygon points='7,2 10,4 7,6 4,4' fill='#f3e9d7' fill-opacity='.55'/></svg>",
)}")`;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type HeaderProperty = { id: string; name: string; status?: string };

export type SearchableModule = {
  key: string;
  title: string;
  to: string;
  search?: Record<string, string>;
  icon: LucideIcon;
  /** Small grey hint on the right, e.g. "PMS" or "Restaurant Management". */
  group?: string;
};

/** An entry in the white module row, or in its "More" menu. */
export type HeaderNavItem = {
  key: string;
  title: string;
  to: string;
  search?: Record<string, string>;
  icon?: LucideIcon;
  /** Match the path exactly (use for home-style routes that prefix other routes). */
  exact?: boolean;
  group?: string;
};

/** A package in the dropdown under the logo (name only). */
export type HeaderPackage = { key: string; title: string; to: string };

export type HeaderNotification = {
  id: string;
  title: string;
  body?: string;
  time?: string;
  unread?: boolean;
};

type Props = {
  /** Where the logo links to. Defaults to the property home. */
  logoHref?: string;
  /** Opens the mobile drawer. Omit to hide the menu button. */
  onOpenNavigation?: () => void;
  properties: HeaderProperty[];
  activePropertyId?: string;
  onSelectProperty: (id: string) => void;
  modules: SearchableModule[];
  /** Always-visible entries in the module row. */
  navItems?: HeaderNavItem[];
  /** Everything else, shown under "More". */
  moreItems?: HeaderNavItem[];
  /** Packages listed in the dropdown beside the logo. */
  packages?: HeaderPackage[];
  notifications?: HeaderNotification[];
  onOpenGuide?: () => void;
  userEmail?: string;
  userRole?: string;
  settingsHref?: string;
  onSignOut: () => void;
  /** Extra controls placed right after the mobile menu button. */
  leading?: ReactNode;
  /** Extra header content placed before the right-side controls. */
  trailing?: ReactNode;
};

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

const THEME_KEY = "noru-theme";

function useTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      /* storage can be unavailable */
    }
    const initial =
      stored === "dark" ||
      (stored === null && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    setDark(initial);
    document.documentElement.classList.toggle("dark", initial);
  }, []);

  function toggle() {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return { dark, toggle };
}

/* ------------------------------------------------------------------ */
/* Packages menu (caret under the logo, names only)                    */
/* ------------------------------------------------------------------ */

function PackagesMenu({ packages }: { packages: HeaderPackage[] }) {
  if (packages.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Available packages"
          className="flex size-7 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a24a]"
        >
          <ChevronDown className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Available packages
        </DropdownMenuLabel>
        {packages.map((pkg) => (
          <DropdownMenuItem key={pkg.key} asChild>
            <Link to={pkg.to}>{pkg.title}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Hotel name (switcher only when the account has several properties)  */
/* ------------------------------------------------------------------ */

function PropertyName({
  properties,
  activeId,
  onSelect,
}: {
  properties: HeaderProperty[];
  activeId?: string;
  onSelect: (id: string) => void;
}) {
  const active = properties.find((p) => p.id === activeId) ?? properties[0];
  const name = active?.name ?? "Restaurant";
  const nameClass = "min-w-0 max-w-[200px] truncate text-sm font-medium text-white/90";

  if (properties.length <= 1) {
    return <p className={cn("hidden sm:block", nameClass)}>{name}</p>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch property"
          className="hidden items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a24a] sm:flex"
        >
          <span className={nameClass}>{name}</span>
          <ChevronDown className="size-4 shrink-0 text-white/70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Switch property
        </DropdownMenuLabel>
        {properties.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => onSelect(p.id)} className="gap-2">
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            {p.id === active?.id ? <Check className="size-4 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Module search                                                       */
/* ------------------------------------------------------------------ */

function ModuleSearch({ modules }: { modules: SearchableModule[] }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return modules.slice(0, 8);
    return modules
      .filter((m) => `${m.title} ${m.group ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [modules, query]);

  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Ctrl/Cmd + K focuses the search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(m: SearchableModule) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    void navigate({ to: m.to, ...(m.search ? { search: m.search } : {}) } as never);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && results[highlight]) {
      e.preventDefault();
      go(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={wrapRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/50" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls="module-search-results"
        aria-label="Search modules"
        placeholder="Search modules"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="h-10 w-full rounded-xl border border-white/10 bg-white/10 pl-10 pr-16 text-sm text-white outline-none transition-colors placeholder:text-white/60 focus-visible:border-[#c9a24a] focus-visible:ring-2 focus-visible:ring-[#c9a24a]/40 [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md bg-[#c9a24a]/25 px-1.5 py-0.5 font-sans text-[10px] font-medium text-[#e8cf8f] sm:block">
        Ctrl K
      </kbd>

      {open ? (
        <ul
          id="module-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">
              No module matches “{query}”. Try a shorter name.
            </li>
          ) : (
            results.map((m, i) => (
              <li key={`${m.key}-${m.to}`} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => go(m)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                    i === highlight ? "bg-accent text-accent-foreground" : "text-foreground",
                  )}
                >
                  <m.icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  {m.group ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{m.group}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

function NotificationsMenu({ items }: { items: HeaderNotification[] }) {
  const unread = items.filter((n) => n.unread).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex size-9 items-center justify-center rounded-full text-[#e8cf8f] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a24a]"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell className="size-5" />
          {unread > 0 ? (
            <span
              className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-4"
              style={{ backgroundColor: GOLD, color: BROWN }}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            You’re all caught up. New alerts will show here.
          </p>
        ) : (
          items.map((n) => (
            <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5 py-2">
              <span className={cn("text-sm", n.unread ? "font-semibold" : "font-medium")}>
                {n.title}
              </span>
              {n.body ? <span className="text-xs text-muted-foreground">{n.body}</span> : null}
              {n.time ? <span className="text-[11px] text-muted-foreground">{n.time}</span> : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

function ProfileMenu({
  email,
  role,
  settingsHref,
  onSignOut,
}: {
  email?: string;
  role?: string;
  settingsHref?: string;
  onSignOut: () => void;
}) {
  const initial = (email?.trim()[0] ?? "?").toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex size-9 items-center justify-center rounded-full text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8cf8f]"
          style={{ backgroundColor: GOLD, color: BROWN }}
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate text-sm font-medium">{email || "Signed in"}</p>
          {role ? (
            <p className="text-xs font-normal capitalize text-muted-foreground">{role}</p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {settingsHref ? (
          <DropdownMenuItem asChild>
            <Link to={settingsHref} className="gap-2">
              <Settings className="size-4" /> Settings
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onSignOut} className="gap-2">
          <LogOut className="size-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Module row (white) with More                                        */
/* ------------------------------------------------------------------ */

function isItemActive(item: HeaderNavItem, pathname: string) {
  const base = item.to.replace(/\/$/, "");
  if (pathname === base || pathname === `${base}/`) return true;
  return !item.exact && pathname.startsWith(`${base}/`);
}

function ModuleRow({
  items,
  moreItems,
}: {
  items: HeaderNavItem[];
  moreItems: HeaderNavItem[];
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const moreActive = moreItems.some((m) => isItemActive(m, pathname));

  if (items.length === 0 && moreItems.length === 0) return null;

  return (
    <nav
      aria-label="Modules"
      className="flex items-center gap-1 overflow-x-auto border-b border-border bg-background px-3 py-2 sm:px-6"
    >
      {items.map((item) => {
        const active = isItemActive(item, pathname);
        return (
          <Link
            key={item.key}
            to={item.to}
            {...(item.search ? { search: item.search } : {})}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a24a]",
              active
                ? "bg-[#2a1810] text-white"
                : "text-foreground/70 hover:bg-muted hover:text-foreground",
            )}
          >
            {item.title}
            {active ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-3.5 bottom-1 h-0.5 rounded-full"
                style={{ backgroundColor: GOLD }}
              />
            ) : null}
          </Link>
        );
      })}

      {moreItems.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "relative flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a24a]",
                moreActive
                  ? "bg-[#2a1810] text-white"
                  : "text-foreground/70 hover:bg-muted hover:text-foreground",
              )}
            >
              More
              <ChevronDown className="size-3.5" />
              {moreActive ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3.5 bottom-1 h-0.5 rounded-full"
                  style={{ backgroundColor: GOLD }}
                />
              ) : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 w-64 overflow-y-auto">
            {moreItems.map((m) => (
              <DropdownMenuItem key={`${m.key}-${m.to}`} asChild>
                <Link
                  to={m.to}
                  {...(m.search ? { search: m.search } : {})}
                  className="flex items-center gap-2"
                >
                  {m.icon ? <m.icon className="size-4 shrink-0" /> : null}
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  {m.group ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{m.group}</span>
                  ) : null}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

export function AppTopHeader({
  logoHref = "/restaurant/home",
  onOpenNavigation,
  properties,
  activePropertyId,
  onSelectProperty,
  modules,
  navItems = [],
  moreItems = [],
  packages = [],
  notifications = [],
  onOpenGuide,
  userEmail,
  userRole,
  settingsHref,
  onSignOut,
  leading,
  trailing,
}: Props) {
  const { dark, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40">
      {/* Brown bar */}
      <div style={{ backgroundColor: BROWN }} className="text-white">
        <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6">
          {/* 1 · Logo and brand */}
          {onOpenNavigation ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Open navigation"
              onClick={onOpenNavigation}
            >
              <MenuIcon className="size-5" />
            </Button>
          ) : null}
          {leading}
          <Link
            to={logoHref}
            aria-label="Go to dashboard"
            className="flex shrink-0 items-center gap-2 font-display text-lg"
          >
            <NoruLogo size="sm" wordmarkClassName="text-white" />
          </Link>

          {/* 2 · Packages dropdown (under the logo) and hotel name */}
          <PackagesMenu packages={packages} />
          <span className="hidden h-6 w-px bg-white/20 sm:block" aria-hidden="true" />
          <PropertyName
            properties={properties}
            activeId={activePropertyId}
            onSelect={onSelectProperty}
          />

          {/* 3 · Module search */}
          <div className="hidden flex-1 justify-center px-2 md:flex">
            <ModuleSearch modules={modules} />
          </div>

          {/* 4 · Notifications, guide, theme, profile */}
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 md:ml-0">
            {trailing}
            <NotificationsMenu items={notifications} />
            <button
              type="button"
              onClick={onOpenGuide}
              className="hidden h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a24a] sm:flex"
              style={{ borderColor: GOLD }}
            >
              <BookOpen className="size-4" style={{ color: GOLD }} />
              Guide
            </button>
            <button
              type="button"
              aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
              onClick={toggle}
              className="flex size-9 items-center justify-center rounded-full text-[#e8cf8f] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a24a]"
            >
              {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <ProfileMenu
              email={userEmail}
              role={userRole}
              settingsHref={settingsHref}
              onSignOut={onSignOut}
            />
          </div>
        </div>

        {/* Search drops to its own row on small screens. */}
        <div className="px-3 pb-3 md:hidden">
          <ModuleSearch modules={modules} />
        </div>
      </div>

      {/* Gold diamond strip */}
      <div
        aria-hidden="true"
        className="h-2"
        style={{
          backgroundColor: BROWN,
          backgroundImage: DIAMOND_STRIP,
          backgroundRepeat: "repeat-x",
          backgroundSize: "14px 8px",
        }}
      />

      {/* White module row */}
      <ModuleRow items={navItems} moreItems={moreItems} />
    </header>
  );
}