"use client";
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export function MenuContent({ className, ...p }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content sideOffset={6} align="end" className={cn("z-50 min-w-[10rem] rounded-md border bg-popover p-1 text-sm shadow-md", className)} {...p} />
    </M.Portal>
  );
}
export function MenuItem({ className, ...p }: React.ComponentProps<typeof M.Item>) {
  return <M.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-muted [&_svg]:size-4", className)} {...p} />;
}
export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-border" />;
