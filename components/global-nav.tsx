"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type GlobalNavLink = {
  href: string;
  label: string;
};

export type GlobalNavItem = {
  label: string;
  href?: string;
  children?: GlobalNavLink[];
};

type GlobalNavProps = {
  items: GlobalNavItem[];
  mobileTitle?: string;
  initiallyExpandedGroups?: string[];
};

export default function GlobalNav({
  items,
  mobileTitle = "Navigation",
  initiallyExpandedGroups = [],
}: GlobalNavProps) {
  const desktopLinks = useMemo(
    () =>
      items.flatMap((item) => {
        if (item.href) {
          return [{ href: item.href, label: item.label }];
        }
        return item.children ?? [];
      }),
    [items],
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileNavExpanded, setMobileNavExpanded] = useState<
    Record<string, boolean>
  >(() =>
    Object.fromEntries(initiallyExpandedGroups.map((group) => [group, true])),
  );

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileNavOpen]);

  return (
    <>
      <section className="panel detail-nav link-bar global-nav-bar">
        <button
          type="button"
          className="global-nav-toggle"
          aria-label="Open menu"
          aria-expanded={mobileNavOpen}
          aria-controls="global-mobile-nav"
          onClick={() => setMobileNavOpen(true)}
        >
          <span aria-hidden="true">☰</span>
          <span>Menu</span>
        </button>
        <div className="global-nav-desktop-links">
          {desktopLinks.map((item) => (
            <Link key={item.href} href={item.href} className="table-link">
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      {mobileNavOpen && (
        <div
          className="global-nav-backdrop"
          onClick={() => setMobileNavOpen(false)}
          role="presentation"
        >
          <aside
            id="global-mobile-nav"
            className="global-nav-sidebar panel"
            role="dialog"
            aria-modal="true"
            aria-label={mobileTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="global-nav-sidebar-head">
              <h2>{mobileTitle}</h2>
              <button
                type="button"
                className="global-nav-close"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
              >
                ×
              </button>
            </div>
            <nav className="global-nav-sidebar-links">
              {items.map((item) =>
                item.href ? (
                  <Link
                    key={`mobile-${item.href}`}
                    href={item.href}
                    className="table-link global-nav-item"
                    onClick={() => setMobileNavOpen(false)}
                  >
                    <span>{item.label}</span>
                  </Link>
                ) : (
                  <div key={`mobile-group-${item.label}`} className="global-nav-group">
                    <button
                      type="button"
                      className="global-nav-group-toggle"
                      aria-expanded={Boolean(mobileNavExpanded[item.label])}
                      onClick={() =>
                        setMobileNavExpanded((prev) => ({
                          ...prev,
                          [item.label]: !prev[item.label],
                        }))
                      }
                    >
                      <span>{item.label}</span>
                      <span
                        className={`global-nav-group-chevron${
                          mobileNavExpanded[item.label] ? " open" : ""
                        }`}
                        aria-hidden="true"
                      >
                        ▾
                      </span>
                    </button>
                    {mobileNavExpanded[item.label] && (
                      <div className="global-nav-submenu">
                        {(item.children ?? []).map((child) => (
                          <Link
                            key={`mobile-child-${child.href}`}
                            href={child.href}
                            className="table-link global-nav-subitem"
                            onClick={() => setMobileNavOpen(false)}
                          >
                            <span>{child.label}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              )}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
