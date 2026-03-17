import { NavLink } from 'react-router-dom';
import { Settings, LayoutDashboard, MessageSquare, Wallet } from 'lucide-react';
import { cn } from '../../lib/utils';

const setupNavItems = [
  { to: '/setup', label: 'Setup', icon: Settings },
];

const mainNavItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
];

interface Props {
  setupDone: boolean;
  onClose?: () => void;
}

export default function NavItems({ setupDone, onClose }: Props) {
  const navItems = setupDone ? mainNavItems : setupNavItems;

  return (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onClose}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-white/[0.08] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-white/[0.08] hover:text-[var(--text-primary)]',
            )
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
