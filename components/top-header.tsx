"use client"

import { Bell, ChevronDown, Hexagon } from "lucide-react"
import { SearchBar } from "./search-bar"
import { useN3X7 } from "@/lib/store"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function TopHeader() {
  const { user, signOut } = useN3X7()
  const name = user?.name ?? "Guest"
  const initials = name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase())
    .join("")
    .slice(0, 2)

  return (
    <header className="relative z-10 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <Hexagon className="size-6 text-primary" fill="currentColor" />
        <span className="text-sm font-semibold">
          N3X7<span className="text-primary">.bot</span>
        </span>
      </div>

      <div className="flex flex-1 justify-center md:justify-start">
        <SearchBar />
      </div>

      <button
        className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="size-4.5" />
        <span className="absolute top-2 right-2 size-1.5 rounded-full bg-success" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 transition-colors hover:bg-accent">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-left leading-tight sm:block">
            <p className="text-xs font-medium text-foreground">{name}</p>
            <p className="text-[11px] text-muted-foreground">{user?.role}</p>
          </div>
          <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Billing & Plan</DropdownMenuItem>
          <DropdownMenuItem>Saved searches</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
