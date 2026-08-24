import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "../../lib/utils"

const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuGroup = DropdownMenuPrimitive.Group

const DropdownMenuTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger> & {
    showChevron?: boolean
  }
>(({ className, children, showChevron = true, ...props }, ref) => (
  <DropdownMenuPrimitive.Trigger
    ref={ref}
    className={cn(
      "group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg h-9 px-3 text-sm font-medium transition-all",
      "bg-secondary/50 border border-input text-foreground",
      "hover:border-primary/40 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=open]:border-primary/60 data-[state=open]:bg-background data-[state=open]:shadow-[0_0_0_4px_hsl(217_91%_60%/0.14)]",
      className
    )}
    {...props}
  >
    {children}
    {showChevron && (
      <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
    )}
  </DropdownMenuPrimitive.Trigger>
))
DropdownMenuTrigger.displayName = "DropdownMenuTrigger"

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[10rem] overflow-hidden rounded-xl border border-border/60 bg-popover p-1.5 text-popover-foreground shadow-xl",
        "animate-scale-in origin-[var(--radix-dropdown-menu-content-transform-origin)]",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = "DropdownMenuContent"

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    selected?: boolean
  }
>(({ className, children, selected, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors",
      "focus:bg-accent/10 focus:text-accent data-[highlighted]:bg-accent/10 data-[highlighted]:text-accent",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      selected && "font-semibold text-primary bg-primary/5",
      className
    )}
    {...props}
  >
    {children}
    {selected && <Check className="w-4 h-4 ml-auto text-primary shrink-0" />}
  </DropdownMenuPrimitive.Item>
))
DropdownMenuItem.displayName = "DropdownMenuItem"

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn("px-2.5 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide", className)}
    {...props}
  />
))
DropdownMenuLabel.displayName = "DropdownMenuLabel"

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1.5 my-1 h-px bg-border/60", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = "DropdownMenuSeparator"

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
}
