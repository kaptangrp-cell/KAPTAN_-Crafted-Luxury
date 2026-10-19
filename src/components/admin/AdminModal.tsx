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
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            const form = event.currentTarget.querySelector("form");
            const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
            if (form && submit && !submit.disabled) {
              event.preventDefault();
              form.requestSubmit(submit);
            }
          }
        }}
        onPointerDownOutside={(event) => event.preventDefault()}
        className="admin-workspace max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-gold/25 bg-[#1A1A1A] text-white sm:max-w-3xl"
      >
        <DialogTitle className="sticky top-0 z-20 border-b border-gold/15 bg-[#1A1A1A] pb-4 pr-8 font-serif text-xl text-gold">
          {title}
        </DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
