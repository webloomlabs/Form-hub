"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Change theme">
            {/*
              Both icons are rendered and toggled by the `dark` class that
              next-themes puts on <html>. The server can't know the visitor's
              theme, so doing this in CSS avoids both a hydration mismatch and
              a setState-in-effect.
            */}
            <Sun className="size-4 dark:hidden" />
            <Moon className="hidden size-4 dark:block" />
          </Button>
        }
      />
      {/* Content mounts only on open, so reading `theme` here is safe. */}
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup
          value={theme ?? "system"}
          onValueChange={setTheme}
        >
          {OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.icon className="size-4" />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
