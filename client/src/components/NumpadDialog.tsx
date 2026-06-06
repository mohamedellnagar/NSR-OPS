import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Delete, Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface NumpadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
  label?: string;
}

/**
 * NumpadDialog - A popup numeric keypad for entering decimal numbers
 * Shows buttons 0-9, decimal point, backspace, and confirm
 */
export function NumpadDialog({
  open,
  onOpenChange,
  value,
  onValueChange,
  onConfirm,
  label,
}: NumpadDialogProps) {
  const { language } = useLanguage();
  const ar = language === "ar";

  const handleDigit = (digit: string) => {
    // Prevent multiple decimal points
    if (digit === "." && value.includes(".")) return;
    onValueChange(value + digit);
  };

  const handleBackspace = () => {
    onValueChange(value.slice(0, -1));
  };

  const handleClear = () => {
    onValueChange("");
  };

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const digits = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "⌫"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px] p-0" dir={ar ? "rtl" : "ltr"}>
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-center text-base">
            {label || (ar ? "أدخل القيمة" : "Enter Value")}
          </DialogTitle>
        </DialogHeader>

        {/* Display */}
        <div className="px-4 pb-3">
          <div className="bg-muted rounded-lg p-4 text-center">
            <div className="text-3xl font-bold font-mono text-foreground min-h-[48px] flex items-center justify-center">
              {value || "0"}
            </div>
          </div>
        </div>

        {/* Numpad Grid */}
        <div className="grid grid-cols-3 gap-2 p-4 pt-0">
          {digits.map((d, i) => {
            if (d === "⌫") {
              return (
                <Button
                  key={i}
                  variant="outline"
                  size="lg"
                  className="h-14 text-lg font-semibold"
                  onClick={handleBackspace}
                >
                  <Delete size={20} />
                </Button>
              );
            }
            return (
              <Button
                key={i}
                variant="outline"
                size="lg"
                className="h-14 text-lg font-semibold"
                onClick={() => handleDigit(d)}
              >
                {d}
              </Button>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 p-4 pt-0">
          <Button variant="outline" size="lg" onClick={handleClear}>
            {ar ? "مسح" : "Clear"}
          </Button>
          <Button size="lg" onClick={handleConfirm} className="gap-2">
            <Check size={18} />
            {ar ? "تأكيد" : "Confirm"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
