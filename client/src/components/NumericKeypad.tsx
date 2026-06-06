import { useState, useRef, useEffect } from "react";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface NumericKeypadProps {
  value: string | number;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function NumericKeypad({ value, onChange, className, disabled }: NumericKeypadProps) {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState(String(value ?? ""));
  const [hasDecimal, setHasDecimal] = useState(false);

  // Sync display when external value changes
  useEffect(() => {
    setDisplay(String(value ?? ""));
    setHasDecimal(String(value ?? "").includes("."));
  }, [value]);

  const handleKey = (key: string) => {
    if (key === "C") {
      setDisplay("0");
      setHasDecimal(false);
      onChange("0");
      return;
    }
    if (key === "⌫") {
      const next = display.length > 1 ? display.slice(0, -1) : "0";
      setDisplay(next);
      setHasDecimal(next.includes("."));
      onChange(next);
      return;
    }
    if (key === ".") {
      if (hasDecimal) return;
      const next = display === "0" ? "0." : display + ".";
      setDisplay(next);
      setHasDecimal(true);
      onChange(next);
      return;
    }
    if (key === "✓") {
      setOpen(false);
      return;
    }
    // digit
    const next = display === "0" ? key : display + key;
    setDisplay(next);
    onChange(next);
  };

  const keys = [
    ["7", "8", "9"],
    ["4", "5", "6"],
    ["1", "2", "3"],
    [".", "0", "⌫"],
    ["C", "✓"],
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
            className
          )}
          tabIndex={-1}
          aria-label="فتح لوحة الأرقام"
        >
          <Calculator className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-48 p-2 shadow-xl"
        side="bottom"
        align="end"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Display */}
        <div className="bg-muted rounded px-3 py-2 text-right text-lg font-mono font-semibold mb-2 min-h-[2.5rem] overflow-hidden text-ellipsis whitespace-nowrap">
          {display || "0"}
        </div>
        {/* Keys */}
        <div className="grid gap-1">
          {keys.map((row, ri) => (
            <div key={ri} className={cn("grid gap-1", row.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
              {row.map((key) => (
                <button
                  key={key}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleKey(key);
                  }}
                  className={cn(
                    "rounded py-2 text-sm font-medium transition-colors select-none",
                    key === "✓"
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : key === "C"
                      ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                      : key === "⌫"
                      ? "bg-muted-foreground/10 text-muted-foreground hover:bg-muted-foreground/20"
                      : "bg-muted hover:bg-muted/70 text-foreground"
                  )}
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
