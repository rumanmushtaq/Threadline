"use client";

import { Eye, EyeOff, Lock, Mail, User, type LucideIcon } from "lucide-react";
import { forwardRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type InputProps = React.ComponentProps<typeof Input>;

const ICONS: Record<string, LucideIcon> = { mail: Mail, lock: Lock, user: User };

/** Input with a leading icon, the roomy style used on every sign-in page. */
export const IconInput = forwardRef<HTMLInputElement, InputProps & { icon: keyof typeof ICONS }>(function IconInput({ icon, className, ...props }, ref) {
  const Icon = ICONS[icon];
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input ref={ref} className={cn("h-11 rounded-xl pl-10", className)} {...props} />
    </div>
  );
});

/** Password input with a show/hide eye and a Caps Lock warning. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, "type">>(function PasswordInput({ className, onKeyDown, onKeyUp, ...props }, ref) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const check = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState("CapsLock"));
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={ref}
          type={show ? "text" : "password"}
          className={cn("h-11 rounded-xl pr-11 pl-10", className)}
          onKeyDown={(e) => (check(e), onKeyDown?.(e))}
          onKeyUp={(e) => (check(e), onKeyUp?.(e))}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          // Worded without "password" so the field keeps its own label in screen readers and tests.
          aria-label={show ? "Hide what you typed" : "Show what you typed"}
          aria-pressed={show}
          className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {caps && <p className="text-xs text-warning-foreground">Caps Lock is on.</p>}
    </div>
  );
});
