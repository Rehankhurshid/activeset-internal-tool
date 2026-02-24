'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ModeToggle } from '@/components/mode-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import {
  Home,
  LogOut,
  User,
  Menu,
  FolderOpen,
  FileText,
  Sparkles,
  Lock,
  Loader2,
  MonitorSmartphone
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScanActivityIndicator } from '@/components/navigation/ScanActivityIndicator';

interface AppNavigationProps {
  title?: string;
  showBackButton?: boolean;
  backHref?: string;
  children?: React.ReactNode;
  className?: string;
  proposalAccess?: boolean;
  projectLinksAccess?: boolean;
  accessLoading?: boolean;
}

export function AppNavigation({
  title,
  showBackButton = false,
  backHref = '/',
  children,
  className,
  proposalAccess = false,
  projectLinksAccess = true,
  accessLoading = false,
}: AppNavigationProps) {
  const pathname = usePathname();
  const { user, logout, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Don't render navigation if user is not authenticated or still loading
  if (loading || !user) {
    return null;
  }

  const isHomePage = pathname === '/';
  return (
    <header className={cn(
      "sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
      className
    )}>
      <div className="container flex h-16 items-center px-4 sm:px-6 lg:px-8">
        {/* Left Section */}
        <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
          {showBackButton && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
              <Link href={backHref}>
                <Home className="h-4 w-4" />
                <span className="sr-only">Back to home</span>
              </Link>
            </Button>
          )}

          {title && (
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-lg sm:text-xl font-semibold truncate">{title}</h1>
            </div>
          )}

          {/* Desktop Navigation */}
          {isHomePage && (
            <nav className="hidden md:flex items-center gap-1 ml-4">
              <NavigationLink
                href="/modules/project-links"
                icon={<FolderOpen className="h-4 w-4" />}
                label="Client Projects"
                hasAccess={projectLinksAccess}
                loading={accessLoading}
              />
              <NavigationLink
                href="/modules/proposal"
                icon={<FileText className="h-4 w-4" />}
                label="Proposals"
                hasAccess={proposalAccess}
                loading={accessLoading}
                badge={<Sparkles className="h-3 w-3" />}
              />
              <NavigationLink
                href="/modules/screenshot-runner"
                icon={<MonitorSmartphone className="h-4 w-4" />}
                label="Screenshot Runner"
                hasAccess={projectLinksAccess}
                loading={accessLoading}
              />
            </nav>
          )}
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2 sm:gap-3">
          <ScanActivityIndicator />

          {/* User Info - Desktop */}
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span className="max-w-[200px] truncate">{user?.email}</span>
          </div>

          <ModeToggle />

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <User className="h-4 w-4" />
                <span className="sr-only">User menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.displayName || 'User'}</p>
                  <p className="text-xs leading-none text-muted-foreground truncate">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/" className="cursor-pointer">
                  <Home className="mr-2 h-4 w-4" />
                  Dashboard
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile Menu */}
          {isHomePage && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden h-8 w-8">
                  <Menu className="h-4 w-4" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                <div className="flex flex-col gap-4 mt-4">
                  <div className="flex items-center gap-2 pb-4 border-b">
                    <User className="h-4 w-4" />
                    <div className="flex flex-col min-w-0">
                      <p className="text-sm font-medium truncate">{user?.displayName || 'User'}</p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    </div>
                  </div>

                  <nav className="flex flex-col gap-2">
                    <MobileNavLink
                      href="/modules/project-links"
                      icon={<FolderOpen className="h-4 w-4" />}
                      label="Client Projects"
                      hasAccess={projectLinksAccess}
                      loading={accessLoading}
                      onClick={() => setMobileMenuOpen(false)}
                    />
                    <MobileNavLink
                      href="/modules/proposal"
                      icon={<FileText className="h-4 w-4" />}
                      label="Proposals"
                      hasAccess={proposalAccess}
                      loading={accessLoading}
                      badge={<Sparkles className="h-3 w-3" />}
                      onClick={() => setMobileMenuOpen(false)}
                    />
                    <MobileNavLink
                      href="/modules/screenshot-runner"
                      icon={<MonitorSmartphone className="h-4 w-4" />}
                      label="Screenshot Runner"
                      hasAccess={projectLinksAccess}
                      loading={accessLoading}
                      onClick={() => setMobileMenuOpen(false)}
                    />
                  </nav>

                  <div className="pt-4 border-t">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        logout();
                        setMobileMenuOpen(false);
                      }}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          )}

          {children}
        </div>
      </div>
    </header>
  );
}

interface NavigationLinkProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  hasAccess: boolean;
  loading?: boolean;
  badge?: React.ReactNode;
}

function NavigationLink({ href, icon, label, hasAccess, loading = false, badge }: NavigationLinkProps) {
  const pathname = usePathname();
  const isActive = pathname?.startsWith(href);

  if (loading) {
    return (
      <Button variant="ghost" size="sm" className="gap-2 opacity-70" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="hidden lg:inline">{label}</span>
      </Button>
    );
  }

  if (!hasAccess) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 opacity-50 cursor-not-allowed"
        disabled
      >
        <Lock className="h-4 w-4" />
        <span className="hidden lg:inline">{label}</span>
      </Button>
    );
  }

  return (
    <Button
      variant={isActive ? "secondary" : "ghost"}
      size="sm"
      className="gap-2"
      asChild
    >
      <Link href={href}>
        {icon}
        <span className="hidden lg:inline">{label}</span>
        {badge && (
          <Badge variant="secondary" className="ml-1 h-4 px-1">
            {badge}
          </Badge>
        )}
      </Link>
    </Button>
  );
}

interface MobileNavLinkProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  hasAccess: boolean;
  loading?: boolean;
  badge?: React.ReactNode;
  onClick?: () => void;
}

function MobileNavLink({ href, icon, label, hasAccess, loading = false, badge, onClick }: MobileNavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname?.startsWith(href);

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg opacity-70">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg opacity-50 cursor-not-allowed">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground ml-auto">No access</span>
      </div>
    );
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {icon}
      <span className="text-sm font-medium flex-1">{label}</span>
      {badge && (
        <Badge variant="secondary" className="h-5">
          {badge}
        </Badge>
      )}
    </Link>
  );
}
