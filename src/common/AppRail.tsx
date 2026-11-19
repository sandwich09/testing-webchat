'use client';

import {
  Settings,
  MessageCircle,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { copy } from '@/common/common.constants';
import { cn, initialOf } from '@/common/common.logic';
import {
  RAIL_STRIP_HEIGHT,
  RAIL_WIDTH_COLLAPSED,
  RAIL_WIDTH_EXPANDED,
} from '@/common/layout.constants';
import { testIds } from '@/common/test-ids';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/common/ui/tooltip';

type AppRailProps = {
  /** Unread chats, from the contact list cache. 0 hides the badge. */
  unreadCount: number;
  /** Collapsed rail (wide screens only; the narrow top strip ignores it). */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onLogout: () => void;
};

const itemBase =
  'relative flex h-11 medium:h-10 shrink-0 items-center rounded-full text-body transition-colors';

/** Left menu, and the top strip when the screen is narrower than 720px (ui-screens 3.2 and 3.3). */
export function AppRail({ unreadCount, collapsed, onToggleCollapsed, onLogout }: AppRailProps) {
  const pathname = usePathname();
  const inboxActive = pathname.startsWith('/chats');
  const settingsActive = pathname.startsWith('/settings');
  const unreadText = unreadCount > 99 ? '99+' : String(unreadCount);

  // Below 720px the rail is an icon-only strip; from 720px the labels show unless collapsed.
  const labelClass = collapsed ? 'sr-only' : 'sr-only medium:not-sr-only medium:truncate';
  const itemPad = collapsed
    ? 'justify-center px-0 w-11 medium:w-10'
    : 'justify-center px-0 w-11 medium:w-auto medium:justify-start medium:gap-2.5 medium:px-3';

  const style = {
    '--rail-w': `${String(collapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH_EXPANDED)}px`,
    '--strip-h': `${String(RAIL_STRIP_HEIGHT)}px`,
  } as CSSProperties; // CSS custom properties are not part of CSSProperties

  function item(
    key: string,
    label: string,
    icon: LucideIcon,
    node: (className: string, content: ReactNode) => ReactElement,
    extra?: ReactNode,
    active = false,
  ) {
    const Icon = icon;
    const content = (
      <>
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span className={labelClass}>{label}</span>
        {extra}
      </>
    );
    const className = cn(
      itemBase,
      itemPad,
      active
        ? 'bg-surface font-bold text-fg shadow-[0_0_0_1px_var(--color-line)]'
        : 'text-muted hover:bg-selected',
    );
    const element = node(className, content);
    // A collapsed rail hides the labels, so they show as a tooltip on hover and focus.
    if (!collapsed) return <Fragment key={key}>{element}</Fragment>;
    return (
      <Tooltip key={key}>
        <TooltipTrigger asChild>{element}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  const unreadBadge =
    unreadCount > 0 ? (
      <>
        <span
          aria-hidden="true"
          data-testid={testIds.navInboxUnread}
          className={cn(
            'pointer-events-none inline-flex min-w-5 items-center justify-center rounded-full bg-accent-strong px-1.5 text-meta font-bold text-white tabular-nums',
            'absolute top-0.5 right-0 h-5',
            collapsed ? '' : 'medium:static medium:ml-auto',
          )}
        >
          {unreadText}
        </span>
        <span className="sr-only">{copy.nav.unreadAria.replace('{n}', String(unreadCount))}</span>
      </>
    ) : null;

  return (
    <nav
      aria-label={copy.nav.label}
      data-testid={testIds.appRail}
      data-collapsed={collapsed}
      style={style}
      className={cn(
        'flex shrink-0 items-center gap-1 border-b border-line bg-rail px-3',
        'h-(--strip-h) w-full',
        'medium:h-auto medium:w-(--rail-w) medium:flex-col medium:items-stretch medium:border-r medium:border-b-0 medium:py-3',
        collapsed ? 'medium:px-2' : 'medium:px-2.5',
      )}
    >
      <div
        data-testid={testIds.railBrand}
        className={cn(
          'flex min-w-0 items-center gap-2.5 medium:mb-2 medium:h-10',
          collapsed && 'medium:justify-center',
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-[9px] text-[16px] leading-none font-bold text-white"
          style={{ backgroundImage: 'var(--brand-gradient)' }}
        >
          {initialOf(copy.appName)}
        </span>
        <span
          className={cn(
            'hidden py-0.5 text-name font-bold whitespace-nowrap',
            collapsed ? '' : 'medium:block',
          )}
        >
          {copy.appName}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1 medium:ml-0 medium:flex-col medium:items-stretch">
        {item(
          'inbox',
          copy.nav.inbox,
          MessageCircle,
          (className, content) => (
            <Link
              href="/chats"
              className={className}
              aria-current={inboxActive ? 'page' : undefined}
              data-testid={testIds.navInbox}
            >
              {content}
            </Link>
          ),
          unreadBadge,
          inboxActive,
        )}
        {item(
          'settings',
          copy.nav.settings,
          Settings,
          (className, content) => (
            <Link
              href="/settings"
              className={className}
              aria-current={settingsActive ? 'page' : undefined}
              data-testid={testIds.navSettings}
            >
              {content}
            </Link>
          ),
          undefined,
          settingsActive,
        )}
      </div>

      <div className="flex items-center gap-1 medium:mt-auto medium:flex-col medium:items-stretch">
        {item('logout', copy.nav.logout, LogOut, (className, content) => (
          <button
            type="button"
            className={className}
            onClick={onLogout}
            data-testid={testIds.navLogout}
          >
            {content}
          </button>
        ))}
        <div className="hidden medium:contents">
          {item(
            'collapse',
            collapsed ? copy.nav.expand : copy.nav.collapse,
            collapsed ? PanelLeftOpen : PanelLeftClose,
            (className, content) => (
              <button
                type="button"
                className={className}
                aria-expanded={!collapsed}
                onClick={onToggleCollapsed}
                data-testid={testIds.railCollapse}
              >
                {content}
              </button>
            ),
          )}
        </div>
      </div>
    </nav>
  );
}
