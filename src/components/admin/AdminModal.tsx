import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function AdminModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        onPointerDownOutside={(event) => event.preventDefault()}
        className="admin-workspace max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-gold/25 bg-[#1A1A1A] text-white sm:max-w-3xl"
      >
        <DialogTitle className="border-b border-gold/15 pb-4 pr-8 font-serif text-xl text-gold">
          {title}
        </DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
