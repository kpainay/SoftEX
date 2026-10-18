import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** A small label above the title, such as the kind of thing being created. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Buttons pinned to the bottom (the body scrolls above them). */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Hide the title visually (it is still read out). */
  hideTitle?: boolean;
}

function Eyebrow({ children }: { children?: ReactNode }) {
  return children ? <p className="text-xs font-semibold tracking-wide text-primary uppercase">{children}</p> : null;
}

/** A centred dialog for a focused task. `wide` for forms with two columns or previews. */
export function Modal({ open, onClose, title, eyebrow, description, footer, children, className, hideTitle, wide = false }: OverlayProps & { wide?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={cn('flex max-h-[min(90dvh,52rem)] flex-col gap-4 overflow-hidden', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg', className)}>
        <DialogHeader className={cn('pr-8', hideTitle && 'sr-only')}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6 pb-1">{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

/** A panel that slides in from the side: details, filters, settings for one thing. */
export function SidePanel({
  open,
  onClose,
  title,
  eyebrow,
  description,
  footer,
  children,
  className,
  hideTitle,
  side = 'right',
  ...rest
}: OverlayProps & { side?: 'left' | 'right'; 'aria-label'?: string }) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side={side} className={cn('w-full gap-0 sm:max-w-xl', className)} aria-label={rest['aria-label']}>
        <SheetHeader className={cn('border-b pr-12', hideTitle && 'sr-only')}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <SheetFooter className="border-t">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}

/** A sheet that rises from the bottom of the screen, for phones. */
export function BottomDrawer({ open, onClose, title, eyebrow, description, footer, children, className, hideTitle }: OverlayProps) {
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()} showSwipeHandle>
      <DrawerContent className={className}>
        <DrawerHeader className={cn(hideTitle && 'sr-only')}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <DrawerFooter>{footer}</DrawerFooter>}
      </DrawerContent>
    </Drawer>
  );
}

/** A dialog on larger screens and a bottom drawer on phones. */
export function ResponsiveDialog(props: OverlayProps & { wide?: boolean }) {
  const mobile = useIsMobile();
  return mobile ? <BottomDrawer {...props} /> : <Modal {...props} />;
}
